/**
 * Sign normalization for Workday Operating Budget amounts.
 *
 * The parser used to store Math.abs() of every cell, which silently turned
 * reversals into additions. The cases below are real FY26 postings from the
 * Event Services Workday data that the old behavior got wrong.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAmount, signForCategory } from "../api/_lib/fpaAmounts.mjs";

test("Workday credits and debits map onto the reporting orientation", () => {
  assert.equal(signForCategory("Revenue"), -1);
  assert.equal(signForCategory("Tax"), -1); // 4314 Sales Tax Collected reports as revenue
  assert.equal(signForCategory("Expense"), 1);
});

test("ordinary postings land positive in both buckets", () => {
  // 9990 Internal Chargeback Revenue, Mesa Lab, Aug 2026 — a credit.
  assert.equal(normalizeAmount(-10525.84, "Revenue"), 10525.84);
  // 5001 Salaries, ES Admin FY26 YTD — a debit.
  assert.equal(normalizeAmount(135104.99, "Expense"), 135104.99);
});

test("a reversed chargeback reduces revenue instead of inflating it", () => {
  // Apr 2026 Event Master reversals posted as debits against 9990. Under
  // Math.abs() these three added $30,405.68 of revenue that never existed.
  const reversals = [4197.75, 2061.0, 8944.09]; // Mesa Lab, Foothills, Center Green
  const total = reversals.reduce((s, v) => s + normalizeAmount(v, "Revenue"), 0);
  assert.equal(Math.round(total * 100) / 100, -15202.84);
});

test("an expense credit memo reduces the expense bucket", () => {
  // Oct 2025 "FY25 No PO Accrual" reversal against 7000, ES Admin.
  assert.equal(normalizeAmount(-545.42, "Expense"), -545.42);
  // May 2026 KitchenAid sales-tax credit against 7750, ES Admin.
  assert.equal(normalizeAmount(-22.82, "Expense"), -22.82);
});

test("rounding to cents is symmetric about zero", () => {
  // The old Math.abs() collapsed both halves onto the positive side. Whatever
  // the cent-rounding does, it must do the mirror image of it below zero.
  for (const v of [1.005, 2.675, 0.125, 12345.6789]) {
    assert.equal(normalizeAmount(-v, "Expense"), -normalizeAmount(v, "Expense"));
    assert.equal(normalizeAmount(-v, "Revenue"), -normalizeAmount(v, "Revenue"));
  }
  assert.equal(normalizeAmount(12345.6789, "Expense"), 12345.68);
  // Sub-cent amounts round away entirely, from either side, and stay +0.
  assert.equal(normalizeAmount(0.004, "Expense"), 0);
  assert.equal(normalizeAmount(-0.004, "Expense"), 0);
});

test("empty and unparseable cells contribute nothing, and never -0", () => {
  for (const empty of [0, -0, "", null, undefined, NaN, "n/a"]) {
    assert.equal(normalizeAmount(empty, "Revenue"), 0);
    assert.ok(!Object.is(normalizeAmount(empty, "Revenue"), -0));
  }
});
