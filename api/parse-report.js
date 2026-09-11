/**
 * api/parse-report.js — Vercel Serverless Function.
 *
 * POST /api/parse-report
 * Accepts { fileUrl, campus, fileName } in the request body.
 * Fetches the file from Firebase Storage, detects PDF vs Excel by extension,
 * parses revenue/check/tax/cash fields, and writes the result to Firestore
 * daily_metrics/{YYYY-MM-DD_CampusName} with merge: true.
 *
 * A period Sales Summary carries one worksheet per campus, so an Excel upload
 * can produce several documents — one per campus — written in a single batch.
 * Reading only the first sheet dropped the rest silently, which left months
 * with café traffic and no payroll-deduct total behind them.
 */

import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import {
  createHttpError,
  fetchWithTimeout,
  getAdminApp,
  isValidStorageUrl,
  requireEnv,
  respondWithError,
  respondWithInternalError,
} from "./_lib/serverless.mjs";
import { parseExcelAll, parsePdf } from "./_lib/salesReport.mjs";

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "ALLOWED_STORAGE_BUCKET",
];
requireEnv("parse-report", process.env, REQUIRED_ENV);
const adminApp = getAdminApp(process.env, "parse-report");
const db = getFirestore(adminApp);

// ─── Auth verification ────────────────────────────────────────────────────────
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw createHttpError("Missing or invalid Authorization header.", 401);
  }
  const decoded = await getAuth(adminApp).verifyIdToken(authHeader.slice(7));
  if (!decoded.email?.toLowerCase().endsWith("@ucar.edu")) {
    throw createHttpError("Forbidden.", 403);
  }
  return decoded;
}



