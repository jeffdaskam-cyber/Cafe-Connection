// api/catering-revenue-rollup.mjs
// Vercel Serverless Function — Cafe Connection / Catering Companion
//
// Rolls a catering event's revenue into the event_revenue collection.
//
// POST /api/catering-revenue-rollup
// Body: { eventId: string }
// Auth: Bearer Firebase ID token belonging to a manager, senior_leader, or
//       administrator (checked against user_roles, the authoritative store).
//
// This is the ONLY path that writes catering revenue into event_revenue. The
// security rules block client writes to that collection, so the Admin SDK here
// is the single writer — the design the build plan's §5.2 calls for.
//
// Idempotent: the document ID is derived from the event ID, so re-confirming or
// re-saving an event overwrites in place rather than adding a second row.
// Un-confirming or cancelling deletes the row.

import admin from "firebase-admin";

import {
  createHttpError, getAdminApp, requireEnv, respondWithError, respondWithInternalError,
} from "./_lib/serverless.mjs";
import { buildRevenueDoc, revenueDocId, shouldRemoveRevenue } from "./_lib/cateringRevenue.mjs";

const SCOPE = "catering-revenue-rollup";
const STAFF_ROLES = ["manager", "senior_leader", "administrator"];

// Sandbox: with FIRESTORE_EMULATOR_HOST set, the Admin SDK talks to the local
// emulator and needs no service-account credentials. See docs/catering/SANDBOX.md.
const USE_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!USE_EMULATOR) {
  requireEnv(SCOPE, process.env, [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
  ]);
}

const adminApp = USE_EMULATOR
  ? (() => {
      try { return admin.app(); } catch {
        return admin.initializeApp({
          projectId: process.env.GCLOUD_PROJECT || "demo-cafe-connection",
        });
      }
    })()
  : getAdminApp(admin, process.env, SCOPE);

const db = adminApp.firestore();

// Firestore document IDs are opaque but must not contain slashes.
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

async function verifyStaff(req) {
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

  if (!decoded.email?.toLowerCase().endsWith("@ucar.edu")) {
    throw createHttpError("Forbidden.", 403);
  }

  // Roles live in user_roles, not users — see docs/catering/PHASES.md.
  const roleSnap = await db.collection("user_roles").doc(decoded.uid).get();
  const role = roleSnap.exists ? roleSnap.data().role : null;
  if (!STAFF_ROLES.includes(role)) {
    throw createHttpError("Forbidden — manager access required.", 403);
  }

  return { uid: decoded.uid, email: decoded.email, role };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let caller;
  try {
    caller = await verifyStaff(req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  const { eventId } = req.body || {};
  if (!eventId || typeof eventId !== "string" || !EVENT_ID_RE.test(eventId)) {
    return res.status(400).json({ error: "A valid eventId is required." });
  }

  try {
    const eventSnap = await db.collection("catering_events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Catering event not found." });
    }

    const event = { id: eventSnap.id, ...eventSnap.data() };
    const revenueRef = db.collection("event_revenue").doc(revenueDocId(eventId));

    // Withdraw revenue for an event that is no longer confirmed, so a
    // cancellation or a reverted confirmation does not strand a stale row.
    if (shouldRemoveRevenue(event)) {
      const existing = await revenueRef.get();
      if (existing.exists) {
        await revenueRef.delete();
        return res.status(200).json({ action: "removed", eventId });
      }
      return res.status(200).json({ action: "noop", eventId, reason: "not confirmed" });
    }

    const built = buildRevenueDoc(event);
    if (!built.ok) {
      // Not an error — a confirmed event with no amount yet is normal.
      return res.status(200).json({ action: "skipped", eventId, reason: built.reason });
    }

    await revenueRef.set(
      {
        ...built.data,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by: caller.uid,
      },
      { merge: true }
    );

    // Stamp the event so the console can show when revenue last rolled up.
    await eventSnap.ref.set(
      {
        revenueRolledUpAt: admin.firestore.FieldValue.serverTimestamp(),
        revenueRollupAmount: built.data.revenue,
      },
      { merge: true }
    );

    return res.status(200).json({
      action: "written",
      eventId,
      docId: built.docId,
      revenue: built.data.revenue,
      type: built.data.type,
      campus: built.data.campus,
      monthKey: built.data.monthKey,
      isEstimate: built.data.isEstimate,
    });
  } catch (err) {
    return respondWithInternalError(res, SCOPE, err);
  }
}
