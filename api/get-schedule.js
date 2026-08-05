/**
 * api/get-schedule.js — Vercel Serverless Function.
 *
 * GET /api/get-schedule
 * Authenticates via Firebase ID token (Bearer). Uses a service account JWT
 * (jose) to call the Google Drive and Google Sheets REST APIs directly —
 * no googleapis package. Navigates the 2026 ES Schedules folder structure
 * to find the current week's sheet; falls back to the previous week if not found.
 * Returns { rows, colorMap } for the ScheduleTable component.
 */

import { getAuth } from "firebase-admin/auth";
import { SignJWT, importPKCS8 } from "jose";
import {
  createHttpError,
  escapeDriveQueryValue,
  fetchWithTimeout,
  firebasePrivateKey,
  getAdminApp,
  requireEnv,
  respondWithError,
  respondWithInternalError,
} from "./_lib/serverless.mjs";

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "GOOGLE_SCHEDULE_FOLDER_ID",
];
requireEnv("get-schedule", process.env, REQUIRED_ENV);
const adminApp = getAdminApp(process.env, "get-schedule");

// ─── Auth verification ────────────────────────────────────────────────────────
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw createHttpError("Unauthorized.", 401);
  }
  return getAuth(adminApp).verifyIdToken(authHeader.slice(7));
}

// ─── weekOf format validation ─────────────────────────────────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Google OAuth2 token via service account ─────────────────────────────────
async function getAccessToken() {
  const email      = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = firebasePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

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

  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("OAuth token error: no access_token returned.");
  return data.access_token;
}

// ─── Fetch with timeout ───────────────────────────────────────────────────────


// ─── Drive helpers ────────────────────────────────────────────────────────────
async function findInFolder(token, parentId, name) {
  // Escape single quotes in the name to prevent Drive query injection.
  const safeName = escapeDriveQueryValue(name);
  const q   = `'${parentId}' in parents and name = '${safeName}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=10`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API request failed: ${res.status}`);
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

  // ── Require authenticated UCAR user ──────────────────────────────────────
  try {
    await verifyAuth(req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  // ── Validate weekOf query param ───────────────────────────────────────────
  const weekOfParam = req.query.weekOf;
  if (weekOfParam !== undefined && !ISO_DATE_RE.test(weekOfParam)) {
    return res.status(400).json({ error: "Invalid weekOf parameter. Expected YYYY-MM-DD." });
  }

  try {
    const token        = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_SCHEDULE_FOLDER_ID;
    if (!rootFolderId) throw new Error("GOOGLE_SCHEDULE_FOLDER_ID env var not set.");

    // ?weekOf=YYYY-MM-DD → exact week only (user navigated explicitly)
    // no param           → auto-detect current week, fall back to previous
    // (weekOfParam validated above, before the try block)
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
    const valRes = await fetchWithTimeout(valUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!valRes.ok) throw new Error(`Sheets API request failed: ${valRes.status}`);
    const valData = await valRes.json();
    if (valData.error) throw new Error(`Sheets API error: ${valData.error.message}`);
    const rows = valData.values || [];

    // ── Fetch cell formatting (background colors) ─────────────────────────────
    const fmtUrl = `https://sheets.googleapis.com/v4/spreadsheets/${scheduleFile.id}?ranges=A1:L200&fields=sheets(data(rowData(values(userEnteredFormat/backgroundColor,formattedValue))))`;
    const fmtRes  = await fetchWithTimeout(fmtUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!fmtRes.ok) throw new Error(`Sheets formatting request failed: ${fmtRes.status}`);
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
    return respondWithInternalError(res, "get-schedule", err);
  }
}


