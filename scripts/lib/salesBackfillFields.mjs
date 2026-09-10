/**
 * The per-field rules the sales backfills run on.
 *
 * A FieldSpec says which documents count as gaps, what the figure is called,
 * why a parsed report failed to yield one, and — the part that keeps a wrong
 * number out of Firestore — when a figure the report *did* produce must still
 * be refused. These live here rather than in the CLI entry points so the rules
 * deciding which production documents get written are unit tested.
 *
 * See scripts/lib/salesBackfill.mjs for the runner that drives them.
 */

import { needsCreditCardBackfill, needsPayrollBackfill } from "./salesPayroll.mjs";

export const PAYROLL_FIELD = {
  field: "payroll",
  needsBackfill: needsPayrollBackfill,

  /**
   * Three failures with three different fixes: no TENDERS section at all, a
   * payroll row whose amount would not parse, or a payroll row spelled in a way
   * the parser's match does not catch. Only the last is explained by the tender
   * labels, so only it contributes them.
   */
  explainMissing(metrics) {
    if (!metrics.tenders_found)     return "no-tenders-section";
    if (metrics.payroll_unreadable) return "payroll-row-unreadable";
    return "no-payroll-row";
  },

  collectExtras({ metrics, reason, extras }) {
    if (reason !== "no-payroll-row") return;
    extras.tenderLabels ??= new Set();
    for (const label of metrics.tender_labels ?? []) extras.tenderLabels.add(label);
  },

  summaryNotes({ byReason, extras, log }) {
    if (byReason["payroll-row-unreadable"]) {
      log(
        `\n[backfill] ${byReason["payroll-row-unreadable"]} report(s) had a payroll ` +
          "row whose Total cell could not be read as a number — blank, text, or an " +
          "unevaluated formula. The row is there and named correctly, so the parser " +
          "needs no change; the cell does. Nothing was written for those days."
      );
    }
    const labels = extras.tenderLabels;
    if (labels?.size > 0) {
      // The parser takes the payroll row to be one whose label starts with
      // "payroll". A report that reached here had a TENDERS section but no such
      // row, so one of these labels is likely the payroll tender under another
      // name — in which case it is also being counted into credit_card today.
      log(
        `\n[backfill] ${byReason["no-payroll-row"]} report(s) had a TENDERS ` +
          "section with no row starting with \"payroll\". Labels actually read:"
      );
      for (const label of [...labels].sort()) log(`[backfill]   ${label}`);
      log(
        "[backfill] If the payroll tender is among these under another name, the " +
          "parser's match needs widening — and that tender is being added to " +
          "credit_card today. Nothing was written for those days."
      );
    }
  },
};

export const CREDIT_CARD_FIELD = {
  field: "credit_card",
  needsBackfill: needsCreditCardBackfill,

  /**
   * Unlike payroll, credit_card has no "row is missing" case — it is a sum over
   * whichever card rows exist, and none of them is an error. So null means one
   * of exactly two things, and tenders_found tells them apart.
   */
  explainMissing(metrics) {
    return metrics.tenders_found ? "card-row-unreadable" : "no-tenders-section";
  },

  /**
   * A total the report produced can still be wrong, and this is the case that
   * makes it wrong.
   *
   * The parser takes the payroll row to be one whose label starts with
   * "payroll". A label it does not match falls through to the credit-card
   * branch, so a report with a TENDERS section and no recognized payroll row
   * has very likely added the payroll-deduct tender into credit_card — the
   * parser's own tests pin that behaviour. The resulting total is non-null and
   * inflated, which no null check would catch.
   *
   * Backfilling is not the place to resolve that: the fix is to widen the
   * parser's match once the real label is known. Until then the figure is
   * refused, because a wrong number written into a financial record is worse
   * than a gap that is still visibly a gap.
   */
  rejectValue(metrics) {
    if (metrics.tenders_found && metrics.payroll == null && !metrics.payroll_unreadable) {
      return "total-inflated-by-unmatched-payroll";
    }
    return null;
  },

  collectExtras({ metrics, reason, extras }) {
    if (reason !== "total-inflated-by-unmatched-payroll") return;
    extras.tenderLabels ??= new Set();
    for (const label of metrics.tender_labels ?? []) extras.tenderLabels.add(label);
  },

  summaryNotes({ byReason, extras, log }) {
    if (byReason["card-row-unreadable"]) {
      log(
        `\n[backfill] ${byReason["card-row-unreadable"]} report(s) had a card tender ` +
          "row whose Total cell could not be read as a number — blank, text, or an " +
          "unevaluated formula. Summing the rows that did parse would understate " +
          "the day, so nothing was written for those."
      );
    }
    const labels = extras.tenderLabels;
    if (labels?.size > 0) {
      log(
        `\n[backfill] ${byReason["total-inflated-by-unmatched-payroll"]} report(s) had a ` +
          "TENDERS section with no row starting with \"payroll\", so the payroll " +
          "tender was summed into the card total. Labels actually read:"
      );
      for (const label of [...labels].sort()) log(`[backfill]   ${label}`);
      log(
        "[backfill] Those totals are inflated by the payroll amount and were NOT " +
          "written. Widen the parser's payroll match to cover the label above, " +
          "then re-run."
      );
    }
  },
};
