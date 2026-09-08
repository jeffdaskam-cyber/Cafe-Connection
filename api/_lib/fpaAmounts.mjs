// api/_lib/fpaAmounts.mjs
// Sign normalization for Workday Operating Budget Report amounts.
//
// Workday posts revenue as credits (negative) and expenses as debits
// (positive). The dashboard charts the two buckets side by side, so revenue
// and sales tax are flipped to positive on the way in while expenses keep the
// sign Workday gave them.
//
// What matters is that the sign of the underlying posting survives either
// flip: a credit memo, an accrual reversal or a reversed chargeback stays
// negative and reduces its bucket. Taking Math.abs() instead — as the parser
// did until FY26 — turns every reversal into an addition, so a reversed
// $8,944 Event Master chargeback adds $8,944 of revenue rather than removing
// it.

// Ledger category → does a Workday credit mean "more of this bucket"?
// "Tax" is 4314 Sales Tax Collected, which the selectors report as revenue.
const CREDIT_POSITIVE_CATEGORIES = new Set(["Revenue", "Tax"]);

/** +1 to keep Workday's sign (expenses), -1 to flip it (revenue, sales tax). */
export function signForCategory(category) {
  return CREDIT_POSITIVE_CATEGORIES.has(category) ? -1 : 1;
}

/**
 * Round a raw cell value to cents and orient it for the given ledger category.
 * Non-numeric input becomes 0. Never returns -0.
 */
export function normalizeAmount(rawValue, category) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return 0;
  // Round the magnitude so halves break away from zero in both directions,
  // matching how positive amounts have always been rounded here.
  const magnitude = Math.round(Math.abs(n) * 100) / 100;
  if (magnitude === 0) return 0;
  return magnitude * Math.sign(n) * signForCategory(category);
}
