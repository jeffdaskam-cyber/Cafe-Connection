// api/invites.mjs
// Vercel Serverless Function — Cafe Connection
//
// Pending-invite management. Administrator only.
//
//   POST   /api/invites   { email, role }  → { success: true, link }
//   DELETE /api/invites   { email }        → { success: true }
//
// Auth: Bearer Firebase ID token belonging to an administrator.
//
// Merged from the former generate-invite-link.mjs and delete-invite.mjs, which
// were byte-for-byte identical apart from the method and the body they read.
// They were combined to stay within the host's per-deployment function limit;
// the behavior of both routes is unchanged.

import admin from "firebase-admin";
import {
  requireEnv,
  getAdminApp,
  createHttpError,
  respondWithError,
  respondWithInternalError,
} from "./_lib/serverless.mjs";

const SCOPE = "invites";

requireEnv(SCOPE, process.env, [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
]);

const adminApp = getAdminApp(admin, process.env, SCOPE);
const db = adminApp.firestore();

const VALID_ROLES = ["user", "manager", "senior_leader", "administrator"];
const UCAR_DOMAIN = "ucar.edu";
const APP_URL = process.env.INVITE_APP_URL;

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

function normalizeEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== "string") {
    throw createHttpError("Email is required.", 400);
  }
  return rawEmail.trim().toLowerCase();
}

/** POST — create a magic-link invite and record the pending invite document. */
async function createInvite(req, res, caller) {
  const { email: rawEmail, role } = req.body || {};
  const email = normalizeEmail(rawEmail);

  if (!email.endsWith(`@${UCAR_DOMAIN}`)) {
    return res.status(400).json({ error: "Email must be a @ucar.edu address." });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  if (!APP_URL) {
    return res.status(500).json({ error: "Server is missing INVITE_APP_URL configuration." });
  }

  const existingActive = await db
    .collection("user_roles")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existingActive.empty) {
    return res.status(409).json({ error: "A user with this email is already registered." });
  }

  const link = await adminApp.auth().generateSignInWithEmailLink(email, {
    url: APP_URL,
    handleCodeInApp: true,
  });

  await db.collection("pending_invites").doc(email).set({
    email,
    role,
    invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    invitedBy: caller.uid,
    status: "pending",
  });

  return res.status(200).json({ success: true, link });
}

/** DELETE — remove a pending invite. */
async function deleteInvite(req, res) {
  const email = normalizeEmail(req.body?.email);
  await db.collection("pending_invites").doc(email).delete();
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const caller = await verifyAdmin(req);
    return req.method === "POST"
      ? await createInvite(req, res, caller)
      : await deleteInvite(req, res);
  } catch (err) {
    if (err.status) return respondWithError(res, err);
    return respondWithInternalError(res, SCOPE, err, { detail: err?.message });
  }
}
