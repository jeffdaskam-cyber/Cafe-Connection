// api/parse-report.js
// Vercel Serverless Function — Cafe Connection
// Parses InfoGenesis Sales Summary reports (Excel or PDF) and writes to Firestore.
//
// POST body: { fileUrl: string, campus: string, fileName: string }
//   campus is used as a fallback for PDFs — Excel files detect campus automatically.
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

// ─── Campus detection from Profit Center label ───────────────────────────────
// Maps the InfoGenesis "Profit Center" name to the canonical campus string
// used throughout the app. Add new entries here if campus names ever change.
const PROFIT_CENTER_MAP = {
  "ucar foothills lab":  "Foothills",
  "ucar mesa lab":       "Mesa Lab",
  "ucar center green":   "Center Green",
};

function detectCampusFromProfitCenter(profitCenterString) {
  if (!profitCenterString) return null;
  const lower = profitCenterString.toLowerCase();
  for (const [key, campus] of Object.entries(PROFIT_CENTER_MAP)) {
    if (lower.includes(key)) return campus;
  }
  return null;
}

// ─── Main Handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileUrl, campus: campusFallback, fileName } = req.body;

  if (!fileUrl || !fileName) {
    return res.status(400).json({ error: "Missing required fields: fileUrl, fileName" });
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
    let campus;

    if (isExcel) {
      metrics = await parseExcel(fileBuffer);
      // Use campus detected from the report; fall back to what the browser sent
      campus = metrics.detectedCampus || campusFallback;
    } else if (isPdf) {
      metrics = await parsePdf(fileBuffer);
      // PDFs: try detection from text, fall back to browser-supplied campus
      campus = metrics.detectedCampus || campusFallback;
    } else {
      return res.status(400).json({ error: "Unsupported file type. Please upload a .xlsx or .pdf file." });
    }

    // Final campus validation
    const validCampuses = ["Mesa Lab", "Foothills", "Center Green"];
    if (!campus || !validCampuses.includes(campus)) {
      return res.status(400).json({
        error: `Could not determine campus from the report. Detected: "${campus || "none"}". ` +
               `Expected one of: ${validCampuses.join(", ")}.`
      });
    }

    // Build Firestore document ID
    // Daily:  {YYYY-MM-DD}_{CampusName}
    // Period: period_{YYYY-MM-DD}_{YYYY-MM-DD}_{CampusName}
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
      campus,
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
async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Excel file has no worksheets.");

  // ── Cell helpers ───────────────────────────────────────────────────────────
  const strVal = (row, col) => {
    const v = ws.getCell(row, col).value;
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "object" && v.richText) return v.richText.map(r => r.text).join("");
    return String(v).trim();
  };

  const numVal = (row, col) => {
    const v = ws.getCell(row, col).value;
    if (v === null || v === undefined || v === "") return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  // ── Label search helpers ───────────────────────────────────────────────────
  const findInCol = (col, label, afterRow = 0) => {
    const target = label.toLowerCase();
    for (let r = afterRow + 1; r <= ws.rowCount; r++) {
      const v = strVal(r, col);
      if (v && v.toLowerCase() === target) return { row: r, col };
    }
    return null;
  };

  const findInRow = (row, label) => {
    const target = label.toLowerCase();
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = strVal(row, c);
      if (v && v.toLowerCase() === target) return { row, col: c };
    }
    return null;
  };

  // ── Campus detection ───────────────────────────────────────────────────────
  // Row 11 contains "Profit Center: UCAR Foothills Lab(552)" in column B.
  // We scan the first 20 rows of column B to find it, rather than assuming row 11.
  let detectedCampus = null;
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const v = strVal(r, 2);
    if (v && v.toLowerCase().startsWith("profit center:")) {
      detectedCampus = detectCampusFromProfitCenter(v);
      break;
    }
  }

  // ── Date / Period ──────────────────────────────────────────────────────────
  let date = null;
  let periodStart = null;
  let periodEnd = null;

  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const v = strVal(r, 2);
    if (v && v.includes("Business Period")) {
      const startMatch = v.match(/Starting (\d+\/\d+\/\d+)/);
      const endMatch   = v.match(/Ending (\d+\/\d+\/\d+)/);
      if (startMatch) {
        const d = new Date(startMatch[1]);
        periodStart = formatDate(d);
        date = periodStart;
      }
      if (endMatch) {
        const d = new Date(endMatch[1]);
        d.setDate(d.getDate() - 1);
        periodEnd = formatDate(d);
      }
      break;
    }
  }

  if (!date) date = formatDate(new Date());

  // ── STATISTICS section ─────────────────────────────────────────────────────
  const statsAnchor = findInCol(2, "STATISTICS");
  if (!statsAnchor) throw new Error(
    "Could not find STATISTICS section. Verify this is an InfoGenesis Sales Summary report."
  );

  const statsHeaderRow = statsAnchor.row + 1;
  const netChecksHdr   = findInRow(statsHeaderRow, "Net Checks");
  const avgCheckHdr    = findInRow(statsHeaderRow, "Avg Check");
  const totalChecksHdr = findInRow(statsHeaderRow, "Total Checks");

  if (!netChecksHdr && !totalChecksHdr) throw new Error(
    `Could not find 'Net Checks' or 'Total Checks' column header in STATISTICS (checked row ${statsHeaderRow}).`
  );
  if (!avgCheckHdr) throw new Error(
    `Could not find 'Avg Check' column header in STATISTICS (checked row ${statsHeaderRow}).`
  );

  const bfastStatsRow = findInCol(2, "Breakfast(1)", statsAnchor.row);
  const lunchStatsRow = findInCol(2, "Lunch(2)",     statsAnchor.row);
  const totalStatsRow = findInCol(2, "Total",        statsAnchor.row);

  const checksCol = netChecksHdr ? netChecksHdr.col : totalChecksHdr.col;

  const totalChecks       = totalStatsRow ? numVal(totalStatsRow.row, checksCol)          : null;
  const lunchAvgCheck     = lunchStatsRow ? numVal(lunchStatsRow.row, avgCheckHdr.col)    : null;
  const breakfastAvgCheck = bfastStatsRow ? numVal(bfastStatsRow.row, avgCheckHdr.col)    : null;
  const lunchChecks       = lunchStatsRow ? numVal(lunchStatsRow.row, checksCol)          : null;
  const breakfastChecks   = bfastStatsRow ? numVal(bfastStatsRow.row, checksCol)          : null;

  // ── REVENUE section ────────────────────────────────────────────────────────
  const revAnchor = findInCol(2, "REVENUE");
  if (!revAnchor) throw new Error(
    "Could not find REVENUE section. Verify this is an InfoGenesis Sales Summary report."
  );

  const revHeaderRow = revAnchor.row + 1;
  const netRevHdr    = findInRow(revHeaderRow, "Net Revenue");
  const grossRevHdr  = findInRow(revHeaderRow, "= Gross Revenue");
  const discountsHdr = findInRow(revHeaderRow, "- Discounts");

  if (!netRevHdr)    throw new Error(`Could not find 'Net Revenue' column header in REVENUE (checked row ${revHeaderRow}).`);
  if (!grossRevHdr)  throw new Error(`Could not find '= Gross Revenue' column header in REVENUE (checked row ${revHeaderRow}).`);
  if (!discountsHdr) throw new Error(`Could not find '- Discounts' column header in REVENUE (checked row ${revHeaderRow}).`);

  const bfastRevRow = findInCol(2, "Breakfast(1)", revAnchor.row);
  const lunchRevRow = findInCol(2, "Lunch(2)",     revAnchor.row);
  const totalRevRow = findInCol(2, "Total",        revAnchor.row);

  const totalNetRevenue     = totalRevRow ? numVal(totalRevRow.row, netRevHdr.col)    : null;
  const totalGrossRevenue   = totalRevRow ? numVal(totalRevRow.row, grossRevHdr.col)  : null;
  const totalDiscounts      = totalRevRow ? numVal(totalRevRow.row, discountsHdr.col) : null;
  const breakfastNetRevenue = bfastRevRow ? numVal(bfastRevRow.row, netRevHdr.col)   : null;
  const lunchNetRevenue     = lunchRevRow ? numVal(lunchRevRow.row, netRevHdr.col)    : null;

  if (totalGrossRevenue !== null && totalDiscounts !== null && totalNetRevenue !== null) {
    const calculated = round2(totalGrossRevenue - totalDiscounts);
    const diff = Math.abs(calculated - totalNetRevenue);
    if (diff > 0.02) {
      console.warn(
        `[parseExcel] Net Revenue cross-check mismatch: ` +
        `direct=${totalNetRevenue}, calculated=${calculated}, diff=${diff}`
      );
    }
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const missing = [];
  if (totalChecks     === null) missing.push("total_checks");
  if (lunchAvgCheck   === null) missing.push("lunch_avg_check");
  if (totalNetRevenue === null) missing.push("net_revenue");

  if (missing.length > 0) {
    throw new Error(
      `Excel parse failed — could not read: ${missing.join(", ")}. ` +
      `The report structure may have changed. Check the Vercel logs for details.`
    );
  }

  return {
    date,
    period_start:          periodStart,
    period_end:            periodEnd,
    detectedCampus,
    net_revenue:           round2(totalNetRevenue),
    total_checks:          totalChecks,
    lunch_avg_check:       round2(lunchAvgCheck),
    breakfast_net_revenue: round2(breakfastNetRevenue),
    lunch_net_revenue:     round2(lunchNetRevenue),
    gross_revenue:         round2(totalGrossRevenue),
    discounts:             round2(totalDiscounts),
    breakfast_checks:      breakfastChecks,
    lunch_checks:          lunchChecks,
    breakfast_avg_check:   round2(breakfastAvgCheck),
  };
}

