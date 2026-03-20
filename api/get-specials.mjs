// api/get-specials.mjs
// Vercel Serverless Function — Cafe Connection
// Fetches the current week's Cafe Specials from Google Drive / Google Docs.
// Uses Google REST APIs directly via fetch — no googleapis npm package needed.
//
// GET /api/get-specials?weekOf=YYYY-MM-DD&campus=Mesa+Lab  (both optional)
// Returns: { success: true, weekLabel: string, body: string }

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

// ─── Campus → filename suffix ─────────────────────────────────────────────────
const CAMPUS_SUFFIX = {
  "Mesa Lab":     "_ML",
  "Foothills":    "_FL",
  "Center Green": "_CG",
};

// ─── Google OAuth2 token via service account ─────────────────────────────────
async function getAccessToken() {
  const email      = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) throw new Error("Missing service account credentials.");

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
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
// Hardcoded to avoid Node.js ICU locale inconsistencies across environments
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatYearFolder(date) {
  return `${date.getFullYear()}`;
}
function formatMonthFolder(date) {
  const mm        = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = MONTHS_SHORT[date.getMonth()];
  return `${mm} - ${monthName}`;
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function formatWeekFolder(monday) {
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const monLabel = MONTHS_SHORT[monday.getMonth()];
  // Only repeat month name if Friday is in a different month
  if (monday.getMonth() === friday.getMonth()) {
    return `${monLabel} ${ordinal(monday.getDate())} - ${ordinal(friday.getDate())}`;
  }
  const friLabel = MONTHS_SHORT[friday.getMonth()];
  return `${monLabel} ${ordinal(monday.getDate())} - ${friLabel} ${ordinal(friday.getDate())}`;
}

// ─── Extract plain text from Google Docs API response ────────────────────────
function extractDocText(doc) {
  const content = doc.body?.content ?? [];
  return content
    .flatMap(block => {
      if (!block.paragraph) return [];
      return block.paragraph.elements
        ?.map(el => el.textRun?.content ?? "")
        .join("") ?? "";
    })
    .join("")
    .trim();
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
  const campusSuffix = CAMPUS_SUFFIX[campusParam] ?? "";

  if (weekOfParam !== undefined && !ISO_DATE_RE.test(weekOfParam)) {
    return res.status(400).json({ error: "Invalid weekOf parameter. Expected YYYY-MM-DD." });
  }

  try {
    const token        = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_SPECIALS_FOLDER_ID?.trim();
    if (!rootFolderId) throw new Error("GOOGLE_SPECIALS_FOLDER_ID env var not set.");

    const monday = weekOfParam
      ? getMondayOf(new Date(weekOfParam + "T12:00:00"))
      : getMondayOf(new Date());

    const weeksToTry = weekOfParam
      ? [monday]
      : [monday, new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000)];

    let specialsFile = null;
    let usedMonday   = null;

    for (const weekMonday of weeksToTry) {
      const yearFolder  = formatYearFolder(weekMonday);
      const monthFolder = formatMonthFolder(weekMonday);
      const weekFolder  = formatWeekFolder(weekMonday) + campusSuffix;

      console.log(`[get-specials] Searching: ${yearFolder} > ${monthFolder} > ${weekFolder}`);

      const yearDir = await findInFolder(token, rootFolderId, yearFolder);
      if (!yearDir) { console.log(`[get-specials] Year folder not found: ${yearFolder}`); continue; }

      const monthDir = await findInFolder(token, yearDir.id, monthFolder);
      if (!monthDir) { console.log(`[get-specials] Month folder not found: ${monthFolder}`); continue; }

      const file = await findInFolder(token, monthDir.id, weekFolder);
      if (file) { specialsFile = file; usedMonday = weekMonday; break; }
      console.log(`[get-specials] Week file not found: ${weekFolder}`);
    }

    if (!specialsFile) {
      return res.status(404).json({
        error: "Specials not found.",
        searched: weeksToTry.map(m => ({
          year:  formatYearFolder(m),
          month: formatMonthFolder(m),
          week:  formatWeekFolder(m) + campusSuffix,
        })),
      });
    }

    // ── Fetch Google Doc content ──────────────────────────────────────────────
    const docUrl  = `https://docs.googleapis.com/v1/documents/${specialsFile.id}`;
    const docRes  = await fetch(docUrl, { headers: { Authorization: `Bearer ${token}` } });
    const docData = await docRes.json();
    if (docData.error) throw new Error(`Docs API error: ${docData.error.message}`);

    const body = extractDocText(docData);

    const weekLabel = `Week of ${usedMonday.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    })}`;

    return res.status(200).json({ success: true, weekLabel, body });

  } catch (err) {
    console.error("[get-specials] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
