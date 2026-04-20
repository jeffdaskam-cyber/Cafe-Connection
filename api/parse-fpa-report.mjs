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
//   - Only the four approved project blocks are ingested.
//   - Only the twelve mapped ledger rows are read; ledger codes 5051 and 9989
//     both normalize to "Benefits" and are stored as separate facts with the
//     same normalizedName (selectors sum them downstream).
//   - Values are stored as absolute numbers (positive) for both revenue and
//     expense so charts use consistent comparison values.
//   - Re-uploading a month overwrites that month's stored facts; prior months
//     are preserved.
//   - Hard fails if period parsing fails, the file shape is invalid, or no
//     valid FP&A records are found. Soft warnings are returned for missing
//     project blocks or missing expected ledger rows.

import admin from "firebase-admin";
import ExcelJS from "exceljs";
import {
  getAdminApp,
  fetchWithTimeout,
  respondWithError,
  respondWithInternalError,
  createHttpError,
  isValidStorageUrl,
  requireEnv,
} from "./_lib/serverless.mjs";

// ── Mappings (kept in sync with src/utils/fpaMappings.js) ────────────────────
const FPA_PROJECTS = [
  { code: "PRJ004382", campus: "ES Admin"     },
  { code: "PRJ005073", campus: "Mesa Lab"     },
  { code: "PRJ005074", campus: "Foothills"    },
  { code: "PRJ005075", campus: "Center Green" },
];

const FPA_LEDGERS = [
  { code: "4313", sourceLabel: "4313:Miscellaneous Sales",          normalizedName: "Cafe Sales Revenue",     category: "Revenue" },
  { code: "4314", sourceLabel: "4314:Sales Tax Collected",          normalizedName: "Sales Tax",              category: "Tax"     },
  { code: "4320", sourceLabel: "4320:Other Non Government Income",  normalizedName: "External Event Revenue", category: "Revenue" },
  { code: "4325", sourceLabel: "4325:Other Miscellaneous Revenue",  normalizedName: "Cafe Revenue",           category: "Revenue" },
  { code: "9990", sourceLabel: "9990:Internal Chargeback Revenue",  normalizedName: "Internal Event Revenue", category: "Revenue" },
  { code: "5001", sourceLabel: "5001:Salaries",                     normalizedName: "Salaries",               category: "Expense" },
  { code: "5051", sourceLabel: "5051:Benefits - Applied",           normalizedName: "Benefits",               category: "Expense" },
  { code: "7000", sourceLabel: "7000:Materials and Supplies",       normalizedName: "Materials",              category: "Expense" },
  { code: "7500", sourceLabel: "7500:Purchased Services",           normalizedName: "Services",               category: "Expense" },
  { code: "7750", sourceLabel: "7750:Taxes, fines and penalties",   normalizedName: "Taxes",                  category: "Expense" },
  { code: "9350", sourceLabel: "9350:Depreciation Expense",         normalizedName: "Depreciation",           category: "Expense" },
  { code: "9989", sourceLabel: "9989:Final Rate-Full Benefits",     normalizedName: "Benefits",               category: "Expense" },
];
const FPA_LEDGER_BY_CODE = Object.fromEntries(FPA_LEDGERS.map(l => [l.code, l]));
const FISCAL_START_MONTH = 10;

// ── Env + Admin init ─────────────────────────────────────────────────────────
const SCOPE = "parse-fpa-report";
requireEnv(SCOPE, process.env, [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "ALLOWED_STORAGE_BUCKET",
]);
const adminApp = getAdminApp(admin, process.env, SCOPE);

const MONTH_NAMES_LONG = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_NAMES_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];
const MONTH_SHORT_TO_NUM = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// ── Auth ─────────────────────────────────────────────────────────────────────
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw createHttpError("Unauthorized.", 401);
  return adminApp.auth().verifyIdToken(authHeader.slice(7));
}

// ── Cell helpers ─────────────────────────────────────────────────────────────
function cellText(cell) {
  if (cell == null) return "";
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text || "").join("");
    if (v.result != null) return String(v.result);
    if (v.formula != null && v.result != null) return String(v.result);
  }
  return "";
}

