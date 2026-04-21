// api/generate-invite-link.mjs
// Vercel Serverless Function — Cafe Connection
// Generates a Firebase magic-link sign-in URL for a new user invite and
// records a pending invite document in Firestore. Administrator only.
//
// POST /api/generate-invite-link
// Body: { email: string, role: "user" | "manager" | "senior_leader" | "administrator" }
// Auth: Bearer token (Firebase ID token) — must belong to an administrator
// Returns: { success: true, link: string }

import admin from "firebase-admin";
import {
  requireEnv,
  firebasePrivateKey,
  getAdminApp,
  createHttpError,
  respondWithError,
  respondWithInternalError,
} from "./_lib/serverless.mjs";

const SCOPE = "generate-invite-link";

requireEnv(SCOPE, process.env, [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
]);

const adminApp = getAdminApp(admin, process.env, SCOPE);
const db = adminApp.firestore();

const VALID_ROLES = ["user", "manager", "senior_leader", "administrator"];
const UCAR_DOMAIN = "ucar.edu";
const APP_URL = process.env.INVITE_APP_URL || "https://cafe-connection-eosin.vercel.app";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const caller = await verifyAdmin(req);
    const { email: rawEmail, role } = req.body || {};

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Email is required." });
    }
    const email = rawEmail.trim().toLowerCase();
    if (!email.endsWith(`@${UCAR_DOMAIN}`)) {
      return res.status(400).json({ error: "Email must be a @ucar.edu address." });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }

    const existingActive = await db
      .collection("user_roles")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!existingActive.empty) {
      return res
        .status(409)
        .json({ error: "A user with this email is already registered." });
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
  } catch (err) {
    if (err.status) return respondWithError(res, err);
    return respondWithInternalError(res, SCOPE, err);
  }
}
