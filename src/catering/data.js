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
import { COLLECTIONS, REQUEST_STATUS, REQUESTER_CREATE_STATUS } from "./schema.js";
import { eventToForm, toEventDoc, toRoomBookingDocs, toScheduleDayDocs } from "./formState.js";

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

// ── Saving a request ─────────────────────────────────────────────────────────

/** Queue the schedule-day, meal, and room subcollection writes onto a batch. */
function writeChildren(batch, eventRef, form) {
  for (const day of toScheduleDayDocs(form)) {
    const dayRef = doc(collection(eventRef, COLLECTIONS.SCHEDULE_DAYS));
    batch.set(dayRef, { ...day.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    for (const meal of day.meals) {
      const mealRef = doc(collection(dayRef, COLLECTIONS.MEAL_SELECTIONS));
      batch.set(mealRef, { ...meal.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  }
  // Rooms are already booked externally, so the requester records them here
  // rather than waiting for staff to assign one.
  for (const room of toRoomBookingDocs(form)) {
    const roomRef = doc(collection(eventRef, COLLECTIONS.EVENT_ROOMS));
    batch.set(roomRef, { ...room.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

/**
 * Queue deletes for every existing schedule day (with its meals) and room.
 *
 * Editing replaces the subcollections wholesale rather than diffing them: the
 * rows carry only client-side localIds, so there is no stable key to match a
 * form row back to an existing document. A full replace keeps the stored data
 * an exact mirror of the form.
 */
async function clearChildren(batch, eventRef) {
  const daysSnap = await getDocs(collection(eventRef, COLLECTIONS.SCHEDULE_DAYS));
  for (const dayDoc of daysSnap.docs) {
    const mealsSnap = await getDocs(collection(dayDoc.ref, COLLECTIONS.MEAL_SELECTIONS));
    for (const mealDoc of mealsSnap.docs) batch.delete(mealDoc.ref);
    batch.delete(dayDoc.ref);
  }
  const roomsSnap = await getDocs(collection(eventRef, COLLECTIONS.EVENT_ROOMS));
  for (const roomDoc of roomsSnap.docs) batch.delete(roomDoc.ref);
}

/**
 * Create a new catering event with its schedule days, meals, and rooms.
 *
 * `status` is 'submitted' for a finished request or 'draft' for a
 * save-and-leave. The parent document is written first — the subcollection
 * rules resolve the owner via a get() on it, so it has to exist before the
 * children are written. Children then go in a single batch.
 *
 * Returns the new event ID.
 */
export async function createCateringEvent(form, user, { status = REQUESTER_CREATE_STATUS } = {}) {
  const eventRef = await addDoc(collection(db, COLLECTIONS.EVENTS), {
    ...toEventDoc(form, user.uid, { status }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(status === REQUEST_STATUS.SUBMITTED ? { submittedAt: serverTimestamp() } : {}),
  });

  const batch = writeBatch(db);
  writeChildren(batch, eventRef, form);
  await batch.commit();

  return eventRef.id;
}

/**
 * Update an existing event and re-sync its subcollections. Only allowlisted
 * fields are sent, so the rules accept this from the owner at any point —
 * including after staff confirm the event. Set `submit` to move the owner's
 * own draft to 'submitted' in the same write.
 */
export async function updateCateringEvent(eventId, form, user, { submit = false } = {}) {
  const eventRef = doc(db, COLLECTIONS.EVENTS, eventId);
  const { createdBy: _createdBy, requestStatus: _rs, lifecycleStatus: _ls, ...editable } =
    toEventDoc(form, user.uid);

  // Note: submittedAt is not on the requester allowlist, so submitting a draft
  // only moves requestStatus — the rules reject any other status-adjacent field.
  await updateDoc(eventRef, {
    ...editable,
    ...(submit ? { requestStatus: REQUEST_STATUS.SUBMITTED } : {}),
    updatedAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  await clearChildren(batch, eventRef);
  writeChildren(batch, eventRef, form);
  await batch.commit();
}

/**
 * Load one event and its subcollections, shaped for the intake form so it can
 * be reopened for editing.
 */
export async function fetchEventForEditing(event) {
  const [days, rooms] = await Promise.all([
    fetchScheduleDays(event.id),
    fetchBookedRooms(event.id),
  ]);
  return {
    id: event.id,
    requestStatus: event.requestStatus,
    form: eventToForm(event, days, rooms),
  };
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
