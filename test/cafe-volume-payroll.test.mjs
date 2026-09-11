/**
 * Payroll-deduct coverage in the agent export's café volume block.
 *
 * The August 2026 leadership report put FY26 payroll discount at $32,825 while
 * the app's Payroll Discount card read $60,554. The export was the source of
 * the low figure: five months (Oct 2025 – Feb 2026) whose daily_metrics docs
 * carry payroll: null were written out as payroll_deduct_sales: 0, and summing
 * them read as "the discount program began in March 2026." The discount is a
 * long-standing program, so those zeros were never a fact about the program.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYROLL_DISCOUNT_RATE,
  buildCafeVolume,
  buildVolumeAccum,
} from "../src/utils/cafeVolume.js";

// 9.2% is the rate every campus-month in the real data reports, to within
// rounding. The fixtures carry tax because the discount cannot be computed
// without it — the tender has to come off its tax before 15/85 applies.
const TAX = 0.092;
const withTax = (netRevenue) => Math.round(netRevenue * TAX * 100) / 100;

const daily = (campus, date, payroll, extra = {}) => {
  const doc = { campus, date, payroll, report_type: "daily",
    net_revenue: 1000, total_checks: 100, ...extra };
  if (doc.total_taxes === undefined) doc.total_taxes = withTax(doc.net_revenue);
  return doc;
};

const period = (campus, date, payroll, extra = {}) => {
  const doc = { campus, date, payroll, report_type: "period",
    net_revenue: 0, total_checks: 0, ...extra };
  if (doc.total_taxes === undefined) doc.total_taxes = withTax(doc.net_revenue);
  return doc;
};

/** What the discount should be: strip the tax, then take 15/85 of the rest. */
const expectedDiscount = (tender, rate = TAX) => (tender / (1 + rate)) * PAYROLL_DISCOUNT_RATE;

function volumeFor(docs, monthKey) {
  return buildCafeVolume(buildVolumeAccum(docs), monthKey);
}

test("a fully recorded month discounts the tender net of its sales tax", () => {
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 500),
    daily("Mesa Lab", "2026-08-04", 350),
  ], "2026-08");

  const ml = vol.by_campus["Mesa Lab"];
  assert.equal(ml.payroll_deduct_sales, 850, "the tender is reported as charged, tax included");
  assert.equal(ml.payroll_tax_rate, TAX);
  assert.equal(ml.payroll_deduct_sales_pretax, 850 / (1 + TAX));
  assert.equal(ml.payroll_discount, expectedDiscount(850));
  // The old basis took 15/85 of the whole tender and so ran ~9% high.
  assert.ok(ml.payroll_discount < 850 * PAYROLL_DISCOUNT_RATE);
  assert.equal(ml.payroll_coverage.status, "daily");
  assert.equal(ml.payroll_coverage.days_with_payroll, 2);
  assert.equal(ml.payroll_coverage.days_reported, 2);
  assert.equal(vol.totals.payroll_coverage.status, "complete");
});

test("a month-end period doc is authoritative over the daily docs", () => {
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 500),
    daily("Mesa Lab", "2026-08-04", null),
    period("Mesa Lab", "2026-08-31", 11148.96),
  ], "2026-08");

  const ml = vol.by_campus["Mesa Lab"];
  assert.equal(ml.payroll_deduct_sales, 11148.96);
  assert.equal(ml.payroll_coverage.status, "period");
});

test("a month with no payroll recorded reports null, not zero", () => {
  // Oct 2025: real POS traffic, every payroll field null because the source
  // reports were PDFs. The old export wrote 0 here.
  const vol = volumeFor([
    daily("Mesa Lab", "2025-10-06", null),
    daily("Mesa Lab", "2025-10-07", null),
  ], "2025-10");

  const ml = vol.by_campus["Mesa Lab"];
  assert.equal(ml.total_checks, 200, "traffic is still reported");
  assert.equal(ml.payroll_deduct_sales, null);
  assert.equal(ml.payroll_discount, null);
  assert.equal(ml.payroll_coverage.status, "missing");
  assert.equal(ml.payroll_coverage.days_with_payroll, 0);
  assert.equal(ml.payroll_coverage.days_reported, 2);

  assert.equal(vol.totals.payroll_deduct_sales, null);
  assert.equal(vol.totals.payroll_discount, null);
  assert.equal(vol.totals.payroll_coverage.status, "missing");
});

