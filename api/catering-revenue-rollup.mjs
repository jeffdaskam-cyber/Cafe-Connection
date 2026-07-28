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

import { respondWithError, respondWithInternalError } from "./_lib/serverless.mjs";
import { initCateringAdmin, verifyStaffOrCron } from "./_lib/cateringAdminApp.mjs";
import { buildRevenueDoc, revenueDocId, shouldRemoveRevenue } from "./_lib/cateringRevenue.mjs";

const SCOPE = "catering-revenue-rollup";

// Uses the shared bootstrap so every catering endpoint initializes the Admin
// SDK identically. firebase-admin keeps one default app per process, so the
// first endpoint to load defines it for all of them — a local variant here
// would silently deprive the recap endpoint of its storage bucket.
const adminApp = initCateringAdmin(SCOPE, { storageBucketEnvVar: "FIREBASE_STORAGE_BUCKET" });
const db = adminApp.firestore();

// Firestore document IDs are opaque but must not contain slashes.
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let caller;
  try {
    // Accepts a manager ID token or CRON_SECRET — the nightly sweep calls this.
    caller = await verifyStaffOrCron(adminApp, db, req);
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
        updated_by: caller.uid ?? "cron",
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
