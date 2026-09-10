/**
 * The per-field rules that decide what each sales backfill writes.
 *
 * These run against production financial documents, so both halves are pinned
 * here: which failures are explained rather than guessed at, and — the case a
 * null check cannot catch — which figures the report produced must still be
 * refused.
 */

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { parseExcel } from "../api/_lib/salesReport.mjs";
import { CREDIT_CARD_FIELD, PAYROLL_FIELD } from "../scripts/lib/salesBackfillFields.mjs";

/** A workbook in the shape parseExcel walks, with the given TENDERS rows. */
async function buildReport(tenderRows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  const set = (r, c, v) => { ws.getCell(r, c).value = v; };
  set(1, 2, "Profit Center: UCAR Mesa Lab (2)");
  set(2, 2, "Business Period Starting 9/3/2026 Ending 9/4/2026");
  set(4, 2, "STATISTICS"); set(5, 3, "Net Checks"); set(5, 4, "Avg Check");
  set(6, 2, "Breakfast(1)"); set(6, 3, 40); set(6, 4, 6.25);
  set(7, 2, "Lunch(2)"); set(7, 3, 160); set(7, 4, 11.5);
  set(8, 2, "Total"); set(8, 3, 200); set(8, 4, 10.45);
  set(10, 2, "REVENUE"); set(11, 3, "Net Revenue");
  set(11, 4, "= Gross Revenue"); set(11, 5, "- Discounts");
  set(12, 2, "Breakfast(1)"); set(12, 3, 250); set(12, 4, 260); set(12, 5, 10);
  set(13, 2, "Lunch(2)"); set(13, 3, 1840); set(13, 4, 1900); set(13, 5, 60);
  set(14, 2, "Total"); set(14, 3, 2090); set(14, 4, 2160); set(14, 5, 70);
  set(16, 2, "TAXES"); set(17, 3, "Total"); set(18, 2, "Subtotal"); set(18, 3, 88.25);
  set(20, 6, "TENDERS"); set(21, 11, "Total");
  tenderRows.forEach(([label, value], i) => { set(22 + i, 6, label); set(22 + i, 11, value); });
  const cashRow = 22 + tenderRows.length;
  set(cashRow, 2, "CASH POSITION"); set(cashRow + 1, 7, "= Account. Cash");
  set(cashRow + 2, 3, "Total"); set(cashRow + 2, 7, 150.75);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("an inflated card total is refused, not written", async () => {
  // The parser matches the payroll row by a "payroll" prefix, so "Employee
  // Payroll Deduct" falls through to the credit-card branch: credit_card comes
  // back as 1325.50 when the real card total is 900. It is non-null, so only an
  // explicit rejection keeps that wrong figure out of Firestore.
  const metrics = await parseExcel(await buildReport([
    ["Employee Payroll Deduct", 425.5], ["Visa", 900],
  ]));
  assert.equal(metrics.credit_card, 1325.5);
  assert.equal(CREDIT_CARD_FIELD.rejectValue(metrics), "total-inflated-by-unmatched-payroll");
});

test("a card total with the payroll row recognized is written", async () => {
  const metrics = await parseExcel(await buildReport([
    ["Payroll Deduct", 425.5], ["Visa", 900],
  ]));
  assert.equal(metrics.credit_card, 900);
  assert.equal(CREDIT_CARD_FIELD.rejectValue(metrics), null);
});

test("a genuine zero card total is written, not refused", async () => {
  // The days this backfill exists for: a TENDERS section with no card rows.
  const metrics = await parseExcel(await buildReport([
    ["Payroll Deduct", 425.5], ["Cash", 300],
  ]));
  assert.equal(metrics.credit_card, 0);
  assert.equal(CREDIT_CARD_FIELD.rejectValue(metrics), null);
});

test("an unreadable payroll amount does not condemn the card total", async () => {
  // payroll is null here too, but for a reason that says nothing about the card
  // rows — no unmatched label was summed into them.
  const metrics = await parseExcel(await buildReport([
    ["Payroll Deduct", null], ["Visa", 900],
  ]));
  assert.equal(metrics.payroll, null);
  assert.equal(metrics.payroll_unreadable, true);
  assert.equal(metrics.credit_card, 900);
  assert.equal(CREDIT_CARD_FIELD.rejectValue(metrics), null);
});

test("credit_card explains its two missing cases", () => {
  assert.equal(CREDIT_CARD_FIELD.explainMissing({ tenders_found: false }), "no-tenders-section");
  assert.equal(CREDIT_CARD_FIELD.explainMissing({ tenders_found: true }), "card-row-unreadable");
});

test("payroll explains its three missing cases", () => {
  assert.equal(PAYROLL_FIELD.explainMissing({ tenders_found: false }), "no-tenders-section");
  assert.equal(
    PAYROLL_FIELD.explainMissing({ tenders_found: true, payroll_unreadable: true }),
    "payroll-row-unreadable"
  );
  assert.equal(
    PAYROLL_FIELD.explainMissing({ tenders_found: true, payroll_unreadable: false }),
    "no-payroll-row"
  );
});

test("payroll refuses nothing it can read", async () => {
  // Its figure comes straight from its own row, so there is no analogous way
  // for a readable payroll value to be quietly wrong.
  assert.equal(PAYROLL_FIELD.rejectValue, undefined);
});
