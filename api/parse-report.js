// api/parse-report.js
// Vercel Serverless Function — Cafe Connection
// Parses InfoGenesis Sales Summary reports (Excel or PDF) and writes to Firestore.
//
// POST body: { fileUrl: string, campus: string, fileName: string }
// Returns:   { success: true, docId: string, metrics: object }

import admin from "firebase-admin";
import ExcelJS from "exceljs";
import pdfParse from "pdf-parse";

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel stores the private key with literal \n — replace them back
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// ─── Main Handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileUrl, campus, fileName } = req.body;

  if (!fileUrl || !campus || !fileName) {
    return res.status(400).json({ error: "Missing required fields: fileUrl, campus, fileName" });
  }

  const validCampuses = ["Mesa Lab", "Foothills", "Center Green"];
  if (!validCampuses.includes(campus)) {
    return res.status(400).json({ error: `Invalid campus. Must be one of: ${validCampuses.join(", ")}` });
  }

  try {
    // Fetch the file from Firebase Storage
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file from storage: ${fileResponse.statusText}`);
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    // Route to the correct parser based on file extension
    const isExcel = /\.(xlsx|xls)$/i.test(fileName);
    const isPdf   = /\.pdf$/i.test(fileName);

    let metrics;
    if (isExcel) {
      metrics = await parseExcel(fileBuffer);
    } else if (isPdf) {
      metrics = await parsePdf(fileBuffer);
    } else {
      return res.status(400).json({ error: "Unsupported file type. Please upload a .xlsx or .pdf file." });
    }

    // Build Firestore document ID
    // Daily report:  {YYYY-MM-DD}_{CampusName}          e.g. 2026-03-08_Foothills
    // Period report: period_{YYYY-MM-DD}_{YYYY-MM-DD}_{CampusName} e.g. period_2026-02-01_2026-02-28_Foothills
    const campusSlug = campus.replace(/\s+/g, "");
    const isPeriod = metrics.period_end && metrics.period_end !== metrics.period_start;
    const docId = isPeriod
      ? `period_${metrics.period_start}_${metrics.period_end}_${campusSlug}`
      : `${metrics.date}_${campusSlug}`;

    const docData = {
      date: admin.firestore.Timestamp.fromDate(new Date(metrics.date + "T12:00:00")),
      report_type: isPeriod ? "period" : "daily",
      campus,
      net_revenue:      metrics.net_revenue,
      total_checks:     metrics.total_checks,
      lunch_avg_check:  metrics.lunch_avg_check,
      // Extended fields from Excel (not available via PDF)
      ...(metrics.breakfast_net_revenue  !== undefined && { breakfast_net_revenue:  metrics.breakfast_net_revenue }),
      ...(metrics.lunch_net_revenue      !== undefined && { lunch_net_revenue:      metrics.lunch_net_revenue }),
      ...(metrics.gross_revenue          !== undefined && { gross_revenue:          metrics.gross_revenue }),
      ...(metrics.discounts              !== undefined && { discounts:              metrics.discounts }),
      ...(metrics.breakfast_checks       !== undefined && { breakfast_checks:       metrics.breakfast_checks }),
      ...(metrics.lunch_checks           !== undefined && { lunch_checks:           metrics.lunch_checks }),
      ...(metrics.breakfast_avg_check    !== undefined && { breakfast_avg_check:    metrics.breakfast_avg_check }),
      ...(metrics.period_start           !== undefined && { period_start:           metrics.period_start }),
      ...(metrics.period_end             !== undefined && { period_end:             metrics.period_end }),
      source_file:  fileName,
      parse_method: isExcel ? "excel" : "pdf",
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    };

    // merge: true so a re-upload updates rather than overwrites
    await db.collection("daily_metrics").doc(docId).set(docData, { merge: true });

    return res.status(200).json({
      success: true,
      docId,
      metrics,
    });

  } catch (err) {
    console.error("[parse-report] Error:", err);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
}

// ─── EXCEL PARSER ─────────────────────────────────────────────────────────────
// Targets the exact cell layout of the InfoGenesis Sales Summary .xlsx export.
//
// Key cell addresses (all on Sheet1, 1-indexed rows/columns):
//
//   B4  — Period string: "Processed Business Period Starting M/D/YYYY ... Ending M/D/YYYY ..."
//
//   STATISTICS section:
//   B7  — "Breakfast(1)" label         B8  — "Lunch(2)" label        B9  — "Total" label
//   M7  — Breakfast Total Checks       M8  — Lunch Total Checks      M9  — Total Checks
//   T7  — Breakfast Refund Checks      T8  — Lunch Refund Checks
//   AC7 — Breakfast Net Checks         AC8 — Lunch Net Checks        AC9 — Total Net Checks
//   AP7 — Breakfast Avg Check          AP8 — Lunch Avg Check
//
//   REVENUE section:
//   M13 — Breakfast Receipts           M14 — Lunch Receipts          M15 — Total Receipts
//   W13 — Breakfast Refunds            W14 — Lunch Refunds
//   AK13— Breakfast Gross Revenue      AK14— Lunch Gross Revenue     AK15— Total Gross Revenue
//   AT13— Breakfast Discounts          AT14— Lunch Discounts         AT15— Total Discounts
//   AZ13— Breakfast Net Revenue        AZ14— Lunch Net Revenue       AZ15— Total Net Revenue

async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Excel file has no worksheets.");

  // Helper: get cell value by row + column (1-indexed), return null if missing
  const cell = (row, col) => {
    const c = ws.getCell(row, col);
    const v = c.value;
    if (v === null || v === undefined || v === "") return null;
    // ExcelJS can return rich text objects — unwrap to plain string
    if (typeof v === "object" && v.richText) {
      return v.richText.map(r => r.text).join("");
    }
    return v;
  };

  const num = (row, col) => {
    const v = cell(row, col);
    if (v === null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  // ── Date / Period ──────────────────────────────────────────────────────────
  const periodStr = cell(4, 2); // B4
  let date = null;
  let periodStart = null;
  let periodEnd = null;

  if (periodStr) {
    const startMatch = periodStr.match(/Starting (\d+\/\d+\/\d+)/);
    const endMatch   = periodStr.match(/Ending (\d+\/\d+\/\d+)/);

    if (startMatch) {
      const d = new Date(startMatch[1]);
      periodStart = formatDate(d);
      // Use the period start month/year as the report date key
      date = periodStart;
    }
    if (endMatch) {
      // The "Ending" date is the first moment of the NEXT period (e.g. 3/1 for a Feb report).
      // Subtract one day to get the last day of the actual period.
      const d = new Date(endMatch[1]);
      d.setDate(d.getDate() - 1);
      periodEnd = formatDate(d);
    }
  }

  if (!date) {
    // Fallback: use today's date if we can't parse the period
    date = formatDate(new Date());
  }

  // ── STATISTICS ─────────────────────────────────────────────────────────────
  // Rows: 7 = Breakfast, 8 = Lunch, 9 = Total
  // Columns: M=13 Total Checks, T=20 Refund Checks, AC=29 Net Checks, AP=42 Avg Check

  const breakfastTotalChecks = num(7, 13);
  const lunchTotalChecks     = num(8, 13);
  const totalChecks          = num(9, 13);  // Total Checks (gross)

  const breakfastNetChecks   = num(7, 29);
  const lunchNetChecks       = num(8, 29);
  const totalNetChecks       = num(9, 29);  // Net Checks

  const breakfastAvgCheck    = num(7, 42);
  const lunchAvgCheck        = num(8, 42);

  // Prefer Net Checks for total_checks (matches what PDF parser extracted)
  const finalTotalChecks = totalNetChecks ?? totalChecks;

  // ── REVENUE ────────────────────────────────────────────────────────────────
  // Rows: 13 = Breakfast, 14 = Lunch, 15 = Total
  // Columns: M=13 Receipts, W=23 Refunds, AK=37 Gross Revenue, AT=46 Discounts, AZ=52 Net Revenue

  const breakfastNetRevenue  = num(13, 52); // AZ13
  const lunchNetRevenue      = num(14, 52); // AZ14
  const totalNetRevenue      = num(15, 52); // AZ15 — Net Revenue directly (no truncation in Excel!)

  const totalGrossRevenue    = num(15, 37); // AK15
  const totalDiscounts       = num(15, 46); // AT15

  // Validate: Net Revenue should equal Gross - Discounts (within rounding)
  if (totalGrossRevenue !== null && totalDiscounts !== null && totalNetRevenue !== null) {
    const calculated = round2(totalGrossRevenue - totalDiscounts);
    const diff = Math.abs(calculated - totalNetRevenue);
    if (diff > 0.02) {
      console.warn(
        `[parseExcel] Net Revenue mismatch: direct=${totalNetRevenue}, calculated=${calculated}, diff=${diff}`
      );
    }
  }

  // ── Validate required fields ───────────────────────────────────────────────
  const missing = [];
  if (finalTotalChecks === null) missing.push("total_checks (AC9 or M9)");
  if (lunchAvgCheck    === null) missing.push("lunch_avg_check (AP8)");
  if (totalNetRevenue  === null) missing.push("net_revenue (AZ15)");

  if (missing.length > 0) {
    throw new Error(
      `Excel parse failed — could not read required fields: ${missing.join(", ")}. ` +
      `Verify this is an InfoGenesis Sales Summary report.`
    );
  }

  return {
    date,
    period_start:            periodStart,
    period_end:              periodEnd,
    // Core metrics (match Firestore schema)
    net_revenue:             round2(totalNetRevenue),
    total_checks:            finalTotalChecks,
    lunch_avg_check:         round2(lunchAvgCheck),
    // Extended metrics (bonus — only available via Excel)
    breakfast_net_revenue:   round2(breakfastNetRevenue),
    lunch_net_revenue:       round2(lunchNetRevenue),
    gross_revenue:           round2(totalGrossRevenue),
    discounts:               round2(totalDiscounts),
    breakfast_checks:        breakfastNetChecks ?? breakfastTotalChecks,
    lunch_checks:            lunchNetChecks ?? lunchTotalChecks,
    breakfast_avg_check:     round2(breakfastAvgCheck),
  };
}

// ─── PDF PARSER ───────────────────────────────────────────────────────────────
// Fallback for PDF uploads. Less reliable due to column truncation in the
// wide InfoGenesis layout — Net Revenue is calculated rather than read directly.
//
// Known limitation: Net Revenue column (rightmost) is cut off during text
// extraction. We calculate it as Gross Revenue - Discounts, which is correct
// within ±$0.01 rounding.

async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  if (!text || text.trim().length === 0) {
    throw new Error("PDF text extraction returned empty content. The file may be scanned or image-based.");
  }

  // ── Date ───────────────────────────────────────────────────────────────────
  let date = formatDate(new Date()); // default to today
  const dateMatch = text.match(/Starting\s+(\d+\/\d+\/\d+)/);
  if (dateMatch) {
    date = formatDate(new Date(dateMatch[1]));
  }

  // ── STATISTICS — Total Checks ──────────────────────────────────────────────
  // Layout: "Total  <TotalChecks>  <RefundChecks>  <NetChecks>"
  // The 3rd number on the Total row in STATISTICS is Net Checks.
  const totalChecksMatch = text.match(/Total\s+(\d+)\s+\d+\s+(\d+)/);
  const totalChecks = totalChecksMatch ? parseInt(totalChecksMatch[2], 10) : null;

  // ── STATISTICS — Lunch Avg Check ───────────────────────────────────────────
  // Layout: "Lunch(2)  <TotalChecks>  <RefundChecks>  <NetChecks>  $<AvgCheck>"
  const lunchAvgMatch = text.match(/Lunch\(2\)\s+\d+\s+\d+\s+\d+\s+\$?([\d,]+\.\d{2})/);
  const lunchAvgCheck = lunchAvgMatch ? parseFloat(lunchAvgMatch[1].replace(/,/g, "")) : null;

  // ── REVENUE — Gross Revenue and Discounts ──────────────────────────────────
  // The Net Revenue column is truncated in PDF extraction.
  // We find the REVENUE > Total row and extract Gross Revenue (3rd $) and Discounts (4th $).
  // Pattern: "Total  $<Receipts>  $<Refunds>  $<GrossRevenue>  $<Discounts>"
  const revenueMatch = text.match(
    /REVENUE[\s\S]*?Total\s+\$?([\d,]+\.\d{2})\s+[-–]?\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/
  );
  let netRevenue = null;
  let grossRevenue = null;
  let discounts = null;

  if (revenueMatch) {
    grossRevenue = parseFloat(revenueMatch[3].replace(/,/g, ""));
    discounts    = parseFloat(revenueMatch[4].replace(/,/g, ""));
    netRevenue   = round2(grossRevenue - discounts);
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const missing = [];
  if (totalChecks  === null) missing.push("total_checks");
  if (lunchAvgCheck === null) missing.push("lunch_avg_check");
  if (netRevenue   === null) missing.push("net_revenue");

  if (missing.length > 0) {
    throw new Error(
      `PDF parse failed — could not extract: ${missing.join(", ")}. ` +
      `Consider uploading the Excel (.xlsx) version for more reliable parsing.`
    );
  }

  return {
    date,
    net_revenue:    netRevenue,
    total_checks:   totalChecks,
    lunch_avg_check: lunchAvgCheck,
    gross_revenue:  grossRevenue,
    discounts,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function round2(n) {
  if (n === null || n === undefined) return null;
  return Math.round(n * 100) / 100;
}
