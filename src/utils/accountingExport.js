// src/utils/accountingExport.js
// Generates and downloads the monthly accounting Excel report for all three campuses.
// Uses ExcelJS in the browser (Vite/ESM compatible).

import ExcelJS from "exceljs";
import { fetchAccountingData, db } from "../firebase.js";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";

const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Color palette (ARGB, no #) ───────────────────────────────────────────────
const C = {
  AQUA:       "FF00A2B4",  // COLORS.AQUA — title bar, tab, col-header border
  AQUA_DARK:  "FF00818F",  // COLORS.AQUA_DARK — section header row fill
  SPACE:      "FF011837",  // COLORS.TEXT_PRIMARY — column header row fill, value text
  TEXT_SEC:   "FF2C4A63",  // COLORS.TEXT_SECONDARY — subtitle, labels, date text
  ALT_FILL:   "FFF8F7F5",  // COLORS.BG_SURFACE_ALT — alternating even-row fill
  BORDER:     "FFDDD9D4",  // COLORS.BORDER — thin/hair internal borders
  BORDER_STR: "FFB8B3AC",  // COLORS.BORDER_STRONG — medium box borders
  WHITE:      "FFFFFFFF",  // text on colored fills
  AQUA_WASH:  "FFC8EEF2",  // subtitle row fill (derived)
};

// ── ExcelJS style helpers ────────────────────────────────────────────────────
const pFont  = (size, bold, argb)  => ({ name: "Poppins", size, bold: !!bold, color: { argb } });
const solid  = (argb)              => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const bdr    = (style, argb)       => ({ style, color: { argb } });

// ── Sheet styling ────────────────────────────────────────────────────────────

/**
 * Applies all UCAR-branded visual styling to a completed campus sheet.
 * Called after all data values have been written.
 *
 * @param {ExcelJS.Worksheet} ws
 * @param {string} campus     - e.g. "Mesa Lab"
 * @param {string} monthLabel - e.g. "April 2026"
 */
function styleSheet(ws, campus, monthLabel) {
  // ── Row heights ────────────────────────────────────────────────────────────
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 14;
  ws.getRow(3).height = 17;
  ws.getRow(4).height = 19;

  // ── Column widths ──────────────────────────────────────────────────────────
  ws.getColumn(1).width = 13;    // A: Date
  ws.getColumn(2).width = 14;    // B: Credit Sales
  ws.getColumn(3).width = 14;    // C: Cash Deposit
  ws.getColumn(4).width = 1.8;   // D: spacer
  ws.getColumn(5).width = 22;    // E: Monthly Totals label
  ws.getColumn(6).width = 18;    // F: Monthly Totals value

  // ── Merge cells ───────────────────────────────────────────────────────────
  ws.mergeCells("A1:F1");
  ws.mergeCells("A2:F2");
  ws.mergeCells("A3:C3");
  ws.mergeCells("E3:F3");

  // ── Row 1 — Title bar ─────────────────────────────────────────────────────
  const r1a1 = ws.getCell("A1");
  r1a1.value     = `${campus}  ·  ${monthLabel}`;
  r1a1.font      = pFont(14, true, C.WHITE);
  r1a1.fill      = solid(C.AQUA);
  r1a1.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  // ── Row 2 — Subtitle ──────────────────────────────────────────────────────
  const r2a1 = ws.getCell("A2");
  r2a1.value     = "Monthly Accounting Report";
  r2a1.font      = pFont(9, false, C.TEXT_SEC);
  r2a1.fill      = solid(C.AQUA_WASH);
  r2a1.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  // ── Row 3 — Section headers ───────────────────────────────────────────────
  // A3:C3 — "Daily Totals"
  const r3a = ws.getCell("A3");
  r3a.value     = "Daily Totals";
  r3a.font      = pFont(9, true, C.WHITE);
  r3a.fill      = solid(C.AQUA_DARK);
  r3a.alignment = { horizontal: "center", vertical: "middle" };

  // D3 — spacer fill
  ws.getCell("D3").fill = solid(C.AQUA_DARK);

  // E3:F3 — "Monthly Totals"
  const r3e = ws.getCell("E3");
  r3e.value     = "Monthly Totals";
  r3e.font      = pFont(9, true, C.WHITE);
  r3e.fill      = solid(C.AQUA_DARK);
  r3e.alignment = { horizontal: "center", vertical: "middle" };

  // ── Row 4 — Column headers ────────────────────────────────────────────────
  // A4, B4, C4, E4 — label cells
  ["A4", "B4", "C4", "E4"].forEach(addr => {
    const cell     = ws.getCell(addr);
    cell.font      = pFont(8, true, C.WHITE);
    cell.fill      = solid(C.SPACE);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border    = { bottom: bdr("medium", C.AQUA) };
  });

  // D4 — spacer
  ws.getCell("D4").fill   = solid(C.SPACE);
  ws.getCell("D4").border = { bottom: bdr("medium", C.AQUA) };

  // F4 — Net Revenue value (bold, right-aligned, box border)
  const f4     = ws.getCell("F4");
  f4.font      = pFont(9, true, C.WHITE);
  f4.fill      = solid(C.SPACE);
  f4.alignment = { horizontal: "right", vertical: "middle" };
  f4.border    = {
    top:    bdr("medium", C.BORDER_STR),
    bottom: bdr("thin",   C.BORDER),
    left:   bdr("thin",   C.BORDER),
    right:  bdr("medium", C.BORDER_STR),
  };
  f4.numFmt = '"$"#,##0.00';

  // ── Monthly Totals block: E5:F8 ───────────────────────────────────────────
  for (let r = 5; r <= 8; r++) {
    const isLast = r === 8;

    // E column — label
    const eCell     = ws.getCell(r, 5);
    eCell.font      = pFont(9, false, C.TEXT_SEC);
    eCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    eCell.border    = {
      top:    bdr("thin",              C.BORDER),
      bottom: bdr(isLast ? "medium" : "thin", isLast ? C.BORDER_STR : C.BORDER),
      left:   bdr("medium",            C.BORDER_STR),
      right:  bdr("thin",              C.BORDER),
    };

    // F column — value
    const fCell     = ws.getCell(r, 6);
    fCell.font      = pFont(9, false, C.SPACE);
    fCell.alignment = { horizontal: "right", vertical: "middle" };
    fCell.border    = {
      top:    bdr("thin",              C.BORDER),
      bottom: bdr(isLast ? "medium" : "thin", isLast ? C.BORDER_STR : C.BORDER),
      left:   bdr("thin",              C.BORDER),
      right:  bdr("medium",            C.BORDER_STR),
    };
    fCell.numFmt = '"$"#,##0.00';
  }

  // ── Data rows 5→last: daily dates and sales ───────────────────────────────
  const lastRow = ws.rowCount;
  for (let r = 5; r <= lastRow; r++) {
    const isEven = r % 2 === 0;
    const isLast = r === lastRow;
    const rowFill   = isEven ? solid(C.ALT_FILL) : null;
    const bottomBdr = isLast ? bdr("medium", C.BORDER_STR) : bdr("hair", C.BORDER);

    // A — Date
    const aCell     = ws.getCell(r, 1);
    aCell.font      = pFont(9, false, C.TEXT_SEC);
    aCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    aCell.border    = { bottom: bottomBdr, left: bdr("thin", C.BORDER_STR) };
    aCell.numFmt    = "M/D/YYYY";
    if (rowFill) aCell.fill = rowFill;

    // B — Credit Sales
    const bCell     = ws.getCell(r, 2);
    bCell.font      = pFont(9, false, C.SPACE);
    bCell.alignment = { horizontal: "right", vertical: "middle" };
    bCell.border    = { bottom: bottomBdr };
    bCell.numFmt    = '"$"#,##0.00';
    if (rowFill) bCell.fill = rowFill;

    // C — Cash Deposit
    const cCell     = ws.getCell(r, 3);
    cCell.font      = pFont(9, false, C.SPACE);
    cCell.alignment = { horizontal: "right", vertical: "middle" };
    cCell.border    = { bottom: bottomBdr, right: bdr("thin", C.BORDER_STR) };
    cCell.numFmt    = '"$"#,##0.00';
    if (rowFill) cCell.fill = rowFill;

    // D — spacer
    if (rowFill) ws.getCell(r, 4).fill = rowFill;
  }

  // ── Sheet-level settings ──────────────────────────────────────────────────
  ws.properties.tabColor      = { argb: C.AQUA };
  ws.views                    = [{ state: "frozen", xSplit: 0, ySplit: 4, topLeftCell: "A5" }];
  ws.pageSetup.fitToPage      = true;
  ws.pageSetup.fitToWidth     = 1;
  ws.pageSetup.fitToHeight    = 0;
  ws.pageSetup.printTitlesRow = "1:4";
}

// ── Data helpers ─────────────────────────────────────────────────────────────

/** Returns an array of Date objects for every Mon–Fri in the given month. */
function getWeekdays(year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) dates.push(date);
  }
  return dates;
}

