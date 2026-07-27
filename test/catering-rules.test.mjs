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
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
} from "firebase/firestore";

import { REQUESTER_EDITABLE_FIELDS } from "../src/catering/schema.js";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const suiteOpts = { skip: EMULATOR ? false : "requires the Firestore emulator (npm run test:rules)" };

const RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

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
    firestore: { rules: RULES, host, port: Number(port) },
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

test("room assignment is staff-only; the owner may read it", suiteOpts, async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "catering_events", EVENT_ID,
      "catering_event_rooms", "r1"), { roomId: "CG1-2122" });
  });

  await assertSucceeds(
    getDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID, "catering_event_rooms", "r1"))
  );
  await assertFails(
    setDoc(doc(ctxFor(REQUESTER), "catering_events", EVENT_ID,
      "catering_event_rooms", "r2"), { roomId: "CG1-2122" })
  );
  await assertSucceeds(
    setDoc(doc(ctxFor(MANAGER), "catering_events", EVENT_ID,
      "catering_event_rooms", "r3"), { roomId: "CG1-2122" })
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
