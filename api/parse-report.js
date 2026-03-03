import ExcelJS from "exceljs";
import pdfParse from "pdf-parse";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { credential } from "firebase-admin";

// ── Init Firebase Admin (reuse across warm invocations) ──────────────────────
if (!getApps().length) {
  initializeApp({
    credential: credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────
function clean(val) {
  if (val == null) return null;
  return Number(String(val).replace(/[$,\s]/g, "")) || null;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function parseExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  let cafe_sales = null, cafe_volume = null, event_volume = null;

  wb.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell, colNum) => {
        const val = String(cell.value || "").toLowerCase().trim();
        const adj = clean(row.getCell(colNum + 1).value);
        if (val.includes("total sales") || val === "net")   cafe_sales   = adj ?? cafe_sales;
        if (val.includes("transaction"))                    cafe_volume  = adj ?? cafe_volume;
        if (val.includes("total events"))                   event_volume = adj ?? event_volume;
      });
    });
  });

  return { cafe_sales, cafe_volume, event_volume };
}

async function parsePDF(buffer) {
  const { text } = await pdfParse(buffer);

  const salesMatch  = text.match(/(?:total\s+sales|net)[^\d]*\$?([\d,]+(?:\.\d{2})?)/i);
  const volMatch    = text.match(/transactions?[^\d]*([\d,]+)/i);
  const eventMatch  = text.match(/total\s+events?[^\d]*([\d,]+)/i);

  return {
    cafe_sales:   salesMatch  ? clean(salesMatch[1])  : null,
    cafe_volume:  volMatch    ? clean(volMatch[1])    : null,
    event_volume: eventMatch  ? clean(eventMatch[1])  : null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { fileUrl, campus, fileName } = req.body;
  if (!fileUrl || !campus) return res.status(400).json({ error: "Missing fileUrl or campus" });

  try {
    const buffer = await fetchBuffer(fileUrl);
    const isPDF  = fileName?.toLowerCase().endsWith(".pdf");
    const parsed = isPDF ? await parsePDF(buffer) : await parseExcel(buffer);

    // Build Firestore document ID: YYYY-MM-DD_CampusName
    const today   = new Date().toISOString().split("T")[0];
    const docId   = `${today}_${campus.replace(/\s+/g, "")}`;

    await db.collection("daily_metrics").doc(docId).set(
      {
        date:         new Date(),
        campus,
        ...(parsed.cafe_sales   != null && { cafe_sales:   parsed.cafe_sales }),
        ...(parsed.cafe_volume  != null && { cafe_volume:  parsed.cafe_volume }),
        ...(parsed.event_volume != null && { event_volume: parsed.event_volume }),
        last_updated: new Date(),
      },
      { merge: true }
    );

    res.status(200).json({ success: true, parsed });
  } catch (err) {
    console.error("parse-report error:", err);
    res.status(500).json({ error: err.message });
  }
}