/** Formats a Date to a "YYYY-MM-DD" lookup key. */
function toDateKey(date) {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}`
  );
}

/**
 * Fetches daily_metrics docs for one campus for the given month.
 * Returns a lookup map keyed by "YYYY-MM-DD" → { credit_card, cash_drop }.
 */
async function fetchDailyMap(campus, year, month) {
  const startDate = Timestamp.fromDate(new Date(year, month - 1, 1));
  const endDate   = Timestamp.fromDate(new Date(year, month, 1));

  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    where("date",   ">=", startDate),
    where("date",   "<",  endDate)
  );

  const snap = await getDocs(q);
  const map = {};
  snap.docs.forEach(d => {
    const data = d.data();
    const dateObj = data.date && data.date.toDate ? data.date.toDate() : new Date(data.date);
    map[toDateKey(dateObj)] = {
      credit_card: data.credit_card ?? 0,
      cash_drop:   data.cash_drop   ?? 0,
    };
  });
  return map;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetches accounting data for all three campuses in parallel,
 * builds an ExcelJS workbook with one sheet per campus containing
 * a Daily Totals section (cols A–C) and a Monthly Totals section (cols E–F),
 * applies UCAR-branded styling, and triggers a browser download.
 *
 * Sheet layout per campus:
 *   Row 1:  "{Campus}  ·  {Month} {Year}"           — styled title bar
 *   Row 2:  "Monthly Accounting Report"              — styled subtitle
 *   Row 3:  "Daily Totals" [A:C]  |  "Monthly Totals" [E:F]
 *   Row 4:  "Date" "Credit Sales" "Cash Deposit" [D] "Net Revenue" <value>
 *   Row 5:  <date> <credit> <cash>               [D] "Total Tax"   <value>
 *   Row 6:  <date> <credit> <cash>               [D] "Payroll"     <value>
 *   Row 7:  <date> <credit> <cash>               [D] "Credit Card" <value>
 *   Row 8:  <date> <credit> <cash>               [D] "Cash Deposit"<value>
 *   Row 9+: <date> <credit> <cash>                   (E/F empty)
 *
 * @param {number} year  - e.g. 2026
 * @param {number} month - 1-indexed, e.g. 4 for April
 * @returns {Promise<void>}
 */
export async function generateAndDownloadAccountingExcel(year, month) {
  const monthName  = MONTH_NAMES[month - 1];
  const monthLabel = `${monthName} ${year}`;

  // Fetch monthly totals and daily metrics for all campuses in parallel
  const [monthlyResults, dailyMaps] = await Promise.all([
    Promise.all(CAMPUSES.map(c => fetchAccountingData(c, year, month))),
    Promise.all(CAMPUSES.map(c => fetchDailyMap(c, year, month))),
  ]);

  const weekdays = getWeekdays(year, month);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Cafe Connection";
  wb.created = new Date();

  CAMPUSES.forEach((campus, idx) => {
    const monthly  = monthlyResults[idx];
    const dailyMap = dailyMaps[idx];

    const ws = wb.addWorksheet(campus);

    // ── Write data values (no styling here — styleSheet handles it all) ──────

    // Row 1: title (value overwritten by styleSheet with formatted ·)
    ws.addRow([`${campus}  ·  ${monthLabel}`]);

    // Row 2: subtitle
    ws.addRow(["Monthly Accounting Report"]);

    // Row 3: section headers
    ws.addRow(["Daily Totals", null, null, null, "Monthly Totals"]);

    // Row 4: column headers + Net Revenue
    ws.addRow(["Date", "Credit Sales", "Cash Deposit", null, "Net Revenue", monthly.netRevenue ?? 0]);

    // Remaining Monthly Totals rows (labels + values in E+F, rows 5–8)
    const remainingMonthly = [
      ["Total Tax",    monthly.totalTax    ?? 0],
      ["Payroll",      monthly.payroll     ?? 0],
      ["Credit Card",  monthly.creditCard  ?? 0],
      ["Cash Deposit", monthly.cashDeposit ?? 0],
    ];

    // Rows 5 onward: daily dates in A/B/C and monthly labels in E/F (rows 5–8 only)
    const totalRows = Math.max(weekdays.length, remainingMonthly.length);

    for (let i = 0; i < totalRows; i++) {
      const weekday = weekdays[i];
      const mt      = remainingMonthly[i];
      const dayData = weekday ? (dailyMap[toDateKey(weekday)] ?? { credit_card: 0, cash_drop: 0 }) : null;

      ws.addRow([
        weekday  ? weekday            : null,
        dayData  ? dayData.credit_card : null,
        dayData  ? dayData.cash_drop   : null,
        null,
        mt ? mt[0] : null,
        mt ? mt[1] : null,
      ]);
    }

    // ── Apply UCAR-branded styling ────────────────────────────────────────────
    styleSheet(ws, campus, monthLabel);
  });

  // Generate buffer and trigger browser download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Monthly_Accounting_Report_${monthName}_${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
