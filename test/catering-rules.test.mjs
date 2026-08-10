/**
 * Firestore security rules unit tests for the Catering Companion.
 *
 * Requires the Firestore emulator. Run with:
 *   npm run test:rules
 *
 * Skipped (not failed) under a plain `npm test` so the default suite stays
 * runnable without the emulator.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, getDocs,
} from "firebase/firestore";

import { REQUESTER_EDITABLE_FIELDS } from "../src/catering/schema.js";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const suiteOpts = { skip: EMULATOR ? false : "requires the Firestore emulator (npm run test:rules)" };

const RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

/**
 * Rewrite the pilot allowlist baked into firestore.rules.
 *
 * The deployed rules carry a real list, so every role test would otherwise fail
 * for the wrong reason. The role suite runs against an EMPTY list — the state
 * the pilot ends in — and the allowlist gets its own tests below with a known
 * list, so both the restricted and unrestricted behaviors are covered.
 */
const ALLOWLIST_RE = /(function cateringAllowlist\(\)\s*\{\s*return\s*)\[[^\]]*\]/;

function rulesWithAllowlist(emails) {
  if (!ALLOWLIST_RE.test(RULES)) {
    throw new Error("cateringAllowlist() not found in firestore.rules - the tests cannot substitute it");
  }
  const list = emails.length ? `['${emails.join("', '")}']` : "[]";
  return RULES.replace(ALLOWLIST_RE, `$1${list}`);
}

const REQUESTER = { uid: "requester1", email: "requester@ucar.edu" };
const OTHER     = { uid: "requester2", email: "other@ucar.edu" };
const MANAGER   = { uid: "manager1",   email: "manager@ucar.edu" };
const OUTSIDER  = { uid: "outsider1",  email: "someone@gmail.com" };

const EVENT_ID = "evt1";
const OTHER_EVENT_ID = "evt2";

function validEvent(createdBy, overrides = {}) {
  return {
    createdBy,
    eventName: "Test Event",
    requestStatus: "submitted",
    lifecycleStatus: "open",
    plannerName: "Test Planner",
    expectedAttendance: 20,
    ...overrides,
  };
}

let testEnv;

test.before(async () => {
  if (!EMULATOR) return;
  const [host, port] = EMULATOR.split(":");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-cafe-connection-rules",
    firestore: { rules: rulesWithAllowlist([]), host, port: Number(port) },
  });
});

test.after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test.beforeEach(async () => {
  if (!testEnv) return;
  await testEnv.clearFirestore();
  // Seed role docs and baseline events with rules bypassed.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "user_roles", REQUESTER.uid), { role: "requester", email: REQUESTER.email });
    await setDoc(doc(db, "user_roles", OTHER.uid),     { role: "requester", email: OTHER.email });
    await setDoc(doc(db, "user_roles", MANAGER.uid),   { role: "manager",   email: MANAGER.email });
    await setDoc(doc(db, "catering_events", EVENT_ID), validEvent(REQUESTER.uid));
    await setDoc(doc(db, "catering_events", OTHER_EVENT_ID), validEvent(OTHER.uid));
    await setDoc(doc(db, "rooms", "CG1-2122"), { id: "CG1-2122", name: "CG1-2122" });
    await setDoc(doc(db, "buildings", "CG1"), { id: "CG1", name: "Center Green 1" });
  });
});

function ctxFor(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

// ── The allowlist in rules must match the one in schema.js ──────────────────

test("firestore.rules requesterEditableFields matches schema.js", suiteOpts, () => {
  const block = RULES.match(/function requesterEditableFields\(\)\s*\{\s*return\s*\[([\s\S]*?)\];/);
  assert.ok(block, "requesterEditableFields() not found in firestore.rules");
  const fromRules = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    [...fromRules].sort(),
    [...REQUESTER_EDITABLE_FIELDS].sort(),
    "rules allowlist has drifted from REQUESTER_EDITABLE_FIELDS in src/catering/schema.js"
  );
});

// ── Read boundaries ────────────────────────────────────────────────────────

test("a requester can read their own event", suiteOpts, async () => {
  await assertSucceeds(getDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID)));
});

