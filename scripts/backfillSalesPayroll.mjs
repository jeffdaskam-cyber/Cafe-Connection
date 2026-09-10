#!/usr/bin/env node
/**
 * Backfill the `payroll` field on daily_metrics documents that are missing it.
 *
 * Why documents are missing it:
 *   - PDF uploads. parsePdf cannot read the TENDERS section, so every
 *     PDF-sourced document was written with payroll: null.
 *   - Excel uploads whose TENDERS section did not match the expected layout.
 *   - Documents written before the parser read payroll at all.
 *
 * Nothing is invented or apportioned. Each gap is filled by re-parsing the
 * original report still in Storage with the same parser the upload endpoint
 * uses (api/_lib/salesReport.mjs), so a backfilled figure is identical to what
 * the upload would have written. A report that cannot produce a payroll figure
 * is reported, not guessed at. See scripts/lib/salesBackfill.mjs for the runner
 * this shares with the other sales backfills.
 *
 * Usage:
 *   # Dry run — reads everything, writes nothing, prints what it would do.
 *   node scripts/backfillSalesPayroll.mjs
 *
 *   # Against the sandbox emulator.
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfillSalesPayroll.mjs --commit
 *
 *   # Against the live project — prints the project id and requires the opt-in.
 *   ALLOW_PRODUCTION_WRITE=true node scripts/backfillSalesPayroll.mjs --commit
 *
 * Options:
 *   --commit           Write the recovered figures. Without it, nothing is written.
 *   --campus=<name>    Limit to one campus (e.g. --campus="Mesa Lab").
 *   --since=<date>     Only documents on or after this date (YYYY-MM-DD).
 *   --limit=<n>        Stop after n documents. Useful for a first pass.
 */

import { main } from "./lib/salesBackfill.mjs";
import { needsPayrollBackfill } from "./lib/salesPayroll.mjs";

main({
  field: "payroll",
  needsBackfill: needsPayrollBackfill,

  /**
   * Three failures with three different fixes: no TENDERS section at all, a
   * payroll row whose amount would not parse, or a payroll row spelled in a way
   * the parser's match does not catch. Only the last is explained by the tender
   * labels, so only it contributes them.
   */
  explainMissing(metrics) {
    if (!metrics.tenders_found)  return "no-tenders-section";
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
}, process.argv.slice(2));
