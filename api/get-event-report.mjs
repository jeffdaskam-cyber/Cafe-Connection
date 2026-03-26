// api/get-event-report.mjs
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's Event Report PDF from Google Drive.
// Week is identified by the Sunday date (M.DD naming convention).
//
// GET /api/get-event-report?weekOf=YYYY-MM-DD  (weekOf optional)
// Returns: { success: true, weekLabel: string, fileId: string, fileName: string, downloadUrl: string, viewUrl: string }

import admin from "firebase-admin";
import { SignJWT, importPKCS8 } from "jose";

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
let adminApp;
try {
  adminApp = admin.app();
} catch {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
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
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) throw new Error("Missing service account credentials.");

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

// ─── Drive helper ─────────────────────────────────────────────────────────────
async function findInFolder(token, parentId, name) {
  const q   = `'${parentId}' in parents and name = '${name}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webContentLink,webViewLink)&pageSize=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`);
  return data.files?.[0] || null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Returns the upcoming Sunday (or today if already Sunday)
function getSundayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  if (day !== 0) d.setDate(d.getDate() + (7 - day));
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
    if (!rootFolderId) throw new Error("GOOGLE_EVENT_REPORTS_FOLDER_ID env var not set.");

    const baseDate = weekOfParam ? new Date(weekOfParam + "T12:00:00") : new Date();
    const sunday   = getSundayOf(baseDate);

    // Try current week, then previous week as fallback
    const weeksToTry = [sunday, new Date(sunday.getTime() - 7 * 24 * 60 * 60 * 1000)];
    let reportFile = null;
    let usedSunday = null;

    for (const weekSunday of weeksToTry) {
      const monthFolder = formatMonthFolder(weekSunday);
      const weekFile    = formatWeekFile(weekSunday);
      console.log(`[get-event-report] Searching: ${monthFolder} > ${weekFile}`);

      const monthDir = await findInFolder(token, rootFolderId, monthFolder);
      if (!monthDir) {
        console.log(`[get-event-report] Month folder not found: ${monthFolder}`);
        continue;
      }

      const file = await findInFolder(token, monthDir.id, weekFile);
      if (file) {
        reportFile = file;
        usedSunday = weekSunday;
        break;
      }
      console.log(`[get-event-report] Week file not found: ${weekFile}`);
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

    return res.status(200).json({
      success:     true,
      weekLabel,
      fileId:      reportFile.id,
      fileName:    reportFile.name,
      downloadUrl,
      viewUrl,
    });

  } catch (err) {
    console.error("[get-event-report] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
