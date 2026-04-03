// src/utils/accountingExport.js
// Generates and downloads the monthly accounting Excel report for all three campuses.
// Uses ExcelJS in the browser (Vite/ESM compatible).

import ExcelJS from "exceljs";
import { fetchAccountingData } from "../firebase.js";

const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const FIELDS = [
  ["Net Revenue",  "netRevenue"],
  ["Total Tax",    "totalTax"],
  ["Payroll",      "payroll"],
  ["Credit Card",  "creditCard"],
  ["Cash Deposit", "cashDeposit"],
];

// UCAR Aqua: #00A2B4  (used for header row background)
const AQUA_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00A2B4" } };
const WHITE_FONT = { color: { argb: "FFFFFFFF" }, bold: true, name: "Arial", size: 11 };
const LABEL_FONT = { bold: true, name: "Arial", size: 10 };
const VALUE_FONT = { name: "Arial", size: 10 };
const THIN_BORDER = { style: "thin", color: { argb: "FFD0D0D0" } };
const CELL_BORDER  = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function fmtMoney(n) {
  return n == null ? null : Number(n);
}

/**
 * Fetches accounting data for all three campuses in parallel,
 * builds an ExcelJS workbook with one sheet per campus,
 * and triggers a browser download.
 *
 * @param {number} year  - e.g. 2026
 * @param {number} month - 1-indexed, e.g. 3 for March
 * @returns {Promise<void>}
 */
export async function generateAndDownloadAccountingExcel(year, month) {
  const monthName = MONTH_NAMES[month - 1];

  // Fetch all three campuses in parallel
  const results = await Promise.all(
    CAMPUSES.map(campus => fetchAccountingData(campus, year, month))
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "Cafe Connection";
  wb.created = new Date();

  CAMPUSES.forEach((campus, idx) => {
    const data = results[idx];

    const ws = wb.addWorksheet(campus, {
      pageSetup: {
        paperSize: 1,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.75, right: 0.75, top: 1.0, bottom: 1.0, header: 0.5, footer: 0.5 },
      },
    });

    // Column widths
    ws.columns = [
      { key: "label", width: 22 },
      { key: "value", width: 18 },
    ];

    // Row 1: Campus name header (merged A1:B1)
    const titleRow = ws.addRow([`${campus} — ${monthName} ${year}`]);
    ws.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
    titleRow.getCell(1).fill = AQUA_FILL;
    titleRow.getCell(1).font = { ...WHITE_FONT, size: 12 };
    titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    titleRow.height = 24;

    // Row 2: Sub-header
    const subRow = ws.addRow(["Monthly Accounting Report"]);
    ws.mergeCells(`A${subRow.number}:B${subRow.number}`);
    subRow.getCell(1).font = { name: "Arial", size: 9, italic: true, color: { argb: "FF555555" } };
    subRow.height = 16;

    // Row 3: Blank spacer
    ws.addRow([]);

    // Row 4: Spacer row (labels are in column A of each data row)
    ws.addRow([]);

    // Data rows (one per field)
    FIELDS.forEach(([label, key], fieldIdx) => {
      const val = fmtMoney(data[key]);
      const row = ws.addRow([label, val]);
      row.height = 18;

      const labelCell = row.getCell(1);
      labelCell.font = LABEL_FONT;
      labelCell.border = CELL_BORDER;
      labelCell.alignment = { vertical: "middle" };

      const valueCell = row.getCell(2);
      valueCell.font = VALUE_FONT;
      valueCell.border = CELL_BORDER;
      valueCell.numFmt = '$#,##0.00';
      valueCell.alignment = { vertical: "middle", horizontal: "right" };

      // Alternate row shading for readability
      if (fieldIdx % 2 === 0) {
        const lightFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FBFC" } };
        labelCell.fill = lightFill;
        valueCell.fill = lightFill;
      }
    });

    // Footer note if no data found
    if (data.docCount === 0) {
      ws.addRow([]);
      const noteRow = ws.addRow(["No reports found for this campus and period."]);
      ws.mergeCells(`A${noteRow.number}:B${noteRow.number}`);
      noteRow.getCell(1).font = { name: "Arial", size: 9, italic: true, color: { argb: "FFCC0000" } };
    }
  });

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Cafe_Accounting_Report_${monthName}_${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
