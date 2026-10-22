/**
 * The Workday Operating Budget Report (Project Hierarchy) parser.
 *
 * Rows below are copied from the FY2026 - Sep upload. The Food Services Unrel
 * Bus Income (PRJ005076) and Cafe Special Functions (PRJ005077) projects used
 * to be dropped because neither was mapped; both now roll up into the
 * "Cafe Special" campus, revenue and expense alike.
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

test("Unrel Bus Income and Special Functions roll up into Cafe Special", () => {
  const { period, facts } = parseFpaWorkbook(buildReport(SEP_FY26_ROWS));
  assert.deepEqual(period, { year: 2026, month: 9 });

  const cafeSpecial = facts.filter(f => f.campus === "Cafe Special");
  assert.deepEqual(
    cafeSpecial.map(f => [f.ledgerCode, f.category, f.mtdAmount, f.ytdAmount, f.projectCode]),
    [
      ["4325", "Revenue", 1000,   1500,    "PRJ005076"],
      ["7750", "Expense", 0,      534.58,  "PRJ005076+PRJ005077"],
      ["9989", "Expense", 0,      0,       "PRJ005076"],
      ["4320", "Revenue", 431.25, 2193.75, "PRJ005077"],
      ["7000", "Expense", 759.53, 5963.85, "PRJ005077"],
    ],
  );
});

test("a ledger both Cafe Special projects post to is stored once, summed", () => {
  // Facts are keyed campus × ledger in Firestore, so two 7750 facts would
  // collide and the second write would drop $154.26 of YTD taxes.
  const { facts } = parseFpaWorkbook(buildReport(SEP_FY26_ROWS));
  const keys = facts.map(f => `${f.campus}|${f.ledgerCode}`);
  assert.equal(new Set(keys).size, keys.length);

  const taxes = facts.filter(f => f.campus === "Cafe Special" && f.ledgerCode === "7750");
  assert.equal(taxes.length, 1);
  assert.equal(taxes[0].ytdAmount, 534.58); // 380.32 + 154.26
});

test("campus blocks and unmapped projects behave as before", () => {
  const { facts, warnings } = parseFpaWorkbook(buildReport(SEP_FY26_ROWS));

  const cg = facts.filter(f => f.campus === "Center Green");
  assert.deepEqual(cg.map(f => f.ledgerCode), ["4313", "4320", "5001", "9990"]);

  // Custodial (PRJ005109) is still unmapped, so its rows don't bleed into the
  // Cafe Special Functions block above it.
  assert.equal(facts.some(f => f.ledgerCode === "7500"), false);

  // Cafe Special posts to only a few ledgers, so it never warns about missing
  // ledger rows; the other campus warnings are unchanged.
  assert.ok(warnings.every(w => !/Cafe Special|PRJ00507[67]/.test(w)));
  assert.ok(warnings.includes("Missing project block: PRJ005073 (Mesa Lab)"));
});
