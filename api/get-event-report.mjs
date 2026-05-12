// api/get-event-report.mjs
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's Event Report PDF from Google Drive.
// Week is identified by the Sunday date (M.DD naming convention).
//
// GET /api/get-event-report?weekOf=YYYY-MM-DD  (weekOf optional)
// Returns: { success: true, weekLabel: string, fileId: string, fileName: string, downloadUrl: string, viewUrl: string }

import admin from "firebase-admin";
import { SignJWT, importPKCS8 } from "jose";

// ─── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "GOOGLE_EVENT_REPORTS_FOLDER_ID",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`[get-event-report] Missing required env var: ${key}`);
}

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
let adminApp;
try {
  adminApp = admin.app();
} catch {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

// ─── Fetch with timeout ───────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Auth verification ────────────────────────────────────────────────────────
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const err = new Error("Unauthorized.");
    err.status = 401;
    throw err;
  }
  return adminApp.auth().verifyIdToken(authHeader.slice(7));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Google OAuth2 token via service account ──────────────────────────────────
async function getAccessToken() {
  const email      = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");

  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/drive.readonly",
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

// ─── Drive helper ─────────────────────────────────────────────────────────────
async function findInFolder(token, parentId, name) {
  // Escape single quotes in the name to prevent Drive query injection.
  const safeName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q   = `'${parentId}' in parents and name = '${safeName}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webContentLink,webViewLink)&pageSize=10`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`);
  return data.files?.[0] || null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Returns the most recent Sunday (or today if already Sunday)
function getSundayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

// "March 2026"
function formatMonthFolder(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// "3.29" — single-digit month, zero-padded day
function formatWeekFile(sunday) {
  const m = sunday.getMonth() + 1;
  const d = String(sunday.getDate()).padStart(2, "0");
  return `${m}.${d}`;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const weekOfParam = req.query.weekOf;
  if (weekOfParam !== undefined && !ISO_DATE_RE.test(weekOfParam)) {
    return res.status(400).json({ error: "Invalid weekOf parameter. Expected YYYY-MM-DD." });
  }

  try {
    const token        = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_EVENT_REPORTS_FOLDER_ID;

    const baseDate = weekOfParam ? new Date(weekOfParam + "T12:00:00") : new Date();
    const sunday   = getSundayOf(baseDate);

    // Try current week, then previous week as fallback (only when auto-detecting)
    const weeksToTry = weekOfParam
      ? [sunday]
      : [sunday, new Date(sunday.getTime() - 7 * 24 * 60 * 60 * 1000)];
    let reportFile = null;
    let usedSunday = null;

    for (const weekSunday of weeksToTry) {
      const monthFolder = formatMonthFolder(weekSunday);
      const weekFile    = formatWeekFile(weekSunday);

      const monthDir = await findInFolder(token, rootFolderId, monthFolder);
      if (!monthDir) continue;

      const file = await findInFolder(token, monthDir.id, weekFile);
      if (file) {
        reportFile = file;
        usedSunday = weekSunday;
        break;
      }
    }

    if (!reportFile) {
      return res.status(404).json({
        error: "Event report not found.",
        searched: weeksToTry.map(s => ({
          month: formatMonthFolder(s),
          file:  formatWeekFile(s),
        })),
      });
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${reportFile.id}`;
    const viewUrl     = `https://drive.google.com/file/d/${reportFile.id}/view`;

    const weekLabel = `Week of ${usedSunday.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    })}`;

    // Fetch PDF binary for inline preview
    // Google Workspace files (Docs/Sheets) need export; native files use alt=media
    let pdf = null;
    try {
      const isGoogleSheet = reportFile.mimeType === "application/vnd.google-apps.spreadsheet";
      const isGoogleDoc = reportFile.mimeType?.startsWith("application/vnd.google-apps.");

      let pdfUrl;
      if (isGoogleSheet) {
        // Use Sheets-specific export with landscape orientation and fit-to-page
        pdfUrl = [
          `https://docs.google.com/spreadsheets/d/${reportFile.id}/export`,
          `?format=pdf`,
          `&portrait=false`,
          `&fitw=true`,
          `&fith=true`,
          `&size=letter`,
          `&gridlines=true`,
          `&printtitle=false`,
          `&sheetnames=false`,
          `&pagenumbers=false`,
          `&top_margin=0.25`,
          `&bottom_margin=0.25`,
          `&left_margin=0.25`,
          `&right_margin=0.25`,
        ].join('');
      } else if (isGoogleDoc) {
        pdfUrl = `https://www.googleapis.com/drive/v3/files/${reportFile.id}/export?mimeType=application/pdf`;
      } else {
        pdfUrl = `https://www.googleapis.com/drive/v3/files/${reportFile.id}?alt=media`;
      }

      const fileRes = await fetchWithTimeout(pdfUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (fileRes.ok) {
        const buffer = await fileRes.arrayBuffer();
        pdf = Buffer.from(buffer).toString("base64");
      }
    } catch (pdfErr) {
      console.warn("[get-event-report] Could not fetch PDF binary:", pdfErr.message);
    }

    return res.status(200).json({
      success:     true,
      weekLabel,
      fileId:      reportFile.id,
      fileName:    reportFile.name,
      downloadUrl,
      viewUrl,
      pdf,
    });

  } catch (err) {
    console.error("[get-event-report] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