test("a partly recorded month withholds the total and keeps the partial aside", () => {
  const vol = volumeFor([
    daily("Foothills", "2026-08-03", 600),
    daily("Foothills", "2026-08-04", null),
    daily("Foothills", "2026-08-05", 400),
  ], "2026-08");

  const fh = vol.by_campus.Foothills;
  assert.equal(fh.payroll_deduct_sales, null, "1000 is not the month's total");
  assert.equal(fh.payroll_discount, null);
  assert.equal(fh.payroll_coverage.status, "partial");
  assert.equal(fh.payroll_coverage.days_with_payroll, 2);
  assert.equal(fh.payroll_coverage.days_reported, 3);
  assert.equal(fh.payroll_coverage.recorded_sales, 1000);
});

test("one café missing payroll nulls the month total and names the café", () => {
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 500),
    daily("Foothills", "2026-08-03", null),
  ], "2026-08");

  assert.equal(vol.by_campus["Mesa Lab"].payroll_deduct_sales, 500);
  assert.equal(vol.by_campus.Foothills.payroll_deduct_sales, null);

  assert.equal(vol.totals.payroll_deduct_sales, null);
  assert.equal(vol.totals.payroll_discount, null);
  assert.equal(vol.totals.payroll_coverage.status, "partial");
  assert.deepEqual(vol.totals.payroll_coverage.campuses_missing_payroll, ["Foothills"]);
  assert.equal(vol.totals.payroll_coverage.recorded_sales, 500);
});

test("recorded months are unchanged — Aug 2026 still reports $5,173.60", () => {
  // The six FY26 months that did record payroll must survive the fix intact,
  // or the corrected FYTD figure moves for the wrong reason.
  const vol = volumeFor([
    period("Mesa Lab", "2026-08-31", 11148.96),
    period("Foothills", "2026-08-31", 17716.42),
    period("Center Green", "2026-08-31", 451.67),
    daily("Mesa Lab", "2026-08-03", null, { total_checks: 2091, net_revenue: 14206.29 }),
    daily("Foothills", "2026-08-03", null, { total_checks: 2482, net_revenue: 19274.08 }),
    daily("Center Green", "2026-08-03", null, { total_checks: 83, net_revenue: 467.83 }),
  ], "2026-08");

  assert.equal(vol.totals.total_checks, 4656);
  assert.equal(Math.round(vol.totals.payroll_deduct_sales * 100) / 100, 29317.05,
    "the tender total is unchanged by the tax fix");
  // Same charges, discounted on their menu-price share rather than the whole
  // tender: $5,173.60 under the old basis, $4,737.73 under this one.
  assert.equal(Math.round(vol.totals.payroll_discount * 100) / 100, 4737.73);
  assert.equal(vol.totals.payroll_coverage.status, "complete");
  assert.equal(vol.totals.payroll_tax_basis.status, "tax_excluded");
});

test("a café with no checks is left out rather than counted as a gap", () => {
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 500),
    daily("Center Green", "2026-08-03", null, { total_checks: 0, net_revenue: 0 }),
  ], "2026-08");

  assert.deepEqual(Object.keys(vol.by_campus), ["Mesa Lab"]);
  assert.equal(vol.totals.payroll_deduct_sales, 500);
  assert.equal(vol.totals.payroll_coverage.status, "complete");
});

test("a period doc replaces the daily docs' traffic instead of adding to it", () => {
  // Oct 2025 as Firestore actually holds it: PDF-sourced daily docs carrying
  // the month's checks and no payroll. parsePdf never sets period_end, so
  // these are always report_type "daily".
  const dailies = [
    daily("Mesa Lab", "2025-10-06", null, { total_checks: 1200, net_revenue: 8000 }),
    daily("Mesa Lab", "2025-10-07", null, { total_checks: 1203, net_revenue: 9321.82 }),
  ];
  const before = volumeFor(dailies, "2025-10");
  assert.equal(before.by_campus["Mesa Lab"].total_checks, 2403);
  assert.equal(before.by_campus["Mesa Lab"].payroll_deduct_sales, null);

  // Filing the period workbook to recover the payroll must not also re-add the
  // month's traffic: 2403 + 2403 = 4806 checks would halve the average check
  // and overstate every volume figure in the report.
  const withPeriod = volumeFor([
    ...dailies,
    { campus: "Mesa Lab", date: "2025-10-31", report_type: "period",
      payroll: 13930.71, total_checks: 2403, net_revenue: 17321.82,
      total_taxes: withTax(17321.82) },
  ], "2025-10");

  const ml = withPeriod.by_campus["Mesa Lab"];
  assert.equal(ml.total_checks, 2403, "the period doc states the month, it does not add to it");
  assert.equal(Math.round(ml.avg_check * 100) / 100, 7.21);
  assert.equal(ml.payroll_deduct_sales, 13930.71);
  assert.equal(ml.payroll_coverage.status, "period");
  assert.equal(withPeriod.totals.total_checks, 2403);
});

