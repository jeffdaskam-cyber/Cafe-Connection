/**
 * Reading payroll-deduct totals out of a multi-campus Sales Summary workbook.
 *
 * The period summaries for Oct 2025 - Feb 2026 carry one worksheet per campus,
 * and parseExcel reads only worksheets[0]. Uploading such a file whole captures
 * the first campus and silently drops the rest — which is how a month can show
 * café traffic with no payroll behind it. parseSummaryWorkbook splits the sheets
 * so every campus is parsed, and these pin that behavior.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";

import { parseSummaryWorkbook } from "../scripts/extractPayrollFromSummary.mjs";

/** A minimal sheet in the InfoGenesis Sales Summary layout. */
function addCampusSheet(wb, { name, profitCenter, checks, netRevenue, payroll, visa }) {
  const ws = wb.addWorksheet(name);
  ws.getCell(4, 2).value = "Processed Business Period Starting 10/1/2025 3:00 AM and Ending 11/1/2025 2:59 AM";
  ws.getCell(8, 2).value = `Profit Center: ${profitCenter}`;

  ws.getCell(9, 2).value = "STATISTICS";
  ws.getCell(10, 4).value = "Net Checks";
  ws.getCell(10, 5).value = "Avg Check";
  ws.getCell(11, 2).value = "Lunch(2)";
  ws.getCell(11, 4).value = checks;
  ws.getCell(11, 5).value = Math.round((netRevenue / checks) * 100) / 100;
  ws.getCell(12, 2).value = "Total";
  ws.getCell(12, 4).value = checks;
  ws.getCell(12, 5).value = Math.round((netRevenue / checks) * 100) / 100;

  ws.getCell(14, 2).value = "REVENUE";
  ws.getCell(15, 4).value = "= Gross Revenue";
  ws.getCell(15, 5).value = "- Discounts";
  ws.getCell(15, 7).value = "Net Revenue";
  ws.getCell(16, 2).value = "Total";
  ws.getCell(16, 4).value = netRevenue;
  ws.getCell(16, 5).value = 0;
  ws.getCell(16, 7).value = netRevenue;

  ws.getCell(20, 6).value = "TENDERS";
  ws.getCell(21, 12).value = "Total";
  ws.getCell(22, 6).value = "Visa (2)";
  ws.getCell(22, 12).value = visa;
  if (payroll !== undefined) {
    ws.getCell(23, 6).value = "Payroll (9)";
    ws.getCell(23, 12).value = payroll;
  }
  return ws;
}

async function writeWorkbook(dir, file, campuses) {
  const wb = new ExcelJS.Workbook();
  for (const c of campuses) addCampusSheet(wb, c);
  const path = join(dir, file);
  await wb.xlsx.writeFile(path);
  return path;
}

const CENTER_GREEN = { name: "Sheet1", profitCenter: "UCAR Center Green(549)", checks: 197, netRevenue: 1147.17, payroll: 1188.74, visa: 63.97 };
const FOOTHILLS    = { name: "Sheet2", profitCenter: "UCAR Foothills Lab(552)", checks: 3220, netRevenue: 23973.13, payroll: 22705.87, visa: 3115.95 };
const MESA_LAB     = { name: "Sheet3", profitCenter: "UCAR Mesa Lab(550)", checks: 2403, netRevenue: 17321.82, payroll: 13930.71, visa: 4476.03 };

test("every campus sheet is parsed, not just the first", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "summary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const path = await writeWorkbook(dir, "oct.xlsx", [CENTER_GREEN, FOOTHILLS, MESA_LAB]);
  const parsed = await parseSummaryWorkbook(path);

  assert.equal(parsed.length, 3, "one parse per campus sheet");
  assert.deepEqual(parsed.map(p => p.detectedCampus), ["Center Green", "Foothills", "Mesa Lab"]);
  assert.deepEqual(parsed.map(p => p.payroll), [1188.74, 22705.87, 13930.71]);
  assert.deepEqual(parsed.map(p => p.total_checks), [197, 3220, 2403]);

  // The whole point: the first sheet alone would have understated the month by
  // $36,636.58 of payroll-deduct charges.
  const total = parsed.reduce((s, p) => s + p.payroll, 0);
  assert.equal(Math.round(total * 100) / 100, 37825.32);
  assert.equal(Math.round(parsed[0].payroll * 100) / 100, 1188.74);
});

test("the reporting period is read off the sheets", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "summary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const path = await writeWorkbook(dir, "oct.xlsx", [MESA_LAB]);
  const [parsed] = await parseSummaryWorkbook(path);

  assert.equal(parsed.period_start, "2025-10-01");
  assert.equal(parsed.period_end, "2025-10-31", "the end date is exclusive in the sheet and inclusive here");
});

test("a sheet with no payroll row yields null rather than zero", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "summary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const noPayroll = { ...MESA_LAB, payroll: undefined };
  const path = await writeWorkbook(dir, "oct.xlsx", [noPayroll]);
  const [parsed] = await parseSummaryWorkbook(path);

  assert.equal(parsed.payroll, null);
  assert.equal(parsed.tenders_found, true, "the section was found; the row was not");
  assert.deepEqual(parsed.tender_labels, ["Visa (2)"]);
});

test("a workbook with no worksheets is refused", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "summary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const wb = new ExcelJS.Workbook();
  const path = join(dir, "empty.xlsx");
  await wb.xlsx.writeFile(path);

  await assert.rejects(() => parseSummaryWorkbook(path), /no worksheets/);
});