test("a requester cannot read another requester's event", suiteOpts, async () => {
  await assertFails(getDoc(doc(ctxFor(REQUESTER), "catering_events", OTHER_EVENT_ID)));
});

test("a requester cannot list all events", suiteOpts, async () => {
  await assertFails(getDocs(collection(ctxFor(REQUESTER), "catering_events")));
});

test("a manager can read any event", suiteOpts, async () => {
  await assertSucceeds(getDoc(doc(ctxFor(MANAGER), "catering_events", OTHER_EVENT_ID)));
});

test("a non-UCAR account cannot read events at all", suiteOpts, async () => {
  await assertFails(getDoc(doc(ctxFor(OUTSIDER), "catering_events", EVENT_ID)));
});

test("an unauthenticated client cannot read events", suiteOpts, async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "catering_events", EVENT_ID)));
});

// ── Create ─────────────────────────────────────────────────────────────────

test("a requester can create their own event as submitted/open", suiteOpts, async () => {
  await assertSucceeds(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", "new1"), validEvent(REQUESTER.uid))
  );
});

test("a requester cannot create an event owned by someone else", suiteOpts, async () => {
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", "new2"), validEvent(OTHER.uid))
  );
});

test("a requester cannot self-confirm on create", suiteOpts, async () => {
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", "new3"),
      validEvent(REQUESTER.uid, { requestStatus: "confirmed" }))
  );
});

test("a requester cannot set revenue on create", suiteOpts, async () => {
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", "new4"),
      validEvent(REQUESTER.uid, { estimatedRevenue: 5000 }))
  );
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", "new5"),
      validEvent(REQUESTER.uid, { actualRevenue: 5000 }))
  );
});

// ── Update ─────────────────────────────────────────────────────────────────

test("a requester can edit allowlisted fields on their own event", suiteOpts, async () => {
  await assertSucceeds(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), {
      plannerName: "Updated Name",
      specialRequests: "Please add decaf",
    })
  );
});

test("a requester cannot write revenue fields", suiteOpts, async () => {
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { estimatedRevenue: 1000 })
  );
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { actualRevenue: 1000 })
  );
});

test("a requester cannot advance their own request status", suiteOpts, async () => {
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { requestStatus: "confirmed" })
  );
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { lifecycleStatus: "closed" })
  );
});

test("a requester cannot reassign ownership", suiteOpts, async () => {
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { createdBy: OTHER.uid })
  );
});

test("a requester cannot edit once staff have confirmed", suiteOpts, async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "catering_events", EVENT_ID),
      validEvent(REQUESTER.uid, { requestStatus: "confirmed" }));
  });
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { plannerName: "Too Late" })
  );
});

test("a requester cannot edit another requester's event", suiteOpts, async () => {
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", OTHER_EVENT_ID), { plannerName: "Nope" })
  );
});

test("a manager can confirm, close, and set revenue", suiteOpts, async () => {
  await assertSucceeds(
    updateDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID), {
      requestStatus: "confirmed",
      lifecycleStatus: "closed",
      actualRevenue: 4200,
    })
  );
});

// ── Delete ─────────────────────────────────────────────────────────────────

test("a requester cannot delete their own event; a manager can", suiteOpts, async () => {
  await assertFails(deleteDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID)));
  await assertSucceeds(deleteDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID)));
});

// ── Subcollections ─────────────────────────────────────────────────────────

test("a requester can manage schedule days and meals on their own event", suiteOpts, async () => {
  const db = ctxFor(REQUESTER);
  await assertSucceeds(
    setDoc(doc(db, "catering_events", EVENT_ID, "catering_schedule_days", "d1"),
      { date: "2026-07-22", startTime: "08:00" })
  );
  await assertSucceeds(
    setDoc(doc(db, "catering_events", EVENT_ID, "catering_schedule_days", "d1",
      "catering_meal_selections", "m1"), { mealPeriod: "lunch", time: "12:00" })
  );
});

