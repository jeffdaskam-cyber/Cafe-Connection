// api/parse-fpa-report.mjs
// Vercel Serverless Function — Cafe Connection
// Parses a Workday Operating Budget Report (Project Hierarchy) .xlsx,
// normalizes the mapped financial data, and upserts monthly FP&A facts.
//
// POST /api/parse-fpa-report
// Body: { fileUrl, monthOverride? ("YYYY-MM") }
// Returns: { success, monthKey, written, overwritten, warnings }
//
// Behavior:
//   - Only the approved project blocks are ingested: the four campus blocks in
//     full, plus revenue-only blocks (Unrelated Business Income, Cafe Special
//     Functions) whose revenue rows count toward the totals and whose expense
//     rows are skipped. Parsing lives in api/_lib/fpaReport.mjs.
//   - Only the twelve mapped ledger rows are read; ledger codes 5051 and 9989
//     both normalize to "Benefits" and are stored as separate facts with the
//     same normalizedName (selectors sum them downstream).
//   - Revenue and sales tax are flipped from Workday's credit convention to
//     positive so charts compare them against expenses on one scale; expenses
//     keep Workday's sign. Either way the posting's own sign survives, so
//     credit memos and reversals reduce their bucket instead of inflating it.
//     See api/_lib/fpaAmounts.mjs.
//   - Re-uploading a month overwrites that month's stored facts; prior months
//     are preserved.
//   - Hard fails if period parsing fails, the file shape is invalid, or no
//     valid FP&A records are found. Soft warnings are returned for missing
//     campus project blocks or missing expected ledger rows.

import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import ExcelJS from "exceljs";
import { FISCAL_START_MONTH, parseFpaWorkbook } from "./_lib/fpaReport.mjs";
import {
  getAdminApp,
  fetchWithTimeout,
  respondWithError,
  respondWithInternalError,
  createHttpError,
  isValidStorageUrl,
  requireEnv,
} from "./_lib/serverless.mjs";

// ── Env + Admin init ─────────────────────────────────────────────────────────
const SCOPE = "parse-fpa-report";
requireEnv(SCOPE, process.env, [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "ALLOWED_STORAGE_BUCKET",
]);
const adminApp = getAdminApp(process.env, SCOPE);

// ── Auth ─────────────────────────────────────────────────────────────────────
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw createHttpError("Unauthorized.", 401);
  const decoded = await getAuth(adminApp).verifyIdToken(authHeader.slice(7));
  if (!decoded.email?.toLowerCase().endsWith("@ucar.edu")) {
    throw createHttpError("Forbidden.", 403);
  }
  return decoded;
}

// ── Firestore write ──────────────────────────────────────────────────────────
function fiscalMonthNumberFor(calendarMonth) {
  return ((calendarMonth - FISCAL_START_MONTH + 12) % 12) + 1;
}
function fiscalYearFor(calendarYear, calendarMonth) {
  return calendarMonth >= FISCAL_START_MONTH ? calendarYear + 1 : calendarYear;
}
function monthKeyFor(calendarYear, calendarMonth) {
  return `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`;
}
function monthLabelFor(calendarYear, calendarMonth) {
  return new Date(calendarYear, calendarMonth - 1, 1).toLocaleDateString("en-US", {
    month: "short", year: "numeric",
  });
}
function campusSlug(campus) { return campus.replace(/\s+/g, "_"); }
function fpaFactDocId(monthKey, campus, ledgerCode) {
  return `fpa_${monthKey}_${campusSlug(campus)}_${ledgerCode}`;
}

async function upsertFacts(db, period, facts, sourceFileName) {
  const monthKey = monthKeyFor(period.year, period.month);
  const monthLabel = monthLabelFor(period.year, period.month);
  const fiscalYear = fiscalYearFor(period.year, period.month);
  const fiscalMonthNumber = fiscalMonthNumberFor(period.month);
  const uploadedAt = FieldValue.serverTimestamp();

  // Delete any existing facts for this monthKey (ensures overwrite semantics).
  const factsCol = db.collection("fpa_facts");
  const existingSnap = await factsCol.where("monthKey", "==", monthKey).get();
  const overwritten = existingSnap.size;

  // Firestore batches cap at 500 ops; 6 projects × 12 ledgers = 72 at most,
  // plus deletes up to the same. Well under the limit.
  const batch = db.batch();
  existingSnap.docs.forEach(d => batch.delete(d.ref));

  for (const f of facts) {
    const ref = factsCol.doc(fpaFactDocId(monthKey, f.campus, f.ledgerCode));
    batch.set(ref, {
      ...f,
      monthKey,
      monthLabel,
      fiscalYear,
      fiscalMonthNumber,
      calendarYear: period.year,
      calendarMonth: period.month,
      sourceFileName,
      uploadedAt,
    });
  }

  await batch.commit();
  return { monthKey, written: facts.length, overwritten };
}

async function recordUpload(db, { monthKey, sourceFileName, written, overwritten, warnings, uid }) {
  await db.collection("fpa_uploads").add({
    monthKey,
    sourceFileName,
    recordsWritten: written,
    recordsOverwritten: overwritten,
    overwroteExistingMonth: overwritten > 0,
    warnings,
    uploadedByUid: uid ?? null,
    uploadedAt: FieldValue.serverTimestamp(),
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let decoded;
  try { decoded = await verifyAuth(req); }
  catch (err) { return respondWithError(res, err, 401); }

  const { fileUrl, monthOverride } = req.body || {};
  if (!fileUrl || typeof fileUrl !== "string") {
    return res.status(400).json({ error: "fileUrl is required" });
  }
  if (!isValidStorageUrl(fileUrl, process.env.ALLOWED_STORAGE_BUCKET)) {
    return res.status(400).json({ error: "Invalid fileUrl: must be a Firebase Storage URL for this project." });
  }

  let override = null;
  if (monthOverride !== undefined && monthOverride !== null && monthOverride !== "") {
    if (typeof monthOverride !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(monthOverride)) {
      return res.status(400).json({ error: "Invalid monthOverride. Expected format 'YYYY-MM'." });
    }
    const [y, m] = monthOverride.split("-").map(Number);
    override = { year: y, month: m };
  }

  try {
    const fileRes = await fetchWithTimeout(fileUrl);
    if (!fileRes.ok) throw createHttpError(`Failed to fetch file: ${fileRes.status}`, 502);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // Extract filename from storage URL for traceability
    let sourceFileName = "fpa-report.xlsx";
    try {
      const pathname = new URL(fileUrl).pathname;
      const segment = pathname.split("/").pop() || sourceFileName;
      sourceFileName = decodeURIComponent(segment.split("?")[0]);
    } catch { /* keep default */ }

    const { period: detected, facts, warnings } = parseFpaWorkbook(workbook);
    const period = override ?? detected;

    const db = getFirestore(adminApp);
    const { monthKey, written, overwritten } = await upsertFacts(db, period, facts, sourceFileName);
    await recordUpload(db, {
      monthKey, sourceFileName, written, overwritten, warnings,
      uid: decoded?.uid,
    });

    return res.status(200).json({
      success: true,
      monthKey,
      written,
      overwritten,
      overwroteExistingMonth: overwritten > 0,
      warnings,
    });
  } catch (err) {
    if (err.status) return respondWithError(res, err, err.status);
    return respondWithInternalError(res, SCOPE, err);
  }
}