function cellNumber(cell) {
  if (cell == null) return 0;
  const v = cell.value;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if (typeof v.result === "number") return v.result;
    if (v.result != null) {
      const parsed = parseFloat(v.result);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  const parsed = parseFloat(String(v).replace(/[,$\s()]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  // Parenthesized negatives: "(1,234.56)"
  if (typeof v === "string" && /^\(.*\)$/.test(v.trim())) return -parsed;
  return parsed;
}

// ── Period detection ─────────────────────────────────────────────────────────
function parsePeriodFromText(text) {
  if (!text) return null;
  const s = String(text).trim();

  // YYYY-MM
  let m = s.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };

  // YYYY/MM or MM/YYYY
  m = s.match(/\b(20\d{2})\/(0?[1-9]|1[0-2])\b/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };

  m = s.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/);
  if (m) return { year: Number(m[2]), month: Number(m[1]) };

  const lower = s.toLowerCase();

  // Long month name + year, e.g. "March 2026"
  for (let i = 0; i < MONTH_NAMES_LONG.length; i++) {
    const name = MONTH_NAMES_LONG[i];
    const re = new RegExp(`\\b${name}\\b[\\s,\\-]*?(20\\d{2})`, "i");
    const match = lower.match(re);
    if (match) return { year: Number(match[1]), month: i + 1 };
  }

  // Short month name + year, e.g. "Mar 2026"
  for (const short of MONTH_NAMES_SHORT) {
    const re = new RegExp(`\\b${short}\\b[\\s,\\-\\.]*?(20\\d{2})`, "i");
    const match = lower.match(re);
    if (match) return { year: Number(match[1]), month: MONTH_SHORT_TO_NUM[short] };
  }

  // FY + month, e.g. "FY2026 - Mar", "FY26 Mar", "Fiscal Year 2026 - March"
  for (let i = 0; i < MONTH_NAMES_LONG.length; i++) {
    const name = MONTH_NAMES_LONG[i];
    const re = new RegExp(`\\b(?:fy|fiscal\\s+year)\\s*(20\\d{2}|\\d{2})\\b[\\s\\-,:]*\\b${name}\\b`, "i");
    const match = lower.match(re);
    if (match) {
      const fyRaw = Number(match[1]);
      const fiscalYear = fyRaw < 100 ? 2000 + fyRaw : fyRaw;
      const month = i + 1;
      const year = month >= FISCAL_START_MONTH ? fiscalYear - 1 : fiscalYear;
      return { year, month };
    }
  }

  for (const short of MONTH_NAMES_SHORT) {
    const re = new RegExp(`\\b(?:fy|fiscal\\s+year)\\s*(20\\d{2}|\\d{2})\\b[\\s\\-,:]*\\b${short}\\b`, "i");
    const match = lower.match(re);
    if (match) {
      const fyRaw = Number(match[1]);
      const fiscalYear = fyRaw < 100 ? 2000 + fyRaw : fyRaw;
      const month = MONTH_SHORT_TO_NUM[short];
      const year = month >= FISCAL_START_MONTH ? fiscalYear - 1 : fiscalYear;
      return { year, month };
    }
  }

  return null;
}

function detectPeriodFromSheet(sheet, workbook) {
  const fromB8 = parsePeriodFromText(cellText(sheet.getCell("B8")));
  if (fromB8) return fromB8;

  const limit = Math.min(40, sheet.rowCount);
  for (let r = 1; r <= limit; r++) {
    const row = sheet.getRow(r);
    const parts = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      parts.push(cellText(cell));
    });
    const joined = parts.join(" | ");
    const detected = parsePeriodFromText(joined);
    if (detected) return detected;
  }

  const fromSheetName = parsePeriodFromText(sheet.name);
  if (fromSheetName) return fromSheetName;

  const title = workbook?.properties?.title;
  if (title) {
    const fromTitle = parsePeriodFromText(title);
    if (fromTitle) return fromTitle;
  }

  return null;
}

// ── Project + ledger detection ──────────────────────────────────────────────
function detectProjectInRow(cellA) {
  if (!cellA) return null;
  const text = cellA.toString();
  for (const p of FPA_PROJECTS) {
    if (text.includes(p.code)) return p;
  }
  return null;
}

