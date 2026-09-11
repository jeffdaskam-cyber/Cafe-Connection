/**
 * Walking every worksheet of a Sales Summary workbook.
 *
 * The period summaries carry one worksheet per campus. parseExcel read only
 * worksheets[0], so uploading one filed the first campus and dropped the rest
 * in silence — Oct 2025 - Feb 2026 ended up with café traffic and no payroll
 * behind it. parseExcelAll walks them all and reports what it could not read.
 */

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { parseExcel, parseExcelAll } from "../api/_lib/salesReport.mjs";

/** One campus worksheet in the Sales Summary layout. */
function addSheet(wb, { name, profitCenter, checks = 200, netRevenue = 2090, payroll = 425.5, broken = false }) {
  const ws = wb.addWorksheet(name);
  const set = (row, col, value) => { ws.getCell(row, col).value = value; };

  set(1, 2, `Profit Center: ${profitCenter}`);
  set(2, 2, "Business Period Starting 10/1/2025 Ending 11/1/2025");

  if (broken) return ws; // no STATISTICS section — not a campus report

  set(4, 2, "STATISTICS");
  set(5, 3, "Net Checks");
  set(5, 4, "Avg Check");
  set(7, 2, "Lunch(2)"); set(7, 3, checks); set(7, 4, 10.45);
  set(8, 2, "Total");    set(8, 3, checks); set(8, 4, 10.45);

  set(10, 2, "REVENUE");
  set(11, 3, "Net Revenue");
  set(11, 4, "= Gross Revenue");
  set(11, 5, "- Discounts");
  set(14, 2, "Total"); set(14, 3, netRevenue); set(14, 4, netRevenue + 70); set(14, 5, 70);

  set(20, 6, "TENDERS");
  set(21, 11, "Total");
  set(22, 6, "Payroll (9)"); set(22, 11, payroll);
  set(23, 6, "Visa (2)");    set(23, 11, 900);
  set(24, 2, "CASH POSITION");
  return ws;
}

async function buildWorkbook(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) addSheet(wb, s);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const MESA       = { name: "Sheet3", profitCenter: "UCAR Mesa Lab(550)", payroll: 13930.71, checks: 2403, netRevenue: 17321.82 };
const FOOTHILLS  = { name: "Sheet2", profitCenter: "UCAR Foothills Lab(552)", payroll: 22705.87, checks: 3220, netRevenue: 23973.13 };
const CENTER_GRN = { name: "Sheet1", profitCenter: "UCAR Center Green(549)", payroll: 1188.74, checks: 197, netRevenue: 1147.17 };

test("every campus sheet is parsed, in workbook order", async () => {
  const { results, failures } = await parseExcelAll(await buildWorkbook([CENTER_GRN, FOOTHILLS, MESA]));

  assert.equal(results.length, 3);
  assert.deepEqual(results.map(r => r.detectedCampus), ["Center Green", "Foothills", "Mesa Lab"]);
  assert.deepEqual(results.map(r => r.payroll), [1188.74, 22705.87, 13930.71]);
  assert.deepEqual(failures, []);

  // The first sheet alone would have understated October by $36,636.58.
  const total = results.reduce((s, r) => s + r.payroll, 0);
  assert.equal(Math.round(total * 100) / 100, 37825.32);
});

test("each result names the sheet it came from", async () => {
  const { results } = await parseExcelAll(await buildWorkbook([CENTER_GRN, MESA]));
  assert.deepEqual(results.map(r => r.sheet_name), ["Sheet1", "Sheet3"]);
});

test("a non-report sheet is reported, not silently skipped", async () => {
  const notes = { name: "Notes", profitCenter: "UCAR Mesa Lab(550)", broken: true };
  const { results, failures } = await parseExcelAll(await buildWorkbook([MESA, notes]));

  assert.equal(results.length, 1, "the campus sheet still parses");
  assert.equal(results[0].detectedCampus, "Mesa Lab");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].sheet, "Notes");
  assert.match(failures[0].error, /STATISTICS/);
});

test("a single unreadable sheet throws its own error, not a wrapped one", async () => {
  const broken = { name: "Sheet1", profitCenter: "UCAR Mesa Lab(550)", broken: true };
  const buffer = await buildWorkbook([broken]);
  await assert.rejects(
    () => parseExcelAll(buffer),
    /Could not find STATISTICS section/,
  );
});

test("a workbook where no sheet parses names each sheet that failed", async () => {
  const a = { name: "Cover", profitCenter: "UCAR Mesa Lab(550)", broken: true };
  const b = { name: "Notes", profitCenter: "UCAR Foothills Lab(552)", broken: true };
  const buffer = await buildWorkbook([a, b]);
  await assert.rejects(
    () => parseExcelAll(buffer),
    /No worksheet could be parsed.*Cover.*Notes/s,
  );
});

test("parseExcel still returns the first sheet for the backfills", async () => {
  const metrics = await parseExcel(await buildWorkbook([CENTER_GRN, FOOTHILLS, MESA]));
  assert.equal(metrics.detectedCampus, "Center Green");
  assert.equal(metrics.payroll, 1188.74);
});
