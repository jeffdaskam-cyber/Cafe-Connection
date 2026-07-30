/**
 * Catering Companion — staff-side Firestore access.
 *
 * Everything here requires manager-and-above; the security rules are the
 * enforcement, this module is the convenience layer. Kept separate from
 * data.js so the requester bundle never imports staff write paths.
 *
 * Revenue AMOUNTS are entered here by staff, on the catering event itself.
 * Rolling those amounts into the event_revenue collection is done server-side
 * by /api/catering (action "rollup") — the only writer of that collection — so
 * there is never a second, unreconciled client-side path.
 */

import {
  collection, collectionGroup, deleteDoc, doc, getDocs, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";

import { db } from "../firebase.js";
import { getAuthToken } from "../firebase/core.js";
import { COLLECTIONS, LIFECYCLE_STATUS, REQUEST_STATUS } from "./schema.js";

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Live subscription to every catering event. Sorted client-side so the console
 * works before the composite indexes finish building on a fresh project.
 */
export function subscribeAllCateringEvents(onData, onError) {
  return onSnapshot(
    collection(db, COLLECTIONS.EVENTS),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
      onData(rows);
    },
    (err) => {
      console.error("[catering/staff] events subscription failed:", err);
      onError?.(err);
    }
  );
}

/**
 * Schedule days across all events in a date range, via a collection-group
 * query. Backed by the collection-group index on catering_schedule_days
 * (date, startTime) added in Phase 1.
 *
 * Each row carries the owning `eventId`, recovered from the document path.
 */
export async function fetchScheduleDaysInRange(fromIso, toIso) {
  const constraints = [];
  if (fromIso) constraints.push(where("date", ">=", fromIso));
  if (toIso)   constraints.push(where("date", "<=", toIso));

  const snap = await getDocs(
    query(collectionGroup(db, COLLECTIONS.SCHEDULE_DAYS), ...constraints, orderBy("date"))
  );

  return snap.docs.map((d) => ({
    id: d.id,
    eventId: d.ref.parent.parent?.id ?? null,
    ...d.data(),
  }));
}

export async function fetchEventRooms(eventId) {
  const snap = await getDocs(
    collection(db, COLLECTIONS.EVENTS, eventId, COLLECTIONS.EVENT_ROOMS)
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchEventScheduleDays(eventId) {
  const daysRef = collection(db, COLLECTIONS.EVENTS, eventId, COLLECTIONS.SCHEDULE_DAYS);
  const daysSnap = await getDocs(query(daysRef, orderBy("date")));
  return Promise.all(
    daysSnap.docs.map(async (dayDoc) => {
      const meals = await getDocs(collection(dayDoc.ref, COLLECTIONS.MEAL_SELECTIONS));
      return {
        id: dayDoc.id,
        ...dayDoc.data(),
        meals: meals.docs.map((m) => ({ id: m.id, ...m.data() })),
      };
    })
  );
}

// ── Status transitions ───────────────────────────────────────────────────────

/**
 * Build a history entry. Stored as an appended array rather than arrayUnion:
 * two transitions to the same status at different times are distinct events
 * and must both be kept.
 */
function historyEntry(status, user) {
  return {
    status,
    changedBy: user?.uid ?? null,
    changedByEmail: user?.email ?? null,
    // serverTimestamp() is not allowed inside an array, so this is client time.
    // The document's updatedAt carries the authoritative server time.
    changedAt: new Date().toISOString(),
  };
}

/**
 * Move an event's approval state. No-ops when already in the target status so
 * a double-click cannot produce a duplicate history entry — the same guard
 * Phase 4's revenue rollup will depend on.
 */
export async function setRequestStatus(event, nextStatus, user) {
  if (!Object.values(REQUEST_STATUS).includes(nextStatus)) {
    throw new Error(`Unknown request status: ${nextStatus}`);
  }
  if (event.requestStatus === nextStatus) return false;

  await updateDoc(doc(db, COLLECTIONS.EVENTS, event.id), {
    requestStatus: nextStatus,
    requestStatusHistory: [...(event.requestStatusHistory || []), historyEntry(nextStatus, user)],
    updatedAt: serverTimestamp(),
  });
  return true;
}

/** Move an event's lifecycle state (open ⇄ closed). */
export async function setLifecycleStatus(event, nextStatus, user) {
  if (!Object.values(LIFECYCLE_STATUS).includes(nextStatus)) {
    throw new Error(`Unknown lifecycle status: ${nextStatus}`);
  }
  if (event.lifecycleStatus === nextStatus) return false;

  await updateDoc(doc(db, COLLECTIONS.EVENTS, event.id), {
    lifecycleStatus: nextStatus,
    lifecycleStatusHistory: [
      ...(event.lifecycleStatusHistory || []),
      historyEntry(nextStatus, user),
    ],
    updatedAt: serverTimestamp(),
  });
  return true;
}

/** Clear the migration review flag once staff have corrected the record. */
export async function resolveReviewFlag(eventId) {
  await updateDoc(doc(db, COLLECTIONS.EVENTS, eventId), {
    needsReview: false,
    reviewNotes: [],
    updatedAt: serverTimestamp(),
  });
}

// ── Editing ──────────────────────────────────────────────────────────────────

/**
 * Staff may edit any field on an event, including the revenue amounts. Those
 * amounts live on the catering event; the derived event_revenue row is written
 * only by the server-side rollup below.
 */
export async function updateEventFields(eventId, patch) {
  await updateDoc(doc(db, COLLECTIONS.EVENTS, eventId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Ask the server to reconcile this event's event_revenue row.
 *
 * Safe to call after any status change or revenue edit: the endpoint is
 * idempotent, skips events with no amount yet, and removes the row when an
 * event is no longer confirmed.
 *
 * Failures are surfaced but never block the status change that triggered them —
 * the nightly reconciliation sweep in Phase 5 is the backstop.
 */
export async function rollUpEventRevenue(eventId) {
  return callCateringApi("rollup", { eventId });
}

/**
 * Send the notification the event's current state warrants. Idempotent: the
 * endpoint skips a state it has already notified.
 */
export async function notifyForEvent(eventId, type) {
  return callCateringApi("notify", type ? { eventId, type } : { eventId });
}

/** Generate (or regenerate) the event recap PDF and store its URL. */
export async function generateRecap(eventId) {
  return callCateringApi("recap", { eventId });
}

/**
 * All catering server-side actions go through one endpoint, which routes on
 * `action`. Consolidated to stay within the host's per-deployment function cap.
 */
async function callCateringApi(action, body) {
  const token = await getAuthToken();
  const res = await fetch("/api/catering", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `catering ${action} failed (${res.status}).`);
  }
  return res.json();
}

/**
 * Correct a room booking. Rooms are reserved in a separate calendar system, so
 * this edits the record of an existing booking rather than assigning one.
 */
export async function updateRoomBooking(eventId, roomBookingId, patch) {
  await updateDoc(
    doc(db, COLLECTIONS.EVENTS, eventId, COLLECTIONS.EVENT_ROOMS, roomBookingId),
    { ...patch, updatedAt: serverTimestamp() }
  );
}

export async function deleteRoomBooking(eventId, roomBookingId) {
  await deleteDoc(
    doc(db, COLLECTIONS.EVENTS, eventId, COLLECTIONS.EVENT_ROOMS, roomBookingId)
  );
}
