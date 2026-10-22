/**
 * The Workday Operating Budget Report (Project Hierarchy) parser.
 *
 * Rows below are copied from the FY2026 - Sep upload. Revenue posted to the
 * Food Services Unrel Bus Income and Cafe Special Functions projects (D66 and
 * D70 in that file) used to be dropped because neither project was mapped.
 */

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { parseFpaWorkbook } from "../api/_lib/fpaReport.mjs";

// [column A, MTD (column C), YTD (column D)]
const SEP_FY26_ROWS = [
  ["PRJ005075 Food Services CG 323932",           -9957.05,  -24571.54],
  ["4313:Miscellaneous Sales",                    -1746.67,  -13341.31],
  ["4320:Other Non Government Income",            -32240.88, -99635.28],
  ["5001:Salaries",                               18615.64,  138129.85],
  ["9990:Internal Chargeback Revenue",            -20390.41, -276874.84],
  ["PRJ005076 Food Services Unrel Bus Income 323935", -1000, -1119.68],
  ["4325:Other Miscellaneous Revenue",            -1000,     -1500],
  ["7750:Taxes, fines and penalties",             0,         380.32],
  ["9989:Final Rate-Full Benefits",               0,         0],
  ["PRJ005077 Cafe Special Functions 323950",     328.28,    3924.36],
  ["4320:Other Non Government Income",            -431.25,   -2193.75],
  ["7000:Materials and Supplies",                 759.53,    5963.85],
  ["7750:Taxes, fines and penalties",             0,         154.26],
  ["PRJ005109 Custodial Unrelated Bus Income 323936", 0,     0],
  ["7500:Purchased Services",                     0,         0],
];

function buildReport(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell("A1").value = "FIN - Operating Budget Report (Project Hierarchy) - Fiscal Year";
  ws.getCell("A10").value = "Period";
  ws.getCell("B10").value = "FY2026 - Sep";
  ws.getCell("A12").value = "Project";
  rows.forEach(([label, mtd, ytd], i) => {
    const r = 15 + i;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 3).value = mtd;
    ws.getCell(r, 4).value = ytd;
  });
  return wb;
}

test("revenue in the Unrel Bus Income and Special Functions blocks is ingested", () => {
  const { period, facts } = parseFpaWorkbook(buildReport(SEP_FY26_ROWS));
  assert.deepEqual(period, { year: 2026, month: 9 });

  const ubi = facts.filter(f => f.projectCode === "PRJ005076");
  assert.deepEqual(ubi.map(f => [f.campus, f.ledgerCode, f.normalizedName, f.mtdAmount, f.ytdAmount]), [
    ["Unrelated Business", "4325", "Cafe Revenue", 1000, 1500],
  ]);

  const special = facts.filter(f => f.projectCode === "PRJ005077");
  assert.deepEqual(special.map(f => [f.campus, f.ledgerCode, f.normalizedName, f.mtdAmount, f.ytdAmount]), [
    ["Special Functions", "4320", "External Event Revenue", 431.25, 2193.75],
  ]);
});

test("expense rows in revenue-only blocks are skipped", () => {
  const { facts } = parseFpaWorkbook(buildReport(SEP_FY26_ROWS));
  const revenueOnly = facts.filter(f => ["PRJ005076", "PRJ005077"].includes(f.projectCode));
  assert.ok(revenueOnly.every(f => f.category !== "Expense"));
});

test("campus blocks and unmapped projects behave as before", () => {
  const { facts, warnings } = parseFpaWorkbook(buildReport(SEP_FY26_ROWS));

  const cg = facts.filter(f => f.campus === "Center Green");
  assert.deepEqual(cg.map(f => f.ledgerCode), ["4313", "4320", "5001", "9990"]);

  // Custodial (PRJ005109) is still unmapped, so its rows don't bleed into the
  // Special Functions block above it.
  assert.equal(facts.some(f => f.ledgerCode === "7500"), false);

  // Revenue-only projects never warn; the campus warnings are unchanged.
  assert.ok(warnings.every(w => !/Unrelated Business|Special Functions|PRJ00507[67]/.test(w)));
  assert.ok(warnings.includes("Missing project block: PRJ005073 (Mesa Lab)"));
});