function detectLedgerInRow(cellA) {
  if (!cellA) return null;
  const text = cellA.toString().trim();
  // Look for leading ledger code pattern: digits followed by colon or space.
  const match = text.match(/^\s*(\d{4})\b/);
  if (!match) return null;
  const code = match[1];
  return FPA_LEDGER_BY_CODE[code] || null;
}

function isAnotherProjectStart(cellA) {
  return detectProjectInRow(cellA) !== null;
}

// ── Parser ──────────────────────────────────────────────────────────────────
function parseFpaWorkbook(workbook) {
  // Find the first worksheet that has recognizable content.
  let sheet = null;
  for (const ws of workbook.worksheets) {
    if (ws.rowCount > 5) { sheet = ws; break; }
  }
  if (!sheet) throw createHttpError("Workbook contains no populated worksheet.", 400);

  const period = detectPeriodFromSheet(sheet, workbook);
  if (!period) {
    throw createHttpError("Could not detect the reporting month from the workbook header.", 400);
  }

  const warnings = [];
  const facts = [];
  const seenProjects = new Set();
  const perProjectLedgers = new Map(); // campus → Set<code>

  let activeProject = null;
  const totalRows = sheet.rowCount;

  for (let r = 1; r <= totalRows; r++) {
    const row = sheet.getRow(r);
    const cellAText = cellText(row.getCell(1)).trim();

    // Detect new project block
    const proj = detectProjectInRow(cellAText);
    if (proj) {
      activeProject = proj;
      seenProjects.add(proj.code);
      if (!perProjectLedgers.has(proj.campus)) perProjectLedgers.set(proj.campus, new Set());
      continue;
    }

    if (!activeProject) continue;

    // Defensive: if row contains another PRJ code we don't recognize, still
    // clear activeProject so we don't bleed values from unmapped sections.
    if (/\bPRJ\d{6}\b/.test(cellAText) && !isAnotherProjectStart(cellAText)) {
      activeProject = null;
      continue;
    }

    const ledger = detectLedgerInRow(cellAText);
    if (!ledger) continue;

    const mtdRaw = cellNumber(row.getCell(3)); // column C
    const ytdRaw = cellNumber(row.getCell(4)); // column D
    const mtdAmount = Math.abs(mtdRaw);
    const ytdAmount = Math.abs(ytdRaw);

    // Track ledger presence for per-campus warnings
    perProjectLedgers.get(activeProject.campus).add(ledger.code);

    facts.push({
      campus: activeProject.campus,
      projectCode: activeProject.code,
      ledgerCode: ledger.code,
      sourceLabel: ledger.sourceLabel,
      normalizedName: ledger.normalizedName,
      category: ledger.category,
      mtdAmount: Math.round(mtdAmount * 100) / 100,
      ytdAmount: Math.round(ytdAmount * 100) / 100,
    });
  }

  if (facts.length === 0) {
    throw createHttpError("No valid FP&A records were found in the workbook.", 400);
  }

  // Soft warnings
  const expectedLedgerCodes = FPA_LEDGERS.map(l => l.code);
  for (const p of FPA_PROJECTS) {
    if (!seenProjects.has(p.code)) {
      warnings.push(`Missing project block: ${p.code} (${p.campus})`);
      continue;
    }
    const seen = perProjectLedgers.get(p.campus) || new Set();
    const missing = expectedLedgerCodes.filter(code => !seen.has(code));
    if (missing.length > 0) {
      warnings.push(`${p.campus}: missing ledger rows ${missing.join(", ")}`);
    }
  }

  return { period, facts, warnings };
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
  const uploadedAt = admin.firestore.FieldValue.serverTimestamp();

  // Delete any existing facts for this monthKey (ensures overwrite semantics).
  const factsCol = db.collection("fpa_facts");
  const existingSnap = await factsCol.where("monthKey", "==", monthKey).get();
  const overwritten = existingSnap.size;

  // Firestore batches cap at 500 ops; 4 campuses × 12 ledgers = 48, plus
  // deletes up to the same. Well under the limit.
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
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
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

    const db = adminApp.firestore();
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