test("a tender-only period doc adds payroll without blanking the month", () => {
  // A period doc with no traffic of its own must not replace real daily checks.
  const vol = volumeFor([
    daily("Foothills", "2026-08-03", null, { total_checks: 2482, net_revenue: 19274.08 }),
    { campus: "Foothills", date: "2026-08-31", report_type: "period",
      payroll: 17716.42, total_checks: 0, net_revenue: 0, total_taxes: 0 },
  ], "2026-08");

  const fh = vol.by_campus.Foothills;
  assert.equal(fh.total_checks, 2482);
  assert.equal(fh.payroll_deduct_sales, 17716.42);
  assert.equal(fh.payroll_coverage.status, "period");
});

test("the tax rate is read from the month, not assumed", () => {
  // A different jurisdiction rate must flow through without a code change.
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 1000, { net_revenue: 5000, total_taxes: 250 }),
  ], "2026-08");

  const ml = vol.by_campus["Mesa Lab"];
  assert.equal(ml.payroll_tax_rate, 0.05);
  assert.equal(ml.payroll_discount, expectedDiscount(1000, 0.05));
});

test("payroll without tax yields no discount rather than an inflated one", () => {
  // A PDF-sourced month has neither tender nor tax. This is the rarer case of a
  // tender that was read and a TAXES section that was not: the charges are
  // real, the discount is not computable, and the old basis would have
  // reported one ~9% high.
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 500, { total_taxes: null }),
  ], "2026-08");

  const ml = vol.by_campus["Mesa Lab"];
  assert.equal(ml.payroll_deduct_sales, 500, "the tender is still reported");
  assert.equal(ml.payroll_tax_rate, null);
  assert.equal(ml.payroll_deduct_sales_pretax, null);
  assert.equal(ml.payroll_discount, null);

  assert.equal(vol.totals.payroll_deduct_sales, 500);
  assert.equal(vol.totals.payroll_discount, null);
  assert.equal(vol.totals.payroll_coverage.status, "complete", "payroll itself is complete");
  assert.equal(vol.totals.payroll_tax_basis.status, "unavailable");
  assert.deepEqual(vol.totals.payroll_tax_basis.campuses_missing_tax_rate, ["Mesa Lab"]);
});

test("one café without a tax rate withholds only the month's discount", () => {
  const vol = volumeFor([
    daily("Mesa Lab", "2026-08-03", 500),
    daily("Foothills", "2026-08-03", 400, { total_taxes: null }),
  ], "2026-08");

  assert.equal(vol.by_campus["Mesa Lab"].payroll_discount, expectedDiscount(500));
  assert.equal(vol.by_campus.Foothills.payroll_discount, null);

  assert.equal(vol.totals.payroll_deduct_sales, 900, "tenders still total");
  assert.equal(vol.totals.payroll_discount, null);
  assert.deepEqual(vol.totals.payroll_tax_basis.campuses_missing_tax_rate, ["Foothills"]);
});

test("the basis matches what the POS itself recorded as discounts", () => {
  // Center Green, Oct 2025 and Jan 2026, from the archived Sales Summary
  // workbooks. Nearly every sale there is payroll-deduct and neither month
  // carries other discounts, so the POS "- Discounts" column is effectively the
  // employee discount and can referee the formula.
  const cases = [
    { month: "2025-10", net: 1147.17, tax: 105.54, payroll: 1188.74, posDiscounts: 192.48 },
    { month: "2026-01", net: 1048.72, tax: 96.59, payroll: 1134.94, posDiscounts: 183.63 },
  ];

  for (const c of cases) {
    const vol = volumeFor([
      daily("Center Green", `${c.month}-15`, c.payroll,
        { net_revenue: c.net, total_taxes: c.tax, total_checks: 197 }),
    ], c.month);

    const got = vol.by_campus["Center Green"].payroll_discount;
    const old = c.payroll * PAYROLL_DISCOUNT_RATE;

    assert.ok(Math.abs(got - c.posDiscounts) < 0.5,
      `${c.month}: ${got.toFixed(2)} should land on the POS figure ${c.posDiscounts}`);
    assert.ok(Math.abs(old - c.posDiscounts) > 10,
      `${c.month}: the old basis was off by more than $10`);
  }
});

