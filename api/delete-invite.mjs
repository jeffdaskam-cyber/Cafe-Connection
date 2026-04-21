// api/delete-invite.mjs
// Vercel Serverless Function — Cafe Connection
// Deletes a pending invite document. Administrator only.
//
// DELETE /api/delete-invite
// Body: { email: string }
// Auth: Bearer token (Firebase ID token) — must belong to an administrator
// Returns: { success: true }

import admin from "firebase-admin";
import {
  requireEnv,
  getAdminApp,
  createHttpError,
  respondWithError,
  respondWithInternalError,
} from "./_lib/serverless.mjs";

const SCOPE = "delete-invite";

requireEnv(SCOPE, process.env, [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
]);

const adminApp = getAdminApp(admin, process.env, SCOPE);
const db = adminApp.firestore();

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw createHttpError("Unauthorized.", 401);
  }
  let decoded;
  try {
    decoded = await adminApp.auth().verifyIdToken(authHeader.slice(7));
  } catch {
    throw createHttpError("Invalid token.", 401);
  }
  const userRoleDoc = await db.collection("user_roles").doc(decoded.uid).get();
  if (userRoleDoc.data()?.role !== "administrator") {
    throw createHttpError("Forbidden.", 403);
  }
  return decoded;
}

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await verifyAdmin(req);
    const { email: rawEmail } = req.body || {};
    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Email is required." });
    }
    const email = rawEmail.trim().toLowerCase();

    await db.collection("pending_invites").doc(email).delete();
    return res.status(200).json({ success: true });
  } catch (err) {
    if (err.status) return respondWithError(res, err);
    return respondWithInternalError(res, SCOPE, err);
  }
}