test("a requester cannot touch another requester's schedule days", suiteOpts, async () => {
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", OTHER_EVENT_ID,
      "catering_schedule_days", "d1"), { date: "2026-07-22" })
  );
});

// Rooms are booked in a separate calendar system before the form is filled in,
// so the owner records an existing booking rather than requesting one. Both the
// owner and staff can add and edit them.
test("the owner can record and edit their own booked rooms", suiteOpts, async () => {
  const db = ctxFor(REQUESTER);
  await assertSucceeds(
    setDoc(doc(db, "catering_events", EVENT_ID, "catering_event_rooms", "r1"),
      { roomId: "CG1-2122", buildingId: "CG1", isPrimary: true })
  );
  await assertSucceeds(
    getDoc(doc(db, "catering_events", EVENT_ID, "catering_event_rooms", "r1"))
  );
  await assertSucceeds(
    updateDoc(doc(db, "catering_events", EVENT_ID, "catering_event_rooms", "r1"),
      { setupType: "Classroom" })
  );
  await assertSucceeds(
    deleteDoc(doc(db, "catering_events", EVENT_ID, "catering_event_rooms", "r1"))
  );
});

test("staff can also edit a requester's booked rooms", suiteOpts, async () => {
  await assertSucceeds(
    setDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID,
      "catering_event_rooms", "r2"), { roomId: "CG1-2122" })
  );
});

test("a requester cannot touch another requester's booked rooms", suiteOpts, async () => {
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", OTHER_EVENT_ID,
      "catering_event_rooms", "r3"), { roomId: "CG1-2122" })
  );
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "catering_events", OTHER_EVENT_ID,
      "catering_event_rooms", "r4"), { roomId: "CG1-2122" });
  });
  await assertFails(
    getDoc(doc(ctxFor(REQUESTER), "catering_events", OTHER_EVENT_ID,
      "catering_event_rooms", "r4"))
  );
});

// ── Reference data ─────────────────────────────────────────────────────────

test("rooms and buildings are readable by any UCAR user, writable by none below admin", suiteOpts, async () => {
  await assertSucceeds(getDoc(doc(ctxFor(REQUESTER), "rooms", "CG1-2122")));
  await assertSucceeds(getDoc(doc(ctxFor(MANAGER), "buildings", "CG1")));
  await assertFails(setDoc(doc(ctxFor(REQUESTER), "rooms", "CG1-2122"), { capacity: 999 }));
  await assertFails(setDoc(doc(ctxFor(MANAGER), "buildings", "CG1"), { name: "Hijacked" }));
  await assertFails(getDoc(doc(ctxFor(OUTSIDER), "rooms", "CG1-2122")));
});

// ── Requester self-provisioning ────────────────────────────────────────────

test("a new UCAR user can self-provision as requester only", suiteOpts, async () => {
  const newUser = { uid: "newbie", email: "newbie@ucar.edu" };
  const db = ctxFor(newUser);

  // Cannot mint a staff role for themselves.
  await assertFails(
    setDoc(doc(db, "user_roles", newUser.uid), { role: "administrator", email: newUser.email })
  );
  await assertFails(
    setDoc(doc(db, "user_roles", newUser.uid), { role: "manager", email: newUser.email })
  );
  // Cannot create a role doc for somebody else.
  await assertFails(
    setDoc(doc(db, "user_roles", "someone-else"), { role: "requester", email: newUser.email })
  );
  // Can create their own requester doc.
  await assertSucceeds(
    setDoc(doc(db, "user_roles", newUser.uid), { role: "requester", email: newUser.email })
  );
});

test("a requester cannot escalate their existing role", suiteOpts, async () => {
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "user_roles", REQUESTER.uid), { role: "administrator" })
  );
});

