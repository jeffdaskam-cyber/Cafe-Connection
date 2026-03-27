// api/get-setup-report.mjs
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's Set Up Report PDF from Google Drive.
// Uses Google REST APIs directly via fetch — no googleapis npm package.
//
// GET /api/get-setup-report?weekOf=YYYY-MM-DD  (weekOf optional)
// Returns: { success: true, weekLabel: string, fileName: string, downloadUrl: string }

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

// ─── Google OAuth2 token via service account ─────────────────────────────────
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

// ─── Drive helpers ────────────────────────────────────────────────────────────
async function findInFolder(token, parentId, name) {
  const q   = `'${parentId}' in parents and name = '${name}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&pageSize=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`);
  return data.files?.[0] || null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getMondayOf(date) {
  const d   = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

// "March 2026"
function formatMonthFolder(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// "3.23" — M.DD, no leading zero on month
function formatWeekFileName(monday) {
  const month = monday.getMonth() + 1; // no leading zero
  const day   = String(monday.getDate()).padStart(2, "0");
  return `${month}.${day}`;
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
    const rootFolderId = process.env.GOOGLE_SETUP_REPORT_FOLDER_ID;
    if (!rootFolderId) throw new Error("GOOGLE_SETUP_REPORT_FOLDER_ID env var not set.");

    const monday = weekOfParam
      ? getMondayOf(new Date(weekOfParam + "T12:00:00"))
      : getMondayOf(new Date());

    // Try current week, then fall back to previous week
    const weeksToTry = weekOfParam
      ? [monday]
      : [monday, new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)];

    let reportFile = null;
    let usedMonday = null;

    for (const weekMonday of weeksToTry) {
      const monthFolder = formatMonthFolder(weekMonday);
      const weekFileName = formatWeekFileName(weekMonday);

      console.log(`[get-setup-report] Searching: ${monthFolder} > ${weekFileName}`);

      const monthDir = await findInFolder(token, rootFolderId, monthFolder);
      if (!monthDir) {
        console.log(`[get-setup-report] Month folder not found: ${monthFolder}`);
        continue;
      }

      const file = await findInFolder(token, monthDir.id, weekFileName);
      if (file) {
        reportFile = file;
        usedMonday = weekMonday;
        break;
      }
      console.log(`[get-setup-report] Week file not found: ${weekFileName}`);
    }

    if (!reportFile) {
      return res.status(404).json({
        error: "Set Up Report not found.",
        searched: weeksToTry.map(m => ({
          month: formatMonthFolder(m),
          file:  formatWeekFileName(m),
        })),
      });
    }

    const weekLabel = `Week of ${usedMonday.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    })}`;

    // Return the Drive web view link so the user can open/download the file
    return res.status(200).json({
      success:     true,
      weekLabel,
      fileName:    reportFile.name,
      downloadUrl: reportFile.webViewLink,
    });

  } catch (err) {
    console.error("[get-setup-report] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