// ─── Main Handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Require authenticated UCAR user ────────────────────────────────────────
  try {
    await verifyAuth(req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  const { fileUrl, campus: campusFallback, fileName } = req.body;

  if (!fileUrl || !fileName) {
    return res.status(400).json({ error: "Missing required fields: fileUrl, fileName" });
  }

  // ── Validate fileUrl is a Firebase Storage URL for this project ────────────
  if (typeof fileUrl !== "string" || !isValidStorageUrl(fileUrl, process.env.ALLOWED_STORAGE_BUCKET)) {
    return res.status(400).json({ error: "Invalid fileUrl: must be a Firebase Storage URL for this project." });
  }

  // ── Validate fileName length and characters ───────────────────────────────
  if (typeof fileName !== "string" || fileName.length === 0 || fileName.length > 255) {
    return res.status(400).json({ error: "Invalid fileName." });
  }

  // ── Validate optional campusFallback when provided ────────────────────────
  const VALID_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
  if (campusFallback !== undefined && campusFallback !== null &&
      (typeof campusFallback !== "string" || !VALID_CAMPUSES.includes(campusFallback))) {
    return res.status(400).json({ error: "Invalid campus." });
  }

  try {
    let fileBuffer;
    const fileResponse = await fetchWithTimeout(fileUrl);
    if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}`);
    fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    const isExcel = /\.(xlsx|xls)$/i.test(fileName);
    const isPdf   = /\.pdf$/i.test(fileName);

    // A period workbook holds a sheet per campus; a PDF or a daily Excel holds
    // one report. Both become a list so there is a single path below.
    let sheets;
    let skipped = [];

    if (isExcel) {
      const parsed = await parseExcelAll(fileBuffer);
      sheets = parsed.results;
      skipped = parsed.failures;
    } else if (isPdf) {
      sheets = [await parsePdf(fileBuffer)];
    } else {
      return res.status(400).json({ error: "Unsupported file type. Please upload a .xlsx or .pdf file." });
    }

    // The campus fallback names one campus, so it can only stand in for a
    // single-report file. Applying it across a multi-campus workbook would
    // file other campuses' figures under the named one.
    const allowFallback = sheets.length === 1;

    const batch = db.batch();
    const written = [];
    const rejected = [];
    const seenDocIds = new Map();

    for (const metrics of sheets) {
      const sheetName = metrics.sheet_name ?? null;
      const campus = metrics.detectedCampus || (allowFallback ? campusFallback : null);

      if (!campus || !VALID_CAMPUSES.includes(campus)) {
        rejected.push({
          sheet: sheetName,
          error: `Could not determine campus. Detected: "${metrics.detectedCampus || "none"}". ` +
            `Expected: ${VALID_CAMPUSES.join(", ")}.`,
        });
        continue;
      }

      const campusSlug = campus.replace(/\s+/g, "");
      const isPeriod   = metrics.period_end && metrics.period_end !== metrics.period_start;
      const docId      = isPeriod
        ? `period_${metrics.period_start}_${metrics.period_end}_${campusSlug}`
        : `${metrics.date}_${campusSlug}`;

      // Two sheets landing on one document id would leave only the last one
      // written, losing a campus to the very silence this endpoint now avoids.
      if (seenDocIds.has(docId)) {
        rejected.push({
          sheet: sheetName,
          error: `Sheet resolves to the same document as "${seenDocIds.get(docId)}" (${docId}). ` +
            "Two sheets report the same campus and period.",
        });
        continue;
      }
      seenDocIds.set(docId, sheetName ?? campus);

      const docData = {
        date:            Timestamp.fromDate(new Date(metrics.date + "T12:00:00")),
        report_type:     isPeriod ? "period" : "daily",
        campus,
        net_revenue:     metrics.net_revenue,
        total_checks:    metrics.total_checks,
        lunch_avg_check: metrics.lunch_avg_check,
        // Extended fields from Excel
        ...(metrics.breakfast_net_revenue !== undefined && { breakfast_net_revenue: metrics.breakfast_net_revenue }),
        ...(metrics.lunch_net_revenue     !== undefined && { lunch_net_revenue:     metrics.lunch_net_revenue     }),
        ...(metrics.gross_revenue         !== undefined && { gross_revenue:         metrics.gross_revenue         }),
        ...(metrics.discounts             !== undefined && { discounts:             metrics.discounts             }),
        ...(metrics.breakfast_checks      !== undefined && { breakfast_checks:      metrics.breakfast_checks      }),
        ...(metrics.lunch_checks          !== undefined && { lunch_checks:          metrics.lunch_checks          }),
        ...(metrics.breakfast_avg_check   !== undefined && { breakfast_avg_check:   metrics.breakfast_avg_check   }),
        ...(metrics.period_start          !== undefined && { period_start:          metrics.period_start          }),
        ...(metrics.period_end            !== undefined && { period_end:            metrics.period_end            }),
        // Month-end accounting fields
        ...(metrics.total_taxes !== undefined && { total_taxes:  metrics.total_taxes  }),
        ...(metrics.cash_drop   !== undefined && { cash_drop:    metrics.cash_drop    }),
        ...(metrics.payroll     !== undefined && { payroll:      metrics.payroll      }),
        ...(metrics.credit_card !== undefined && { credit_card:  metrics.credit_card  }),
        source_file:  fileName,
        ...(sheetName !== null && { source_sheet: sheetName }),
        parse_method: isExcel ? "excel" : "pdf",
        last_updated: FieldValue.serverTimestamp(),
      };

      batch.set(db.collection("daily_metrics").doc(docId), docData, { merge: true });
      written.push({ docId, campus, sheet: sheetName, metrics });
    }

    if (written.length === 0) {
      return res.status(400).json({
        error: "No campus report could be read from this file.",
        rejected,
        skipped,
      });
    }

    // One batch: a file either files every campus it carries or none of them.
    await batch.commit();

    // docId/campus/metrics stay singular for existing callers; campus lists
    // every campus filed so an operator sees at a glance that a three-campus
    // workbook filed three.
    return res.status(200).json({
      success: true,
      docId:   written[0].docId,
      campus:  written.map(w => w.campus).join(", "),
      metrics: written[0].metrics,
      results: written.map(({ docId, campus, sheet }) => ({ docId, campus, sheet })),
      rejected,
      skipped,
    });

  } catch (err) {
    return respondWithInternalError(res, "parse-report", err, { detail: err?.message });
  }
}
