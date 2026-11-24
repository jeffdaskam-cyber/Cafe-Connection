// api/get-specials.mjs
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's Cafe Specials from Google Drive / Google Docs.
// Uses Google REST APIs directly via fetch — no googleapis npm package needed.
//
// Drive layout: <GOOGLE_SPECIALS_FOLDER_ID>/<YYYY>/<MM - Mon>/<week file>
// The week file is either
//   • one combined document for all three cafes ("Nov 23rd - Nov 27th"), one
//     cafe per page in the order Center Green, Mesa Lab, Foothills — this
//     endpoint returns only the requested cafe's page; or
//   • the legacy per-cafe Google Doc ("Nov 23rd - 27th_ML" / "_FL").
// The combined file may be a Google Doc or a PDF.
//
// GET /api/get-specials?weekOf=YYYY-MM-DD&campus=Mesa+Lab  (both optional)
// Returns: { success: true, weekLabel: string, body: string }

import { cert, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { SignJWT, importPKCS8 } from "jose";
import {
  CAMPUS_SUFFIX,
  PDF_MIME,
  chunksToText,
  docToChunks,
  extractPdfPages,
  formatMonthFolder,
  formatWeekFolderVariants,
  formatYearFolder,
  getMondayOf,
  pdfPagesToChunks,
  pickSpecialsFile,
  splitCombinedSpecials,
} from "./_lib/cafeSpecials.mjs";

// ─── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "GOOGLE_SPECIALS_FOLDER_ID",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`[get-specials] Missing required env var: ${key}`);
}

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
let adminApp;
try {
  adminApp = getApp();
} catch {
  adminApp = initializeApp({
    credential: cert({
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
  return getAuth(adminApp).verifyIdToken(authHeader.slice(7));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Google OAuth2 token via service account ─────────────────────────────────
async function getAccessToken() {
  const email      = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");

  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents.readonly",
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

// ─── Drive helpers ────────────────────────────────────────────────────────────
async function driveList(token, q) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=200`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Drive API error: ${data.error.message}`);
  return data.files ?? [];
}

async function findInFolder(token, parentId, name) {
  // Escape single quotes in the name to prevent Drive query injection.
  const safeName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const files = await driveList(token, `'${parentId}' in parents and name = '${safeName}' and trashed = false`);
  return files[0] || null;
}

function listFolder(token, parentId) {
  return driveList(token, `'${parentId}' in parents and trashed = false`);
}

// ─── File contents → page chunks ──────────────────────────────────────────────
async function readChunks(token, file) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  if (file.mimeType === PDF_MIME) {
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, auth);
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
    const pages = await extractPdfPages(Buffer.from(await res.arrayBuffer()));
    return pdfPagesToChunks(pages);
  }

  const res = await fetchWithTimeout(`https://docs.googleapis.com/v1/documents/${file.id}`, auth);
  if (!res.ok) throw new Error(`Docs API request failed: ${res.status}`);
  const doc = await res.json();
  if (doc.error) throw new Error(`Docs API error: ${doc.error.message}`);
  return docToChunks(doc);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const weekOfParam  = req.query.weekOf;
  const campusParam  = req.query.campus ?? "Mesa Lab";

  if (weekOfParam !== undefined && !ISO_DATE_RE.test(weekOfParam)) {
    return res.status(400).json({ error: "Invalid weekOf parameter. Expected YYYY-MM-DD." });
  }

  if (typeof campusParam !== "string" || !Object.prototype.hasOwnProperty.call(CAMPUS_SUFFIX, campusParam)) {
    return res.status(400).json({ error: "Invalid campus parameter." });
  }
  const campusSuffix = CAMPUS_SUFFIX[campusParam];

  try {
    const token        = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_SPECIALS_FOLDER_ID.trim();

    const monday = weekOfParam
      ? getMondayOf(new Date(weekOfParam + "T12:00:00"))
      : getMondayOf(new Date());

    const weeksToTry = weekOfParam
      ? [monday]
      : [monday, new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)];

    let body       = null;
    let usedMonday = null;

    for (const weekMonday of weeksToTry) {
      const yearDir = await findInFolder(token, rootFolderId, formatYearFolder(weekMonday));
      if (!yearDir) continue;

      const monthDir = await findInFolder(token, yearDir.id, formatMonthFolder(weekMonday));
      if (!monthDir) continue;

      const picked = pickSpecialsFile(
        await listFolder(token, monthDir.id),
        formatWeekFolderVariants(weekMonday),
        campusSuffix,
      );
      if (!picked) continue;

      const chunks = await readChunks(token, picked.file);
      const text   = picked.combined
        ? splitCombinedSpecials(chunks)[campusParam]
        : chunksToText(chunks);

      // This week's file exists but has no section for this cafe: report
      // not-found rather than silently showing last week's menu.
      if (text) { body = text; usedMonday = weekMonday; }
      break;
    }

    if (!body) {
      return res.status(404).json({
        error: "Specials not found.",
        searched: weeksToTry.map(m => ({
          year:  formatYearFolder(m),
          month: formatMonthFolder(m),
          week:  formatWeekFolderVariants(m),
          campus: campusParam,
        })),
      });
    }

    const weekLabel = `Week of ${usedMonday.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    })}`;

    return res.status(200).json({ success: true, weekLabel, body });

  } catch (err) {
    console.error("[get-specials] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
