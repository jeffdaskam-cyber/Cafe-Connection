#!/usr/bin/env node
/**
 * Backfill the `credit_card` field on daily_metrics documents missing it.
 *
 * Why documents are missing it:
 *   - Days that took no card payment. Until the parser distinguished them,
 *     `credit_card: creditCard || null` coerced a real total of 0 into null, so
 *     a day with only Payroll and Subtotal rows was stored as though its card
 *     figure were unknown. These are the bulk of the gaps and the reason this
 *     script exists.
 *   - PDF uploads. parsePdf cannot read the TENDERS section.
 *   - Excel uploads whose TENDERS section did not match the expected layout.
 *
 * Nothing is invented or apportioned. Each gap is filled by re-parsing the
 * original report still in Storage with the same parser the upload endpoint
 * uses (api/_lib/salesReport.mjs), so a backfilled figure is identical to what
 * the upload would write today. A report that cannot produce a figure is
 * reported, not guessed at — and since the fix, a card row whose amount will
 * not parse is one of those cases rather than a silent 0. A total the parser
 * inflated by summing an unrecognized payroll row into it is refused too; see
 * CREDIT_CARD_FIELD in scripts/lib/salesBackfillFields.mjs.
 *
 * Usage:
 *   # Dry run — reads everything, writes nothing, prints what it would do.
 *   node scripts/backfillSalesCreditCard.mjs
 *
 *   # Against the sandbox emulator.
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfillSalesCreditCard.mjs --commit
 *
 *   # Against the live project — prints the project id and requires the opt-in.
 *   ALLOW_PRODUCTION_WRITE=true node scripts/backfillSalesCreditCard.mjs --commit
 *
 * Options:
 *   --commit           Write the recovered figures. Without it, nothing is written.
 *   --campus=<name>    Limit to one campus (e.g. --campus="Mesa Lab").
 *   --since=<date>     Only documents on or after this date (YYYY-MM-DD).
 *   --limit=<n>        Stop after n documents. Useful for a first pass.
 */

import { main } from "./lib/salesBackfill.mjs";
import { CREDIT_CARD_FIELD } from "./lib/salesBackfillFields.mjs";

main(CREDIT_CARD_FIELD, process.argv.slice(2));
