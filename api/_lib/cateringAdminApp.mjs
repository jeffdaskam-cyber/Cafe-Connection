/**
 * Shared Admin SDK bootstrap and staff auth for the catering endpoints.
 *
 * Sandbox-aware: with FIRESTORE_EMULATOR_HOST set, the SDK talks to the local
 * emulators and no service-account credentials are needed. Verifying ID tokens
 * additionally needs FIREBASE_AUTH_EMULATOR_HOST — the Vite dev middleware sets
 * both (see vite.config.js).
 */

import admin from "firebase-admin";

import { createHttpError, getAdminApp, requireEnv } from "./serverless.mjs";

export const STAFF_ROLES = ["manager", "senior_leader", "administrator"];

export const USE_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

export function initCateringAdmin(scope, options = {}) {
  if (USE_EMULATOR) {
    try {
      return admin.app();
    } catch {
      // The storage bucket is always supplied, even for endpoints that do not
      // use Storage: firebase-admin keeps a single default app per process, so
      // whichever catering endpoint loads first defines it for all of them.
      return admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || "demo-cafe-connection",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
          || `${process.env.GCLOUD_PROJECT || "demo-cafe-connection"}.firebasestorage.app`,
      });
    }
  }

  requireEnv(scope, process.env, [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
  ]);
  return getAdminApp(admin, process.env, scope, options);
}

/**
 * Accept either a manager-and-above Firebase ID token, or the CRON_SECRET as a
 * bearer token — the same dual scheme api/ingest-email-orders.mjs uses.
 *
 * @returns {{ uid: string|null, email: string|null, viaCron: boolean }}
 */
export async function verifyStaffOrCron(app, db, req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw createHttpError("Unauthorized.", 401);

  const token = authHeader.slice(7);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) {
    return { uid: null, email: null, viaCron: true };
  }

  let decoded;
  try {
    decoded = await app.auth().verifyIdToken(token);
  } catch {
    throw createHttpError("Invalid token.", 401);
  }

  if (!decoded.email?.toLowerCase().endsWith("@ucar.edu")) {
    throw createHttpError("Forbidden.", 403);
  }

  // Roles live in user_roles, not users.
  const roleSnap = await db.collection("user_roles").doc(decoded.uid).get();
  const role = roleSnap.exists ? roleSnap.data().role : null;
  if (!STAFF_ROLES.includes(role)) {
    throw createHttpError("Forbidden — manager access required.", 403);
  }

  return { uid: decoded.uid, email: decoded.email, viaCron: false };
}

/** Load an event with the subcollections the recap and notifications need. */
export async function loadEventBundle(db, eventId) {
  const eventSnap = await db.collection("catering_events").doc(eventId).get();
  if (!eventSnap.exists) return null;

  const daysSnap = await eventSnap.ref.collection("catering_schedule_days").get();
  const scheduleDays = await Promise.all(
    daysSnap.docs.map(async (dayDoc) => {
      const meals = await dayDoc.ref.collection("catering_meal_selections").get();
      return {
        id: dayDoc.id,
        ...dayDoc.data(),
        meals: meals.docs.map((m) => ({ id: m.id, ...m.data() })),
      };
    })
  );

  const roomsSnap = await eventSnap.ref.collection("catering_event_rooms").get();

  return {
    event: { id: eventSnap.id, ...eventSnap.data() },
    ref: eventSnap.ref,
    scheduleDays,
    eventRooms: roomsSnap.docs.map((r) => ({ id: r.id, ...r.data() })),
  };
}
