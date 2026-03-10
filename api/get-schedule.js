// api/get-schedule.js
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's staff schedule from Google Drive / Google Sheets.
//
// GET /api/get-schedule
// Returns: { success: true, weekLabel: string, schedule: raw 2D array of cells }

import { google } from "googleapis";

// ─── Auth ────────────────────────────────────────────────────────────────────
function getAuth() {
  return new google.auth.JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    key:   process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Return the Monday of the week containing `date`
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0) ? -6 : 1 - day; // if Sunday, go back 6; else go back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format a date as "M.D.YY" to match file naming e.g. "3.9.26"
function formatFileDate(date) {
  const m  = date.getMonth() + 1;
  const d  = date.getDate();
  const yy = String(date.getFullYear()).slice(2);
  return `${m}.${d}.${yy}`;
}

// Format month folder name e.g. "03-March-2026"
function formatMonthFolder(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  const yyyy = date.getFullYear();
  return `${mm}-${monthName}-${yyyy}`;
}

// Find a file/folder by name inside a parent folder. Returns the item or null.
async function findInFolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 10,
  });
  return res.data.files?.[0] || null;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const auth  = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const rootFolderId = process.env.GOOGLE_SCHEDULE_FOLDER_ID;
    if (!rootFolderId) throw new Error("GOOGLE_SCHEDULE_FOLDER_ID env var not set.");

    // ── Navigate to current week's file ──────────────────────────────────────
    const today  = new Date();
    const monday = getMondayOf(today);

    // Try current week first; if not found, try previous week (in case new
    // schedule hasn't been uploaded yet)
    const weeksToTry = [monday];
    const prevMonday = new Date(monday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    weeksToTry.push(prevMonday);

    let scheduleFile = null;
    let usedMonday   = null;

    for (const weekMonday of weeksToTry) {
      const yearFolder  = "2026 ES Schedules"; // top-level folder name
      const monthFolder = formatMonthFolder(weekMonday);
      const fileName    = formatFileDate(weekMonday);

      // Find year folder inside root
      const yearDir = await findInFolder(drive, rootFolderId, yearFolder);
      if (!yearDir) continue;

      // Find month folder
      const monthDir = await findInFolder(drive, yearDir.id, monthFolder);
      if (!monthDir) continue;

      // Find week file (Google Sheet)
      const file = await findInFolder(drive, monthDir.id, fileName);
      if (file) {
        scheduleFile = file;
        usedMonday   = weekMonday;
        break;
      }
    }

    if (!scheduleFile) {
      return res.status(404).json({
        error: "Schedule not found. Make sure the current week's file exists in Google Drive.",
        searched: weeksToTry.map(m => ({
          month: formatMonthFolder(m),
          file:  formatFileDate(m),
        })),
      });
    }

    // ── Fetch sheet data ──────────────────────────────────────────────────────
    // Get the first sheet's full data as a 2D array of values
    const sheetRes = await sheets.spreadsheets.values.get({
      spreadsheetId: scheduleFile.id,
      range: "A1:L200", // wide enough to cover Mon–Fri + extra cols
      valueRenderOption: "FORMATTED_VALUE",
    });

    const rows = sheetRes.data.values || [];

    // Also fetch cell formatting so we can detect background colors
    const formatRes = await sheets.spreadsheets.get({
      spreadsheetId: scheduleFile.id,
      ranges: ["A1:L200"],
      fields: "sheets(data(rowData(values(userEnteredFormat/backgroundColor,formattedValue))))",
    });

    // Build a color map: { "row,col": { r, g, b } }
    const colorMap = {};
    const rowData = formatRes.data.sheets?.[0]?.data?.[0]?.rowData || [];
    rowData.forEach((row, ri) => {
      (row.values || []).forEach((cell, ci) => {
        const bg = cell.userEnteredFormat?.backgroundColor;
        if (bg) {
          // Only store non-white, non-null colors
          const { red = 0, green = 0, blue = 0 } = bg;
          const isWhite = red >= 0.99 && green >= 0.99 && blue >= 0.99;
          const isDefault = red === 0 && green === 0 && blue === 0;
          if (!isWhite && !isDefault) {
            colorMap[`${ri},${ci}`] = { r: Math.round(red * 255), g: Math.round(green * 255), b: Math.round(blue * 255) };
          }
        }
      });
    });

    const weekLabel = `Week of ${usedMonday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

    return res.status(200).json({
      success: true,
      weekLabel,
      fileId: scheduleFile.id,
      rows,
      colorMap,
    });

  } catch (err) {
    console.error("[get-schedule] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