test("a non-UCAR account cannot self-provision", suiteOpts, async () => {
  await assertFails(
    setDoc(doc(ctxFor(OUTSIDER), "user_roles", OUTSIDER.uid),
      { role: "requester", email: OUTSIDER.email })
  );
});

// ── Staff console (Phase 3) ────────────────────────────────────────────────

test("a manager can list the whole queue; a requester cannot", suiteOpts, async () => {
  await assertSucceeds(getDocs(collection(ctxFor(MANAGER), "catering_events")));
  await assertFails(getDocs(collection(ctxFor(REQUESTER), "catering_events")));
});

test("a manager can run the cross-event schedule collection-group query", suiteOpts, async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "catering_events", EVENT_ID, "catering_schedule_days", "d1"),
      { date: "2026-09-10", startTime: "08:00" });
    await setDoc(doc(db, "catering_events", OTHER_EVENT_ID, "catering_schedule_days", "d2"),
      { date: "2026-09-11", startTime: "09:00" });
  });

  // The daily schedule view depends on this working for staff.
  await assertSucceeds(getDocs(collectionGroup(ctxFor(MANAGER), "catering_schedule_days")));
  // A requester must not be able to sweep every event's schedule.
  await assertFails(getDocs(collectionGroup(ctxFor(REQUESTER), "catering_schedule_days")));
});

test("a manager can record status history when confirming and closing", suiteOpts, async () => {
  const ref = doc(ctxFor(MANAGER), "catering_events", EVENT_ID);
  await assertSucceeds(updateDoc(ref, {
    requestStatus: "confirmed",
    requestStatusHistory: [{ status: "confirmed", changedBy: MANAGER.uid, changedAt: "2026-07-28T00:00:00Z" }],
  }));
  await assertSucceeds(updateDoc(ref, {
    lifecycleStatus: "closed",
    lifecycleStatusHistory: [{ status: "closed", changedBy: MANAGER.uid, changedAt: "2026-07-28T01:00:00Z" }],
  }));
});

test("a requester cannot forge status history", suiteOpts, async () => {
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), {
      requestStatusHistory: [{ status: "confirmed", changedBy: REQUESTER.uid }],
    })
  );
});

test("a manager can clear a migration review flag; a requester cannot", suiteOpts, async () => {
  await assertSucceeds(
    updateDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID), {
      needsReview: false, reviewNotes: [],
    })
  );
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { needsReview: true })
  );
});

test("a manager can record actual attendance; a requester cannot", suiteOpts, async () => {
  await assertSucceeds(
    updateDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID), { actualAttendance: 73 })
  );
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { actualAttendance: 999 })
  );
});

test("a manager can write internal staff notes; a requester cannot", suiteOpts, async () => {
  await assertSucceeds(
    updateDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID), { staffNotes: "Chef briefed" })
  );
  await assertFails(
    updateDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID), { staffNotes: "let me in" })
  );
});

test("a plain staff `user` role gets no catering console access", suiteOpts, async () => {
  const staffUser = { uid: "staffuser1", email: "staff@ucar.edu" };
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "user_roles", staffUser.uid),
      { role: "user", email: staffUser.email });
  });

  await assertFails(getDocs(collection(ctxFor(staffUser), "catering_events")));
  await assertFails(getDoc(doc(ctxFor(staffUser), "catering_events", EVENT_ID)));
  await assertFails(
    updateDoc(doc(ctxFor(staffUser), "catering_events", EVENT_ID), { requestStatus: "confirmed" })
  );
});

// ── Pilot allowlist ─────────────────────────────────────────────────────────
// While catering runs against production data it is limited to named people.
// The suite above runs with an empty allowlist (the eventual end state); these
// tests use their own environment with a populated one, because that is the
// configuration actually being deployed.

const PILOT      = { uid: "pilot1",   email: "pilot@ucar.edu" };
const OFFLIST    = { uid: "offlist1", email: "offlist@ucar.edu" };
const PILOT_MGR  = { uid: "pmgr1",    email: "pilotmgr@ucar.edu" };
const OFFLIST_MGR = { uid: "omgr1",   email: "offlistmgr@ucar.edu" };

