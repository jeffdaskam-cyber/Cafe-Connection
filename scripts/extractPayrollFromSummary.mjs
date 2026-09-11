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
 * These period workbooks carry one worksheet per campus, which parseExcelAll
 * walks. A sheet that is not a campus report is reported, not skipped quietly.
 *
 * Usage:
 *   node scripts/extractPayrollFromSummary.mjs <file.xlsx> [...]
 *   node scripts/extractPayrollFromSummary.mjs --json=out.json data/*.xlsx
 *
 * Options:
 *   --json=<path>   Also write the parsed figures to <path> as JSON.
 */

import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { parseExcelAll } from "../api/_lib/salesReport.mjs";

const PAYROLL_DISCOUNT_RATE = 15 / 85;

/**
 * The discount applies to menu price, not to the sales tax the tender also
 * carries, so the tender comes off its tax before 15/85 does. The rate is the
 * sheet's own taxes over its net revenue rather than a configured constant.
 */
function discountFor(payroll, netRevenue, totalTaxes) {
  if (payroll == null || totalTaxes == null || !(netRevenue > 0)) return null;
  return (payroll / (1 + totalTaxes / netRevenue)) * PAYROLL_DISCOUNT_RATE;
}

/** Parse every campus worksheet of a summary workbook. */
export async function parseSummaryWorkbook(path) {
  const { results, failures } = await parseExcelAll(await readFile(path));
  for (const f of failures) {
    console.warn(`   [${path}] sheet "${f.sheet}" skipped — ${f.error}`);
  }
  return results;
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
      total_taxes: p.total_taxes,
      payroll_discount: discountFor(p.payroll, p.net_revenue, p.total_taxes),
      credit_card: p.credit_card,
      tenders_found: p.tenders_found,
      payroll_unreadable: p.payroll_unreadable,
      tender_labels: p.tender_labels,
    }));
    const complete = campuses.every(c => c.payroll != null);
    const discountable = complete && campuses.every(c => c.payroll_discount != null);
    const payrollTotal = campuses.reduce((s, c) => s + (c.payroll ?? 0), 0);
    const discountTotal = campuses.reduce((s, c) => s + (c.payroll_discount ?? 0), 0);
    months.push({
      month_key: monthKey,
      source_file: basename(file),
      complete,
      campuses,
      payroll_deduct_sales: complete ? payrollTotal : null,
      payroll_discount: discountable ? discountTotal : null,
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
  const discount = complete.reduce((s, m) => s + (m.payroll_discount ?? 0), 0);
  console.log(`   payroll-deduct sales : ${money(sales)}`);
  console.log(`   15% discount, net of sales tax : ${money(discount)}`);

  if (jsonArg) {
    const out = jsonArg.slice("--json=".length);
    await writeFile(out, JSON.stringify({
      generated_by: "scripts/extractPayrollFromSummary.mjs",
      note: "Payroll-deduct tender totals read from the archived InfoGenesis Sales Summary workbooks with the same parseExcel the upload endpoint uses. payroll_deduct_sales is what employees were charged, already net of their 15% discount and including sales tax; payroll_discount is 15/85 of the tender once its sales tax is removed, since the discount never applied to tax. A month is only totalled when every campus sheet in it yielded a payroll figure.",
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
