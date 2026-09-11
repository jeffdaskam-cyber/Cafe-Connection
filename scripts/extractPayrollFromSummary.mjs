#!/usr/bin/env node
/**
 * Read payroll-deduct tender totals out of InfoGenesis Sales Summary workbooks.
 *
 * Why this exists:
 *   daily_metrics carries payroll: null for Oct 2025 - Feb 2026, because those
 *   days were uploaded as PDFs and parsePdf cannot read the TENDERS section.
 *   The archived period summaries for those months are Excel, and Excel the
 *   parser can read. This recovers the figures from them.
 *
 * Nothing is invented or apportioned. Each sheet is run through the same
 * parseExcel that the upload endpoint and scripts/backfillSalesPayroll.mjs use,
 * so a recovered figure is identical to what an upload of that sheet would have
 * written. A sheet that will not yield a payroll figure is reported, not
 * guessed at, and leaves its month marked incomplete.
 *
 * These period workbooks carry one worksheet per campus, and parseExcel reads
 * only worksheets[0]. Each sheet is therefore split into its own single-sheet
 * workbook and parsed separately — uploading such a file whole would silently
 * capture the first campus and drop the rest.
 *
 * Usage:
 *   node scripts/extractPayrollFromSummary.mjs <file.xlsx> [...]
 *   node scripts/extractPayrollFromSummary.mjs --json=out.json data/*.xlsx
 *
 * Options:
 *   --json=<path>   Also write the parsed figures to <path> as JSON.
 */

import ExcelJS from "exceljs";
import { realpath, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { parseExcel } from "../api/_lib/salesReport.mjs";

const PAYROLL_DISCOUNT_RATE = 15 / 85;

/** Parse every worksheet of a summary workbook as its own single-sheet file. */
export async function parseSummaryWorkbook(path) {
  const probe = new ExcelJS.Workbook();
  await probe.xlsx.readFile(path);
  const sheetIds = probe.worksheets.map(w => w.id);
  if (sheetIds.length === 0) throw new Error(`${path}: workbook has no worksheets.`);

  const parsed = [];
  for (const keep of sheetIds) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    for (const id of sheetIds) if (id !== keep) wb.removeWorksheet(id);
    const buf = await wb.xlsx.writeBuffer();
    parsed.push(await parseExcel(Buffer.from(buf)));
  }
  return parsed;
}

function monthKeyOf(parsed) {
  const start = parsed.find(p => p.period_start)?.period_start;
  return start ? start.slice(0, 7) : null;
}

function money(n) {
  return n == null ? "null" : `$${n.toFixed(2)}`;
}

async function main(argv) {
  const jsonArg = argv.find(a => a.startsWith("--json="));
  const files = argv.filter(a => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Usage: node scripts/extractPayrollFromSummary.mjs <file.xlsx> [...]");
    process.exitCode = 1;
    return;
  }

  const months = [];
  for (const file of files) {
    const parsed = await parseSummaryWorkbook(file);
    const monthKey = monthKeyOf(parsed);
    const campuses = parsed.map(p => ({
      campus: p.detectedCampus,
      period_start: p.period_start,
      period_end: p.period_end,
      total_checks: p.total_checks,
      net_revenue: p.net_revenue,
      payroll: p.payroll,
      credit_card: p.credit_card,
      tenders_found: p.tenders_found,
      payroll_unreadable: p.payroll_unreadable,
      tender_labels: p.tender_labels,
    }));
    const complete = campuses.every(c => c.payroll != null);
    const payrollTotal = campuses.reduce((s, c) => s + (c.payroll ?? 0), 0);
    months.push({
      month_key: monthKey,
      source_file: basename(file),
      complete,
      campuses,
      payroll_deduct_sales: complete ? payrollTotal : null,
      payroll_discount: complete ? payrollTotal * PAYROLL_DISCOUNT_RATE : null,
      recorded_payroll_sales: payrollTotal,
    });
  }

  months.sort((a, b) => String(a.month_key).localeCompare(String(b.month_key)));

  for (const m of months) {
    console.log(`\n── ${m.month_key ?? "(no period found)"} — ${m.source_file}`);
    console.log(`   ${"campus".padEnd(14)}${"checks".padStart(8)}${"net revenue".padStart(14)}${"payroll".padStart(14)}${"credit card".padStart(14)}`);
    for (const c of m.campuses) {
      const flag = c.payroll == null
        ? (c.payroll_unreadable ? "  payroll row unreadable" : `  no payroll row — labels: ${c.tender_labels.join(", ")}`)
        : "";
      console.log(
        `   ${String(c.campus ?? "UNKNOWN").padEnd(14)}${String(c.total_checks).padStart(8)}` +
        `${money(c.net_revenue).padStart(14)}${money(c.payroll).padStart(14)}${money(c.credit_card).padStart(14)}${flag}`
      );
    }
    console.log(`   ${"".padEnd(14)}${"".padStart(8)}${"".padStart(14)}${money(m.payroll_deduct_sales ?? m.recorded_payroll_sales).padStart(14)}` +
      (m.complete ? `   discount ${money(m.payroll_discount)}` : "   INCOMPLETE — month total withheld"));
  }

  const complete = months.filter(m => m.complete);
  const incomplete = months.filter(m => !m.complete);
  const sales = complete.reduce((s, m) => s + m.payroll_deduct_sales, 0);
  console.log(`\n══ ${complete.length} of ${months.length} month(s) complete`);
  if (incomplete.length) console.log(`   incomplete: ${incomplete.map(m => m.month_key).join(", ")}`);
  console.log(`   payroll-deduct sales : ${money(sales)}`);
  console.log(`   15% discount ×15/85  : ${money(sales * PAYROLL_DISCOUNT_RATE)}`);

  if (jsonArg) {
    const out = jsonArg.slice("--json=".length);
    await writeFile(out, JSON.stringify({
      generated_by: "scripts/extractPayrollFromSummary.mjs",
      note: "Payroll-deduct tender totals read from the archived InfoGenesis Sales Summary workbooks with the same parseExcel the upload endpoint uses. payroll_deduct_sales is what employees were charged, already net of their 15% discount; payroll_discount is that × 15/85. A month is only totalled when every campus sheet in it yielded a payroll figure.",
      months,
    }, null, 2) + "\n");
    console.log(`\n   wrote ${out}`);
  }
}

// Only run when invoked directly — test/payroll-summary-extract.test.mjs imports
// parseSummaryWorkbook, and an unguarded call would run the CLI on the test args.
const invokedDirectly = argv[1] && await realpath(argv[1]).then(
  p => p === fileURLToPath(import.meta.url),
  () => false,
);
if (invokedDirectly) await main(argv.slice(2));
