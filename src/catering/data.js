/**
 * Catering Companion — Firestore access layer.
 *
 * Mirrors the style of src/firebase/data.js: thin functions over the modular
 * SDK, subscriptions returning their unsubscribe.
 *
 * Every write here stays inside the requester's permitted surface. Staff-only
 * paths (catering_event_rooms, revenue, status transitions) are not reachable
 * from this module — those land in Phase 3.
 */

import {
  collection, doc, addDoc, setDoc, updateDoc, getDocs, onSnapshot,
  query, where, orderBy, serverTimestamp, writeBatch,
} from "firebase/firestore";

import { db } from "../firebase.js";
import { COLLECTIONS } from "./schema.js";
import { toEventDoc, toRoomBookingDocs, toScheduleDayDocs } from "./formState.js";

// ── Reference data ───────────────────────────────────────────────────────────

export async function fetchBuildings() {
  const snap = await getDocs(collection(db, COLLECTIONS.BUILDINGS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function fetchRooms() {
  const snap = await getDocs(collection(db, COLLECTIONS.ROOMS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

// ── Submitting a request ─────────────────────────────────────────────────────

/**
 * Create a catering event with its schedule days and nested meal selections.
 *
 * The parent document is written first — the subcollection rules resolve the
 * owner via a get() on it, so it has to exist before the children are written.
 * Children then go in a single batch.
 *
 * Returns the new event ID.
 */
export async function submitCateringRequest(form, user) {
  const eventData = toEventDoc(form, user.uid);

  const eventRef = await addDoc(collection(db, COLLECTIONS.EVENTS), {
    ...eventData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
  });

  const days = toScheduleDayDocs(form);
  const rooms = toRoomBookingDocs(form);

  if (days.length || rooms.length) {
    const batch = writeBatch(db);

    for (const day of days) {
      const dayRef = doc(collection(eventRef, COLLECTIONS.SCHEDULE_DAYS));
      batch.set(dayRef, { ...day.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      for (const meal of day.meals) {
        const mealRef = doc(collection(dayRef, COLLECTIONS.MEAL_SELECTIONS));
        batch.set(mealRef, { ...meal.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
    }

    // Rooms are already booked externally, so the requester records them here
    // rather than waiting for staff to assign one.
    for (const room of rooms) {
      const roomRef = doc(collection(eventRef, COLLECTIONS.EVENT_ROOMS));
      batch.set(roomRef, { ...room.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }

    await batch.commit();
  }

  return eventRef.id;
}

/**
 * Update an existing request. Only allowlisted fields are sent, so this is
 * rejected by the rules once staff have confirmed the event.
 */
export async function updateCateringRequest(eventId, form, user) {
  const { createdBy: _createdBy, requestStatus: _rs, lifecycleStatus: _ls, ...editable } =
    toEventDoc(form, user.uid);
  await updateDoc(doc(db, COLLECTIONS.EVENTS, eventId), {
    ...editable,
    updatedAt: serverTimestamp(),
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Live "my requests" list. Ordered client-side so the view works before the
 * composite index finishes building on a fresh project.
 */
export function subscribeMyRequests(uid, onData, onError) {
  const q = query(collection(db, COLLECTIONS.EVENTS), where("createdBy", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(rows);
    },
    (err) => {
      console.error("[catering] my requests subscription failed:", err);
      onError?.(err);
    }
  );
}

export function subscribeCateringEvent(eventId, onData, onError) {
  return onSnapshot(
    doc(db, COLLECTIONS.EVENTS, eventId),
    (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.error("[catering] event subscription failed:", err);
      onError?.(err);
    }
  );
}

/** Schedule days for one event, each with its meal selections resolved. */
export async function fetchScheduleDays(eventId) {
  const daysRef = collection(db, COLLECTIONS.EVENTS, eventId, COLLECTIONS.SCHEDULE_DAYS);
  const daysSnap = await getDocs(query(daysRef, orderBy("date")));

  return Promise.all(
    daysSnap.docs.map(async (dayDoc) => {
      const mealsSnap = await getDocs(
        collection(dayDoc.ref, COLLECTIONS.MEAL_SELECTIONS)
      );
      return {
        id: dayDoc.id,
        ...dayDoc.data(),
        meals: mealsSnap.docs.map((m) => ({ id: m.id, ...m.data() })),
      };
    })
  );
}

/** Rooms booked for this event. Editable by the owner and by staff. */
export async function fetchBookedRooms(eventId) {
  const snap = await getDocs(
    collection(db, COLLECTIONS.EVENTS, eventId, COLLECTIONS.EVENT_ROOMS)
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Requester self-provisioning ──────────────────────────────────────────────

/**
 * Create the caller's `requester` role document. The security rules pin this
 * path to the literal role 'requester', so it can never mint a staff role.
 */
export async function provisionRequesterRole(user) {
  await setDoc(doc(db, "user_roles", user.uid), {
    uid:   user.uid,
    // Must match request.auth.token.email exactly for the rule to pass.
    email: user.email,
    displayName: user.displayName || "",
    role: "requester",
    assignedBy: "self:catering",
    assignedAt: serverTimestamp(),
    createdAt:  serverTimestamp(),
  });
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
}
