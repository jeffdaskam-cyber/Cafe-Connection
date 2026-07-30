#!/usr/bin/env node
/**
 * Migrate the historical AppSheet events into `catering_events` and their
 * subcollections.
 *
 * Usage (sandbox — no credentials needed):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrateCateringEvents.mjs
 *
 * Reads events.csv, schedule_days.csv, meal_selections.csv, and
 * event_rooms.csv from data/catering/ (git-ignored). Run
 * seedCateringReferenceData.mjs first — room references are resolved against
 * the seeded `rooms` collection.
 *
 * Per the Phase 1 decision, ALL historical events are migrated. Nothing is
 * invented: anything that cannot be resolved keeps its raw value and the
 * document is flagged needsReview so staff can correct it in the console.
 * Documents are keyed by the AppSheet UniqueKey, so re-running is idempotent.
 */

import admin from "firebase-admin";

import { COLLECTIONS } from "../src/catering/schema.js";
import {
  cleanString, normalizeMealPeriod, normalizeTime, parseCateringServices,
  parseDate, parseNumber, parseYesNo, resolveRoomKey, transformEventRow,
} from "./lib/cateringTransforms.mjs";
import { assertWriteAllowed, commitInBatches, initAdmin, isEmulator, loadCsv } from "./lib/cateringAdmin.mjs";

const EXPECTED_EVENTS = 10;
const MIGRATION_ACTOR = "appsheet-migration";

