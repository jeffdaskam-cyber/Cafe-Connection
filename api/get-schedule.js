// api/get-schedule.js
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's staff schedule from Google Drive / Google Sheets.
// Uses Google REST APIs directly via fetch — no googleapis npm package needed.
//
// GET /api/get-schedule
// Returns: { success: true, weekLabel: string, rows: string[][], colorMap: object }

import { SignJWT, importPKCS8 } from "jose";

// ─── Google OAuth2 token via service account ─────────────────────────────────
async function getAccessToken() {
  const email      = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) throw new Error("Missing service account credentials.");

  const key = await importPKCS8(privateKey, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Drive helpers ────────────────────────────────────────────────────────────
async function findInFolder(token, parentId, name) {
  const q   = `'${parentId}' in parents and name = '${name}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`);
  return data.files?.[0] || null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getMondayOf(date) {
  const d   = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatFileDate(date) {
  return `${date.getMonth() + 1}.${date.getDate()}.${String(date.getFullYear()).slice(2)}`;
}
function formatMonthFolder(date) {
  const mm        = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  return `${mm} - ${monthName} - ${date.getFullYear()}`;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token        = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_SCHEDULE_FOLDER_ID;
    if (!rootFolderId) throw new Error("GOOGLE_SCHEDULE_FOLDER_ID env var not set.");

    // ?weekOf=YYYY-MM-DD → exact week only (user navigated explicitly)
    // no param           → auto-detect current week, fall back to previous
    const weekOfParam = req.query.weekOf; // e.g. "2026-03-09"

    const monday = weekOfParam
      ? getMondayOf(new Date(weekOfParam + "T12:00:00")) // noon avoids DST edge cases
      : getMondayOf(new Date());

    const weeksToTry = weekOfParam
      ? [monday]
      : [monday, new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)];

    let scheduleFile = null;
    let usedMonday   = null;

    for (const weekMonday of weeksToTry) {
      const monthFolder = formatMonthFolder(weekMonday);
      const fileName    = formatFileDate(weekMonday);

      // Navigate: GOOGLE_SCHEDULE_FOLDER_ID points directly to the year folder ("2026 ES Schedules").
      // month folder → week file
      const monthDir = await findInFolder(token, rootFolderId, monthFolder);
      if (!monthDir) continue;

      const file = await findInFolder(token, monthDir.id, fileName);
      if (file) { scheduleFile = file; usedMonday = weekMonday; break; }
    }

    if (!scheduleFile) {
      return res.status(404).json({
        error: "Schedule not found. Check that the file exists in Google Drive.",
        searched: weeksToTry.map(m => ({
          month: formatMonthFolder(m),
          file:  formatFileDate(m),
        })),
      });
    }

    // ── Fetch sheet values ────────────────────────────────────────────────────
    const valUrl = `https://sheets.googleapis.com/v4/spreadsheets/${scheduleFile.id}/values/A1:L200?valueRenderOption=FORMATTED_VALUE`;
    const valRes = await fetch(valUrl, { headers: { Authorization: `Bearer ${token}` } });
    const valData = await valRes.json();
    if (valData.error) throw new Error(`Sheets API error: ${valData.error.message}`);
    const rows = valData.values || [];

    // ── Fetch cell formatting (background colors) ─────────────────────────────
    const fmtUrl = `https://sheets.googleapis.com/v4/spreadsheets/${scheduleFile.id}?ranges=A1:L200&fields=sheets(data(rowData(values(userEnteredFormat/backgroundColor,formattedValue))))`;
    const fmtRes  = await fetch(fmtUrl, { headers: { Authorization: `Bearer ${token}` } });
    const fmtData = await fmtRes.json();

    const colorMap = {};
    const rowData  = fmtData.sheets?.[0]?.data?.[0]?.rowData || [];
    rowData.forEach((row, ri) => {
      (row.values || []).forEach((cell, ci) => {
        const bg = cell.userEnteredFormat?.backgroundColor;
        if (!bg) return;
        const { red = 0, green = 0, blue = 0 } = bg;
        const isWhite   = red >= 0.99 && green >= 0.99 && blue >= 0.99;
        const isDefault = red === 0   && green === 0   && blue === 0;
        if (!isWhite && !isDefault) {
          colorMap[`${ri},${ci}`] = {
            r: Math.round(red * 255),
            g: Math.round(green * 255),
            b: Math.round(blue * 255),
          };
        }
      });
    });

    const weekLabel = `Week of ${usedMonday.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    })}`;

    return res.status(200).json({ success: true, weekLabel, rows, colorMap });

  } catch (err) {
    console.error("[get-schedule] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
