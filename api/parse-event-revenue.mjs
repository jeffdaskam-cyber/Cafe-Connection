// api/parse-event-revenue.mjs
// Vercel Serverless Function — Cafe Connection
// Parses Internal or External event revenue Excel files and writes totals
// to Firestore event_revenue collection.
//
// POST /api/parse-event-revenue
// Body: { fileUrl, reportType, month?, year? }
// Returns: { success: true, written: [...] }

import { cert, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import ExcelJS from "exceljs";

// ── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "ALLOWED_STORAGE_BUCKET",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`[parse-event-revenue] Missing required env var: ${key}`);
}

// ── Firebase Admin Init (singleton) ─────────────────────────────────────────
let adminApp;
try {
  adminApp = getApp();
} catch {
  adminApp = initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

// ── Fetch with timeout ──────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── SSRF protection: only allow files from our Firebase Storage bucket ──────
const ALLOWED_STORAGE_HOST   = "firebasestorage.googleapis.com";
const ALLOWED_STORAGE_BUCKET = process.env.ALLOWED_STORAGE_BUCKET;

function isValidStorageUrl(url) {
  if (!ALLOWED_STORAGE_BUCKET) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return (
      hostname === ALLOWED_STORAGE_HOST &&
      pathname.includes(ALLOWED_STORAGE_BUCKET)
    );
  } catch {
    return false;
  }
}

const VALID_REPORT_TYPES = ["internal", "external"];

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const err = new Error("Unauthorized.");
    err.status = 401;
    throw err;
  }
  const decoded = await getAuth(adminApp).verifyIdToken(authHeader.slice(7));
  if (!decoded.email?.toLowerCase().endsWith("@ucar.edu")) {
    const err = new Error("Forbidden.");
    err.status = 403;
    throw err;
  }
  return decoded;
}

// ── Campus normalization ─────────────────────────────────────────────────────
function normalizeCampus(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "Center Green") return "Center Green";
  if (s === "Foothills Lab" || s === "Foothills") return "Foothills";
  if (s === "Mesa Lab") return "Mesa Lab";
  return null;
}

function campusFromLocation(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (s.startsWith("CG")) return "Center Green";
  if (s.startsWith("FL")) return "Foothills";
  if (s.startsWith("ML")) return "Mesa Lab";
  return null;
}

