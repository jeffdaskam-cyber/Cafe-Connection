// api/parse-event-revenue.mjs
// Vercel Serverless Function — Cafe Connection
// Parses Internal or External event revenue Excel files and writes totals
// to Firestore event_revenue collection.
//
// POST /api/parse-event-revenue
// Body: { fileUrl, reportType, month?, year? }
// Returns: { success: true, written: [...] }

import admin from "firebase-admin";
import ExcelJS from "exceljs";

// ── Firebase Admin Init (singleton) ─────────────────────────────────────────
let adminApp;
try {
  adminApp = admin.app();
} catch {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const err = new Error("Unauthorized.");
    err.status = 401;
    throw err;
  }
  return adminApp.auth().verifyIdToken(authHeader.slice(7));
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
  await db.collection("event_revenue").doc(docId).set(
    { campus, year, month, monthKey, type, revenue, updated_at: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { campus, year, month, revenue };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try { await verifyAuth(req); }
  catch (err) { return res.status(err.status || 401).json({ error: err.message }); }

  const { fileUrl, reportType, month, year } = req.body;
  if (!fileUrl)     return res.status(400).json({ error: "fileUrl is required" });
  if (!reportType)  return res.status(400).json({ error: "reportType is required" });

  try {
    // Fetch file from Firebase Storage
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // Parse with ExcelJS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    const db      = adminApp.firestore();
    const written = [];
    const totals  = {}; // key: `${campus}|${year}|${month}` → revenue sum

    if (reportType === "internal") {
      if (!month || !year) return res.status(400).json({ error: "month and year required for internal reports" });

      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const rawCampus  = row.getCell(1).value; // column A
        const rawRevenue = row.getCell(7).value; // column G
        const campus     = normalizeCampus(typeof rawCampus === "string" ? rawCampus : String(rawCampus ?? ""));
        const revenue    = parseFloat(rawRevenue) || 0;
        if (!campus || revenue === 0) return;
        const key = `${campus}|${year}|${month}`;
        totals[key] = (totals[key] || 0) + revenue;
      });

      for (const [key, revenue] of Object.entries(totals)) {
        const [campus, y, m] = key.split("|");
        const doc = await writeRevenueDoc(db, campus, Number(y), Number(m), "internal", Math.round(revenue * 100) / 100);
        written.push(doc);
      }
    } else if (reportType === "external") {
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const rawLocation = row.getCell(9).value;  // column I
        const rawAmount   = row.getCell(11).value; // column K
        const rawDate     = row.getCell(6).value;  // column F

        const campus  = campusFromLocation(typeof rawLocation === "string" ? rawLocation : String(rawLocation ?? ""));
        const amount  = parseFloat(rawAmount) || 0;
        if (!campus || amount === 0 || !rawDate) return;

        const date    = rawDate instanceof Date ? rawDate : new Date(rawDate);
        if (isNaN(date.getTime())) return;
        const rowMonth = date.getMonth() + 1;
        const rowYear  = date.getFullYear();

        const key = `${campus}|${rowYear}|${rowMonth}`;
        totals[key] = (totals[key] || 0) + amount;
      });

      for (const [key, revenue] of Object.entries(totals)) {
        const [campus, y, m] = key.split("|");
        const doc = await writeRevenueDoc(db, campus, Number(y), Number(m), "external", Math.round(revenue * 100) / 100);
        written.push(doc);
      }
    } else {
      return res.status(400).json({ error: `Unknown reportType: ${reportType}` });
    }

    return res.status(200).json({ success: true, written });

  } catch (err) {
    console.error("[parse-event-revenue] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