async function main() {
  assertWriteAllowed();
  const app = initAdmin();
  const db = app.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  console.log(`[migrate] target: ${isEmulator() ? "EMULATOR " + process.env.FIRESTORE_EMULATOR_HOST : "LIVE PROJECT"}`);

  // Resolve rooms against what was actually seeded, not against the CSV.
  const roomsSnap = await db.collection(COLLECTIONS.ROOMS).get();
  const knownRoomKeys = roomsSnap.docs.map((d) => d.id);
  if (knownRoomKeys.length === 0) {
    throw new Error("No rooms found — run scripts/seedCateringReferenceData.mjs first.");
  }
  console.log(`[migrate] resolving against ${knownRoomKeys.length} seeded rooms`);

  // ── Events ─────────────────────────────────────────────────────────────
  const eventRows = loadCsv("events.csv");
  const writes = [];
  const flagged = [];
  // AppSheet child tables join on the Events "UniqueKey".
  const eventKeys = new Set();

  for (const row of eventRows) {
    const { doc, review } = transformEventRow(row, { knownRoomKeys, migratedBy: MIGRATION_ACTOR });
    const key = doc.legacyKey;
    if (!key) {
      console.warn("[migrate] skipping row with no UniqueKey:", row["Event Name"] || "(unnamed)");
      continue;
    }
    eventKeys.add(key);
    if (review.length) flagged.push({ key, name: doc.eventName, review });

    writes.push({
      ref: db.collection(COLLECTIONS.EVENTS).doc(key),
      data: { ...doc, createdAt: now, updatedAt: now },
    });
  }

  await commitInBatches(db, writes);
  console.log(`[migrate] events written: ${writes.length}`);

  // ── Schedule days ──────────────────────────────────────────────────────
  const dayRows = loadCsv("schedule_days.csv");
  const dayWrites = [];
  const orphanDays = [];
  // Schedule ID → owning event key, needed to nest meal selections.
  const dayToEvent = new Map();

  for (const row of dayRows) {
    const dayId = cleanString(row["Schedule ID"]);
    const eventKey = cleanString(row["Event ID"]);
    if (!dayId) continue;

    if (!eventKeys.has(eventKey)) { orphanDays.push(`${dayId} → event ${eventKey}`); continue; }
    dayToEvent.set(dayId, eventKey);

    dayWrites.push({
      ref: db.collection(COLLECTIONS.EVENTS).doc(eventKey)
             .collection(COLLECTIONS.SCHEDULE_DAYS).doc(dayId),
      data: {
        id:        dayId,
        legacyId:  dayId,
        date:      parseDate(row["Date"]),
        startTime: normalizeTime(row["Start Time"]),
        endTime:   normalizeTime(row["End Time"]),
        cateringServicesNeeded: parseCateringServices(row["Catering"]),
        notes:     "",
        migratedFromAppSheet: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await commitInBatches(db, dayWrites);
  console.log(`[migrate] schedule days written: ${dayWrites.length}`);

  // ── Meal selections ────────────────────────────────────────────────────
  const mealRows = loadCsv("meal_selections.csv");
  const mealWrites = [];
  const orphanMeals = [];

  for (const row of mealRows) {
    const mealId = cleanString(row["Meal Selection ID"]);
    const dayId  = cleanString(row["Schedule ID"]);
    if (!mealId) continue;

    const eventKey = dayToEvent.get(dayId);
    if (!eventKey) { orphanMeals.push(`${mealId} → schedule day ${dayId}`); continue; }

    mealWrites.push({
      ref: db.collection(COLLECTIONS.EVENTS).doc(eventKey)
             .collection(COLLECTIONS.SCHEDULE_DAYS).doc(dayId)
             .collection(COLLECTIONS.MEAL_SELECTIONS).doc(mealId),
      data: {
        id:            mealId,
        legacyId:      mealId,
        mealPeriod:    normalizeMealPeriod(row["Meal Period"]),
        time:          normalizeTime(row["Meal Start Time"]),
        menuSelection: cleanString(row["Menu Selection"]),
        location:      cleanString(row["Location"]),
        headcount:     null,
        migratedFromAppSheet: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await commitInBatches(db, mealWrites);
  console.log(`[migrate] meal selections written: ${mealWrites.length}`);

  // ── Event rooms ────────────────────────────────────────────────────────
  const roomRows = loadCsv("event_rooms.csv");
  const eventRoomWrites = [];
  const orphanEventRooms = [];

  for (const row of roomRows) {
    const bookingId = cleanString(row["Event Room ID"]);
    const eventKey  = cleanString(row["Event ID"]);
    if (!bookingId) continue;
    if (!eventKeys.has(eventKey)) { orphanEventRooms.push(`${bookingId} → event ${eventKey}`); continue; }

    const buildingId = cleanString(row["Building ID"]).toUpperCase();
    const room = resolveRoomKey(row["Room ID"], knownRoomKeys, buildingId);

    eventRoomWrites.push({
      ref: db.collection(COLLECTIONS.EVENTS).doc(eventKey)
             .collection(COLLECTIONS.EVENT_ROOMS).doc(bookingId),
      data: {
        id:                bookingId,
        legacyId:          bookingId,
        buildingId:        buildingId || null,
        roomId:            room.roomId,
        rawRoom:           room.resolved ? null : (room.raw || null),
        needsReview:       !room.resolved && room.raw !== "",
        setupType:         cleanString(row["Setup"]),
        startTime:         normalizeTime(row["Room Start Time"]),
        endTime:           normalizeTime(row["Room End Time"]),
        expectedHeadcount: parseNumber(row["Expected Headcount"]),
        isPrimary:         parseYesNo(row["Is Primary Room"]),
        notes:             cleanString(row["Room Notes"]),
        migratedFromAppSheet: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await commitInBatches(db, eventRoomWrites);
  console.log(`[migrate] event rooms written: ${eventRoomWrites.length}`);

  // ── Report ─────────────────────────────────────────────────────────────
  console.log("");
  if (flagged.length) {
    console.log(`[migrate] ${flagged.length} event(s) flagged needsReview:`);
    for (const f of flagged) console.log(`  ${f.key} "${f.name}": ${f.review.join("; ")}`);
  }
  for (const [label, list] of [
    ["schedule days", orphanDays], ["meal selections", orphanMeals], ["event rooms", orphanEventRooms],
  ]) {
    if (list.length) {
      console.warn(`[migrate] ${list.length} orphaned ${label} skipped (parent missing):\n  ${list.join("\n  ")}`);
    }
  }

  // Validation pass (build plan §4.4): the count must match the source. The
  // needsReview count is reported, not asserted — the source is known dirty.
  const ok = writes.length === EXPECTED_EVENTS;
  console.log("");
  console.log(ok
    ? `[migrate] ✅ ${writes.length} events migrated (${flagged.length} need review)`
    : `[migrate] ❌ expected ${EXPECTED_EVENTS} events, migrated ${writes.length}`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[migrate] error:", err.message);
  process.exit(1);
});