// ── Firestore write ──────────────────────────────────────────────────────────
async function writeRevenueDoc(db, campus, year, month, type, revenue) {
  const monthKey   = `${year}-${String(month).padStart(2, "0")}`;
  const campusSlug = campus.replace(/\s+/g, "_");
  const docId      = `eventrev_${monthKey}_${campusSlug}_${type}`;
  const ref        = db.collection("event_revenue").doc(docId);

  // Use a transaction so that re-uploads ADD to the existing total
  // rather than overwriting it. The first upload creates the doc; subsequent
  // uploads accumulate into it. To reset a month, delete the doc in Firestore first.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data().revenue || 0) : 0;
    tx.set(ref, {
      campus, year, month, monthKey, type,
      revenue: Math.round((existing + revenue) * 100) / 100,
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  return { campus, year, month, revenue };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try { await verifyAuth(req); }
  catch (err) { return res.status(err.status || 401).json({ error: err.message }); }

  const { fileUrl, reportType, month, year } = req.body || {};
  if (!fileUrl)    return res.status(400).json({ error: "fileUrl is required" });
  if (!reportType) return res.status(400).json({ error: "reportType is required" });

  // Validate fileUrl is a Firebase Storage URL for this project
  if (typeof fileUrl !== "string" || !isValidStorageUrl(fileUrl)) {
    return res.status(400).json({ error: "Invalid fileUrl: must be a Firebase Storage URL for this project." });
  }

  // Validate reportType against allowlist
  if (typeof reportType !== "string" || !VALID_REPORT_TYPES.includes(reportType)) {
    return res.status(400).json({ error: `Invalid reportType. Must be one of: ${VALID_REPORT_TYPES.join(", ")}` });
  }

  // Validate month/year if provided (required for internal, but pre-validate for both)
  let monthNum = null;
  let yearNum  = null;
  if (month !== undefined && month !== null) {
    monthNum = Number(month);
    if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12 || !Number.isInteger(monthNum)) {
      return res.status(400).json({ error: "Invalid month. Must be an integer 1-12." });
    }
  }
  if (year !== undefined && year !== null) {
    yearNum = Number(year);
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100 || !Number.isInteger(yearNum)) {
      return res.status(400).json({ error: "Invalid year. Must be an integer 2000-2100." });
    }
  }

  try {
    // Fetch file from Firebase Storage
    const fileRes = await fetchWithTimeout(fileUrl);
    if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // Parse with ExcelJS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    const db      = getFirestore(adminApp);
    const written = [];
    const totals  = {}; // key: `${campus}|${year}|${month}` → revenue sum

    if (reportType === "internal") {
      if (monthNum === null || yearNum === null) {
        return res.status(400).json({ error: "month and year required for internal reports" });
      }

      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const rawCampus  = row.getCell(1).value; // column A
        const rawRevenue = row.getCell(7).value; // column G
        const campus     = normalizeCampus(typeof rawCampus === "string" ? rawCampus : String(rawCampus ?? ""));
        const revenue    = parseFloat(rawRevenue) || 0;
        if (!campus || revenue === 0) return;
        const key = `${campus}|${yearNum}|${monthNum}`;
        totals[key] = (totals[key] || 0) + revenue;
      });

      for (const [key, revenue] of Object.entries(totals)) {
        const [campus, y, m] = key.split("|");
        const doc = await writeRevenueDoc(db, campus, Number(y), Number(m), "internal", Math.round(revenue * 100) / 100);
        written.push(doc);
      }
    } else {
      // reportType === "external" (validated above)
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const rawLocation   = row.getCell(9).value;   // column I — Location
        const rawAmount     = row.getCell(11).value;  // column K — Amount
        const rawDate       = row.getCell(6).value;   // column F — EventDate
        const rawTaxGroup   = row.getCell(10).value;  // column J — TaxTypeGrouping

        const campus  = campusFromLocation(typeof rawLocation === "string" ? rawLocation : String(rawLocation ?? ""));
        const amount  = parseFloat(rawAmount) || 0;

        // Only count Food and Alcohol rows — exclude Surcharge, Tax 1, Room Charge, etc.
        const taxGroup = typeof rawTaxGroup === "string" ? rawTaxGroup.trim() : "";
        const isRevenue = taxGroup === "Food" || taxGroup === "Alcohol";
        if (!campus || amount === 0 || !rawDate || !isRevenue) return;

        let date;
        if (rawDate instanceof Date) {
          date = rawDate;
        } else if (typeof rawDate === "number") {
          // Excel serial date → JS Date
          // Excel epoch is Dec 30, 1899; subtract 25569 days to get Unix epoch days,
          // then convert to milliseconds. The + 0.5 centres on noon to avoid DST edge cases.
          date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
        } else {
          date = new Date(rawDate);
        }
        if (isNaN(date.getTime())) return;
        const rowMonth = date.getUTCMonth() + 1;
        const rowYear  = date.getUTCFullYear();

        const key = `${campus}|${rowYear}|${rowMonth}`;
        totals[key] = (totals[key] || 0) + amount;
      });

      for (const [key, revenue] of Object.entries(totals)) {
        const [campus, y, m] = key.split("|");
        const doc = await writeRevenueDoc(db, campus, Number(y), Number(m), "external", Math.round(revenue * 100) / 100);
        written.push(doc);
      }
    }

    return res.status(200).json({ success: true, written });

  } catch (err) {
    console.error("[parse-event-revenue] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