let pilotEnv;

function pilotCtx(user) {
  return pilotEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

test.before(async () => {
  if (!EMULATOR) return;
  const [host, port] = EMULATOR.split(":");
  pilotEnv = await initializeTestEnvironment({
    projectId: "demo-cafe-connection-allowlist",
    firestore: {
      rules: rulesWithAllowlist([PILOT.email, PILOT_MGR.email]),
      host,
      port: Number(port),
    },
  });
});

test.after(async () => {
  if (pilotEnv) await pilotEnv.cleanup();
});

async function seedPilot() {
  await pilotEnv.clearFirestore();
  await pilotEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "user_roles", PILOT.uid),       { role: "requester", email: PILOT.email });
    await setDoc(doc(db, "user_roles", OFFLIST.uid),     { role: "requester", email: OFFLIST.email });
    await setDoc(doc(db, "user_roles", PILOT_MGR.uid),   { role: "manager",   email: PILOT_MGR.email });
    await setDoc(doc(db, "user_roles", OFFLIST_MGR.uid), { role: "manager",   email: OFFLIST_MGR.email });
    await setDoc(doc(db, "catering_events", EVENT_ID), validEvent(PILOT.uid));
  });
}

test("allowlisted requester keeps normal access to their own event", suiteOpts, async () => {
  await seedPilot();
  await assertSucceeds(getDoc(doc(pilotCtx(PILOT), "catering_events", EVENT_ID)));
  await assertSucceeds(
    setDoc(doc(pilotCtx(PILOT), "catering_events", "pilot-new"), validEvent(PILOT.uid))
  );
});

test("a UCAR user off the allowlist cannot self-provision as a requester", suiteOpts, async () => {
  await seedPilot();
  const newbie = { uid: "newbie-offlist", email: "newbie@ucar.edu" };
  // This is the path that would otherwise let anyone at UCAR who finds
  // /catering create an account and file real requests.
  await assertFails(
    setDoc(doc(pilotCtx(newbie), "user_roles", newbie.uid),
      { role: "requester", email: newbie.email })
  );
});

test("an allowlisted user can still self-provision", suiteOpts, async () => {
  await seedPilot();
  const joiner = { uid: "joiner1", email: PILOT.email };
  await assertSucceeds(
    setDoc(doc(pilotCtx(joiner), "user_roles", joiner.uid),
      { role: "requester", email: joiner.email })
  );
});

test("a requester off the allowlist cannot read or write catering events", suiteOpts, async () => {
  await seedPilot();
  await assertFails(
    setDoc(doc(pilotCtx(OFFLIST), "catering_events", "offlist-new"), validEvent(OFFLIST.uid))
  );
  await assertFails(getDoc(doc(pilotCtx(OFFLIST), "catering_events", EVENT_ID)));
});

test("a manager off the allowlist gets no staff console access", suiteOpts, async () => {
  await seedPilot();
  // The role is sufficient; the allowlist is what denies them.
  await assertFails(getDocs(collection(pilotCtx(OFFLIST_MGR), "catering_events")));
  await assertFails(
    updateDoc(doc(pilotCtx(OFFLIST_MGR), "catering_events", EVENT_ID), { requestStatus: "confirmed" })
  );
});

test("an allowlisted manager keeps full staff console access", suiteOpts, async () => {
  await seedPilot();
  await assertSucceeds(getDocs(collection(pilotCtx(PILOT_MGR), "catering_events")));
  await assertSucceeds(
    updateDoc(doc(pilotCtx(PILOT_MGR), "catering_events", EVENT_ID), { requestStatus: "confirmed" })
  );
});

test("the allowlist does not leak into non-catering collections", suiteOpts, async () => {
  await seedPilot();
  // A manager off the catering pilot must still be a normal manager elsewhere.
  await assertSucceeds(getDocs(collection(pilotCtx(OFFLIST_MGR), "event_report_entries")));
});
