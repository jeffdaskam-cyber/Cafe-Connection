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

const LIGHT_BLUE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FBFC" } };
const THIN_BOTTOM_BORDER = { style: "thin", color: { argb: "FF000000" } };

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

/**
 * Fetches accounting data for all three campuses in parallel,
 * builds an ExcelJS workbook with one sheet per campus containing
 * a Daily Totals section (cols A–C) and a Monthly Totals section (cols E–F),
 * and triggers a browser download.
 *
 * Sheet layout per campus:
 *   Row 1:  "{Campus} — {Month} {Year}"
 *   Row 2:  "Monthly Accounting Report"
 *   Row 3:  "Daily Totals" [A]   |   "Monthly Totals" [E]
 *   Row 4:  "Date" "Credit Sales" "Cash Deposit" [D spacer] "Net Revenue" <value>
 *   Row 5:  <date> <credit> <cash>               [D]        "Total Tax"   <value>
 *   Row 6:  <date> <credit> <cash>               [D]        "Payroll"     <value>
 *   Row 7:  <date> <credit> <cash>               [D]        "Credit Card" <value>
 *   Row 8:  <date> <credit> <cash>               [D]        "Cash Deposit"<value>
 *   Row 9+: <date> <credit> <cash>               (E/F empty)
 *
 * @param {number} year  - e.g. 2026
 * @param {number} month - 1-indexed, e.g. 4 for April
 * @returns {Promise<void>}
 */
export async function generateAndDownloadAccountingExcel(year, month) {
  const monthName = MONTH_NAMES[month - 1];

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

    // Column widths: A=Date, B=Credit Sales, C=Cash Deposit, D=spacer, E=label, F=value
    ws.columns = [
      { width: 10 },    // A: Date
      { width: 12.6 },  // B: Credit Sales
      { width: 12.6 },  // C: Cash Deposit
      { width: 1.6 },   // D: spacer (no data)
      { width: 22 },    // E: Monthly Totals label
      { width: 18 },    // F: Monthly Totals value
    ];

    // Row 1: "{Campus} — {Month} {Year}"
    ws.addRow([`${campus} — ${monthName} ${year}`]);

    // Row 2: "Monthly Accounting Report"
    ws.addRow(["Monthly Accounting Report"]);

    // Row 3: section headers
    const r3 = ws.addRow(["Daily Totals", null, null, null, "Monthly Totals"]);
    r3.getCell(1).font = { name: "Arial", size: 10, bold: true };
    r3.getCell(5).font = { name: "Arial", size: 10, bold: true };

    // Row 4: Daily column headers + Net Revenue (first Monthly Totals row)
    const r4 = ws.addRow([
      "Date", "Credit Sales", "Cash Deposit", null,
      "Net Revenue", monthly.netRevenue ?? 0,
    ]);
    // Light blue fill + thin bottom border on A, B, C, E, F
    [1, 2, 3, 5, 6].forEach(col => {
      r4.getCell(col).fill   = LIGHT_BLUE_FILL;
      r4.getCell(col).border = { bottom: THIN_BOTTOM_BORDER };
      r4.getCell(col).font   = { name: "Arial", size: 10 };
    });
    // "Net Revenue" label is bold
    r4.getCell(5).font   = { name: "Arial", size: 10, bold: true };
    r4.getCell(6).numFmt = "$#,##0.00";

    // Remaining Monthly Totals rows (labels + values in E+F, rows 5–8)
    const remainingMonthly = [
      ["Total Tax",    monthly.totalTax    ?? 0],
      ["Payroll",      monthly.payroll     ?? 0],
      ["Credit Card",  monthly.creditCard  ?? 0],
      ["Cash Deposit", monthly.cashDeposit ?? 0],
    ];

    // Write rows 5 onward: daily dates in A/B/C and monthly labels in E/F (rows 5–8 only)
    const totalRows = Math.max(weekdays.length, remainingMonthly.length);

    for (let i = 0; i < totalRows; i++) {
      const weekday = weekdays[i];       // undefined once past last weekday
      const mt      = remainingMonthly[i]; // undefined once past row 8

      const dayData = weekday ? (dailyMap[toDateKey(weekday)] ?? { credit_card: 0, cash_drop: 0 }) : null;

      const row = ws.addRow([
        weekday  ? weekday      : null,
        dayData  ? dayData.credit_card : null,
        dayData  ? dayData.cash_drop   : null,
        null,
        mt ? mt[0] : null,
        mt ? mt[1] : null,
      ]);

      if (weekday) {
        row.getCell(1).numFmt = "M/D/YYYY";
        row.getCell(2).numFmt = "$#,##0.00";
        row.getCell(3).numFmt = "$#,##0.00";
      }
      if (mt) {
        row.getCell(6).numFmt = "$#,##0.00";
      }
    }
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
