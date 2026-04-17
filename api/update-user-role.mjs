// api/update-user-role.mjs
// Vercel Serverless Function — Cafe Connection
// Updates a user's role in Firestore. Admin only.
//
// POST /api/update-user-role
// Body: { targetUid: string, role: "user" | "manager" | "administrator" }
// Auth: Bearer token (Firebase ID token) — must belong to an administrator

import admin from "firebase-admin";

// ─── Required environment variables ──────────────────────────────────────────
const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`[update-user-role] Missing required env var: ${key}`);
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

const db = adminApp.firestore();
const VALID_ROLES = ["user", "manager", "administrator"];
// Firebase UIDs are typically 28 chars but can be longer with custom auth.
// Allow alphanumeric + common safe chars, capped at 128.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify caller is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let callerUid;
  try {
    const decoded = await adminApp.auth().verifyIdToken(authHeader.slice(7));
    callerUid = decoded.uid;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    // Verify caller is an administrator
    const callerDoc = await db.collection("user_roles").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "administrator") {
      return res.status(403).json({ error: "Forbidden — administrator only" });
    }

    // Validate body
    const { targetUid, role } = req.body || {};
    if (!targetUid || !role) {
      return res.status(400).json({ error: "targetUid and role are required" });
    }
    if (typeof targetUid !== "string" || !UID_RE.test(targetUid)) {
      return res.status(400).json({ error: "Invalid targetUid." });
    }
    if (typeof role !== "string" || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    }

    // Apply the role change
    await db.collection("user_roles").doc(targetUid).update({
      role,
      assignedBy: callerUid,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[update-user-role] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
