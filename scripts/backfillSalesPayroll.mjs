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
 * is reported, not guessed at.
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

import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { parseExcel } from "../api/_lib/salesReport.mjs";
// initAdmin/isEmulator/commitInBatches are generic Admin SDK plumbing; they
// live in the catering lib only because that is where they were first needed.
import { commitInBatches, initAdmin, isEmulator } from "./lib/cateringAdmin.mjs";
import {
  VOLUME_CAMPUSES, classifyGap, indexReportsBySourceFile, needsPayrollBackfill,
} from "./lib/salesPayroll.mjs";

const REPORTS_PREFIX = "reports/";

// A re-parsed report must describe the same day as the document it fills, or
// the payroll figure belongs to some other day. Revenue is compared to the cent
// and checks exactly; anything else is reported rather than written.
const REVENUE_TOLERANCE = 0.01;

function parseArgs(argv) {
  const args = { commit: false, campus: null, since: null, limit: Infinity };
  for (const arg of argv) {
    if (arg === "--commit") args.commit = true;
    else if (arg.startsWith("--campus=")) args.campus = arg.slice("--campus=".length);
    else if (arg.startsWith("--since=")) args.since = arg.slice("--since=".length);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.campus && !VOLUME_CAMPUSES.includes(args.campus)) {
    throw new Error(`--campus must be one of: ${VOLUME_CAMPUSES.join(", ")}`);
  }
  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) {
    throw new Error("--since must be YYYY-MM-DD");
  }
  if (!Number.isFinite(args.limit) && args.limit !== Infinity) {
    throw new Error("--limit must be a number");
  }
  return args;
}

/** Refuse to write to a real project without a deliberate opt-in. */
function assertWriteAllowed() {
  if (isEmulator()) return;
  if (process.env.ALLOW_PRODUCTION_WRITE === "true") return;
  throw new Error(
    "Refusing to write to live Firebase project " +
      `'${process.env.FIREBASE_ADMIN_PROJECT_ID || "unknown"}'.\n` +
      "Re-run without --commit for a dry run, point at the emulator " +
      "(FIRESTORE_EMULATOR_HOST=127.0.0.1:8080), or set " +
      "ALLOW_PRODUCTION_WRITE=true to write to the live project deliberately."
  );
}

function bucketName() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.ALLOWED_STORAGE_BUCKET;
  if (!name) {
    throw new Error(
      "Set FIREBASE_STORAGE_BUCKET (or ALLOWED_STORAGE_BUCKET) to the bucket " +
        "holding reports/ — the archived sales reports are read from it."
    );
  }
  return name;
}

function toDateString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const d = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Does a re-parsed report describe the same day as the document it would fill? */
function describesSameDay(doc, metrics) {
  if (doc.net_revenue != null && metrics.net_revenue != null &&
      Math.abs(doc.net_revenue - metrics.net_revenue) > REVENUE_TOLERANCE) return false;
  if (doc.total_checks != null && metrics.total_checks != null &&
      doc.total_checks !== metrics.total_checks) return false;
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.commit) assertWriteAllowed();

  const app = initAdmin();
  const db = getFirestore(app);

  const target = isEmulator()
    ? `EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST}`
    : `LIVE PROJECT ${process.env.FIREBASE_ADMIN_PROJECT_ID}`;
  console.log(`[backfill] target: ${target}`);
  console.log(`[backfill] mode:   ${args.commit ? "COMMIT — will write" : "DRY RUN — no writes"}`);

  // The collection is small (one document per campus per day) and Firestore
  // cannot query for an absent field, so scan and filter in memory.
  const snap = await db.collection("daily_metrics").get();
  const candidates = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!needsPayrollBackfill(data)) continue;
    if (args.campus && data.campus !== args.campus) continue;
    const dateStr = toDateString(data.date);
    if (args.since && (!dateStr || dateStr < args.since)) continue;
    candidates.push({ ref: docSnap.ref, id: docSnap.id, data, dateStr });
  }
  candidates.sort((a, b) => (a.dateStr ?? "").localeCompare(b.dateStr ?? ""));
  const selected = candidates.slice(0, args.limit === Infinity ? undefined : args.limit);

  console.log(
    `[backfill] ${snap.size} daily_metrics documents, ` +
      `${candidates.length} missing payroll, ${selected.length} in scope.`
  );
  if (selected.length === 0) {
    console.log("[backfill] Nothing to do.");
    return;
  }

  const bucket = getStorage(app).bucket(bucketName());
  const [files] = await bucket.getFiles({ prefix: REPORTS_PREFIX });
  const reportIndex = indexReportsBySourceFile(files.map(f => f.name));
  console.log(`[backfill] ${files.length} archived reports under ${REPORTS_PREFIX}`);

  const writes = [];
  const skipped = [];
  let recovered = 0;

  for (const candidate of selected) {
    const { data, dateStr, id } = candidate;
    const objectName = data.source_file ? reportIndex.get(data.source_file) : null;
    const gap = classifyGap(data, objectName);
    if (gap) {
      skipped.push({ id, dateStr, campus: data.campus, reason: gap });
      continue;
    }

    let metrics;
    try {
      const [buffer] = await bucket.file(objectName).download();
      metrics = await parseExcel(buffer);
    } catch (err) {
      skipped.push({ id, dateStr, campus: data.campus, reason: `parse-failed: ${err.message}` });
      continue;
    }

    if (metrics.payroll == null) {
      skipped.push({ id, dateStr, campus: data.campus, reason: "no-payroll-in-report" });
      continue;
    }
    if (!describesSameDay(data, metrics)) {
      skipped.push({ id, dateStr, campus: data.campus, reason: "report-does-not-match-document" });
      continue;
    }

    recovered++;
    console.log(
      `[backfill] ${dateStr} ${data.campus.padEnd(12)} payroll ${metrics.payroll.toFixed(2)}  (${objectName})`
    );
    writes.push({ ref: candidate.ref, data: { payroll: metrics.payroll } });
  }

  const byReason = {};
  for (const s of skipped) {
    const key = s.reason.startsWith("parse-failed") ? "parse-failed" : s.reason;
    byReason[key] = (byReason[key] ?? 0) + 1;
  }

  console.log(`\n[backfill] recoverable: ${recovered}`);
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`[backfill] skipped ${String(count).padStart(4)}  ${reason}`);
  }
  if (byReason["not-excel"]) {
    console.log(
      "\n[backfill] PDF reports carry no readable TENDERS section. Re-upload " +
        "those days as .xlsx on the Weekly Ops tab and re-run to recover them."
    );
  }

  if (!args.commit) {
    console.log("\n[backfill] DRY RUN — nothing written. Re-run with --commit to apply.");
    return;
  }
  if (writes.length === 0) {
    console.log("\n[backfill] Nothing recoverable to write.");
    return;
  }

  await commitInBatches(db, writes);
  console.log(`\n[backfill] wrote payroll to ${writes.length} documents.`);
}

main().catch(err => {
  console.error(`[backfill] ${err.message}`);
  process.exitCode = 1;
});
