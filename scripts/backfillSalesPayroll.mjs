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
import { PAYROLL_FIELD } from "./lib/salesBackfillFields.mjs";

main(PAYROLL_FIELD, process.argv.slice(2));
