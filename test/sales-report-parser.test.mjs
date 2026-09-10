/**
 * The InfoGenesis Excel parser, and the payroll figure in particular.
 *
 * The payroll-deduct tender drives the Payroll Discount card and the
 * payroll_discount series in the agent export, and it is what
 * scripts/backfillSalesPayroll.mjs recovers from archived reports. It is read
 * by walking anchors and header labels across the sheet, so the layout the
 * parser expects is pinned here against a workbook shaped like a real report.
 */

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { parseExcel } from "../api/_lib/salesReport.mjs";

/**
 * A minimal workbook in the shape parseExcel walks: a Profit Center header, a
 * Business Period line, STATISTICS and REVENUE sections anchored in column B,
 * and a TENDERS section anchored in column F with its own Total column.
 */
async function buildReport({ tenderRows, omitTenders = false } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  const set = (row, col, value) => { ws.getCell(row, col).value = value; };

  set(1, 2, "Profit Center: UCAR Mesa Lab (2)");
  // Ending is exclusive — the parser subtracts a day, so this is a single day.
  set(2, 2, "Business Period Starting 9/3/2026 Ending 9/4/2026");

  // ── STATISTICS ──────────────────────────────────────────────────────────
  set(4, 2, "STATISTICS");
  set(5, 3, "Net Checks");
  set(5, 4, "Avg Check");
  set(6, 2, "Breakfast(1)"); set(6, 3, 40);  set(6, 4, 6.25);
  set(7, 2, "Lunch(2)");     set(7, 3, 160); set(7, 4, 11.5);
  set(8, 2, "Total");        set(8, 3, 200); set(8, 4, 10.45);

  // ── REVENUE ─────────────────────────────────────────────────────────────
  set(10, 2, "REVENUE");
  set(11, 3, "Net Revenue");
  set(11, 4, "= Gross Revenue");
  set(11, 5, "- Discounts");
  set(12, 2, "Breakfast(1)"); set(12, 3, 250);  set(12, 4, 260);  set(12, 5, 10);
  set(13, 2, "Lunch(2)");     set(13, 3, 1840); set(13, 4, 1900); set(13, 5, 60);
  set(14, 2, "Total");        set(14, 3, 2090); set(14, 4, 2160); set(14, 5, 70);

  // ── TAXES ───────────────────────────────────────────────────────────────
  set(16, 2, "TAXES");
  set(17, 3, "Total");
  set(18, 2, "Subtotal"); set(18, 3, 88.25);

  // ── TENDERS — anchored in column F, totals out past column 10 ───────────
  const rows = omitTenders
    ? []
    : tenderRows ?? [["Payroll Deduct", 425.5], ["Visa", 900], ["Mastercard", 300]];
  if (!omitTenders) {
    set(20, 6, "TENDERS");
    set(21, 11, "Total");
    rows.forEach(([label, value], i) => {
      set(22 + i, 6, label);
      set(22 + i, 11, value);
    });
  }

  // ── CASH POSITION — ends the TENDERS scan ───────────────────────────────
  const cashRow = 22 + rows.length;
  set(cashRow, 2, "CASH POSITION");
  set(cashRow + 1, 7, "= Account. Cash");
  set(cashRow + 2, 3, "Total"); set(cashRow + 2, 7, 150.75);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("payroll comes from the TENDERS row, not the discounts column", async () => {
  const metrics = await parseExcel(await buildReport());
  // 425.50 of payroll-deduct tender → $75.09 of employee discount (x 15/85).
  assert.equal(metrics.payroll, 425.5);
  // "- Discounts" is a separate, unrelated figure and must not be confused for it.
  assert.equal(metrics.discounts, 70);
});

test("every tender that is not payroll or cash rolls into credit_card", async () => {
  const metrics = await parseExcel(await buildReport());
  assert.equal(metrics.credit_card, 1200);
});

test("a report with no payroll-deduct row parses with payroll null", async () => {
  // The gap scripts/backfillSalesPayroll.mjs reports rather than filling with
  // a guess. The labels it read come back so the run can say which case it is.
  const metrics = await parseExcel(await buildReport({
    tenderRows: [["Visa", 900], ["Mastercard", 300]],
  }));
  assert.equal(metrics.payroll, null);
  assert.equal(metrics.credit_card, 1200);
  assert.equal(metrics.tenders_found, true);
  assert.deepEqual(metrics.tender_labels, ["Visa", "Mastercard"]);
});

test("a payroll row named something else is missed AND inflates credit_card", async () => {
  // The match is label.startsWith("payroll"), so a tender named "Employee
  // Payroll Deduct" falls through to the credit-card branch: the figure is
  // lost from payroll and silently added to credit_card. The backfill reports
  // these labels precisely so this is visible rather than inferred.
  const metrics = await parseExcel(await buildReport({
    tenderRows: [["Employee Payroll Deduct", 425.5], ["Visa", 900]],
  }));
  assert.equal(metrics.payroll, null);
  assert.equal(metrics.credit_card, 1325.5); // 900 + the 425.50 of payroll deduct
  assert.deepEqual(metrics.tender_labels, ["Employee Payroll Deduct", "Visa"]);
});

test("a day with no card tenders reports credit_card 0, not null", async () => {
  // The zero is a fact about the day, not a failure to read one: the section
  // was found and totalled, and none of its rows were card tenders. Center
  // Green files reports shaped like this routinely.
  const metrics = await parseExcel(await buildReport({
    tenderRows: [["Payroll Deduct", 425.5], ["Cash", 300]],
  }));
  assert.equal(metrics.credit_card, 0);
  assert.equal(metrics.payroll, 425.5);
  assert.equal(metrics.tenders_found, true);
});

test("a payroll row whose amount will not parse leaves payroll null", async () => {
  // Recording 0 would assert the day had no payroll deduct. Worse, the backfill
  // only treats null as a gap, so a false 0 would be invisible to the one tool
  // that would otherwise re-read the report.
  for (const bad of [null, "n/a"]) {
    const metrics = await parseExcel(await buildReport({
      tenderRows: [["Payroll Deduct", bad], ["Visa", 900]],
    }));
    assert.equal(metrics.payroll, null);
    assert.equal(metrics.payroll_unreadable, true);
    assert.equal(metrics.tenders_found, true);
    // The row is present and correctly named, so the labels do not explain it.
    assert.deepEqual(metrics.tender_labels, ["Payroll Deduct", "Visa"]);
    // An unreadable payroll amount says nothing about the card rows.
    assert.equal(metrics.credit_card, 900);
  }
});

test("a payroll row reading 0 is a real zero, not an unreadable one", async () => {
  const metrics = await parseExcel(await buildReport({
    tenderRows: [["Payroll Deduct", 0], ["Visa", 900]],
  }));
  assert.equal(metrics.payroll, 0);
  assert.equal(metrics.payroll_unreadable, false);
});

test("a missing payroll row is distinguishable from an unreadable one", async () => {
  // Both leave payroll null, but only the missing row is explained by the
  // labels — and only it means the figure rolled into credit_card.
  const metrics = await parseExcel(await buildReport({
    tenderRows: [["Visa", 900]],
  }));
  assert.equal(metrics.payroll, null);
  assert.equal(metrics.payroll_unreadable, false);
});

test("a card row whose amount will not parse leaves credit_card null", async () => {
  // The section being present does not mean its amounts were readable. A blank
  // or non-numeric Total on a card row reads as null, and folding that to 0
  // would be indistinguishable from the no-card-tenders day above.
  const blank = await parseExcel(await buildReport({
    tenderRows: [["Payroll Deduct", 425.5], ["Visa", null]],
  }));
  assert.equal(blank.credit_card, null);
  assert.equal(blank.tenders_found, true);

  const nonNumeric = await parseExcel(await buildReport({
    tenderRows: [["Payroll Deduct", 425.5], ["Visa", "n/a"]],
  }));
  assert.equal(nonNumeric.credit_card, null);
});

test("one unreadable card row makes the whole total unknown, not understated", async () => {
  // Summing only the rows that parsed would report 900 for a day that also
  // took an unknown amount on Master Card — a wrong figure presented as fact.
  const metrics = await parseExcel(await buildReport({
    tenderRows: [["Payroll Deduct", 425.5], ["Visa", 900], ["Master Card", null]],
  }));
  assert.equal(metrics.credit_card, null);
  assert.equal(metrics.payroll, 425.5);
  assert.deepEqual(metrics.tender_labels, ["Payroll Deduct", "Visa", "Master Card"]);
});

test("a report with no TENDERS section is distinguishable from a missing row", async () => {
  const metrics = await parseExcel(await buildReport({ omitTenders: true }));
  assert.equal(metrics.payroll, null);
  assert.equal(metrics.tenders_found, false);
  assert.deepEqual(metrics.tender_labels, []);
  // Unreadable, not zero — the one case credit_card is null.
  assert.equal(metrics.credit_card, null);
});

test("the surrounding figures the backfill matches on are read correctly", async () => {
  const metrics = await parseExcel(await buildReport());
  assert.equal(metrics.detectedCampus, "Mesa Lab");
  assert.equal(metrics.date, "2026-09-03");
  // Same start and end: a daily report, not a period one.
  assert.equal(metrics.period_start, "2026-09-03");
  assert.equal(metrics.period_end, "2026-09-03");
  assert.equal(metrics.net_revenue, 2090);
  assert.equal(metrics.total_checks, 200);
  assert.equal(metrics.lunch_checks, 160);
  assert.equal(metrics.total_taxes, 88.25);
  assert.equal(metrics.cash_drop, 150.75);
});