// ─── PDF PARSER ───────────────────────────────────────────────────────────────
async function parsePdf(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  if (!text || text.trim().length === 0) {
    throw new Error("PDF text extraction returned empty content. The file may be scanned or image-based.");
  }

  // ── Campus detection from PDF text ────────────────────────────────────────
  // Look for "Profit Center: UCAR Foothills Lab" anywhere in the PDF text
  let detectedCampus = null;
  const profitCenterMatch = text.match(/Profit Center:\s*([^\n\r(]+)/i);
  if (profitCenterMatch) {
    detectedCampus = detectCampusFromProfitCenter(profitCenterMatch[1]);
  }

  // ── Date ───────────────────────────────────────────────────────────────────
  let date = formatDate(new Date());
  const dateMatch = text.match(/Starting\s+(\d+\/\d+\/\d+)/);
  if (dateMatch) date = formatDate(new Date(dateMatch[1]));

  // ── STATISTICS — Total Checks ──────────────────────────────────────────────
  const totalChecksMatch = text.match(/Total\s+(\d+)\s+\d+\s+(\d+)/);
  const totalChecks = totalChecksMatch ? parseInt(totalChecksMatch[2], 10) : null;

  // ── STATISTICS — Lunch Avg Check ───────────────────────────────────────────
  const lunchAvgMatch = text.match(/Lunch\(2\)\s+\d+\s+\d+\s+\d+\s+\$?([\d,]+\.\d{2})/);
  const lunchAvgCheck = lunchAvgMatch ? parseFloat(lunchAvgMatch[1].replace(/,/g, "")) : null;

  // ── REVENUE — Gross Revenue and Discounts ──────────────────────────────────
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
  if (totalChecks   === null) missing.push("total_checks");
  if (lunchAvgCheck === null) missing.push("lunch_avg_check");
  if (netRevenue    === null) missing.push("net_revenue");

  if (missing.length > 0) {
    throw new Error(
      `PDF parse failed — could not extract: ${missing.join(", ")}. ` +
      `Consider uploading the Excel (.xlsx) version for more reliable parsing.`
    );
  }

  return {
    date,
    detectedCampus,
    net_revenue:     netRevenue,
    total_checks:    totalChecks,
    lunch_avg_check: lunchAvgCheck,
    gross_revenue:   grossRevenue,
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
