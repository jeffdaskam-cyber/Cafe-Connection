#!/usr/bin/env node
/**
 * Seed the catering reference collections (`rooms`, `buildings`) from the
 * AppSheet export.
 *
 * Usage (sandbox — no credentials needed):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seedCateringReferenceData.mjs
 *
 * Reads data/catering/rooms.csv and data/catering/buildings.csv. That
 * directory is git-ignored; see docs/catering/SEED_AND_MIGRATION.md.
 *
 * Idempotent: documents are keyed by the AppSheet natural key (Room Key /
 * Building Key), so re-running updates in place rather than duplicating.
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { COLLECTIONS } from "../src/catering/schema.js";
import { campusForBuilding, cleanString, parseNumber, parseYesNo } from "./lib/cateringTransforms.mjs";
import {
  assertWriteAllowed, commitInBatches, initAdmin, isEmulator, loadCsv, usedExampleData,
} from "./lib/cateringAdmin.mjs";

// Only the local sandbox may fall back to the committed synthetic sample.
// Seeding a real project silently with fake rooms would be much worse than
// failing, so the fallback is emulator-only.
const ALLOW_EXAMPLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const EXPECTED_ROOMS = 44;
const EXPECTED_BUILDINGS = 9;

async function main() {
  assertWriteAllowed();
  const app = initAdmin();
  const db = getFirestore(app);

  console.log(`[seed] target: ${isEmulator() ? "EMULATOR " + process.env.FIRESTORE_EMULATOR_HOST : "LIVE PROJECT"}`);

  // ── Buildings ──────────────────────────────────────────────────────────
  const buildingRows = loadCsv("buildings.csv", { allowExample: ALLOW_EXAMPLE });
  const buildingWrites = [];
  const unmappedBuildings = [];

  for (const row of buildingRows) {
    const key = cleanString(row["Building Key"]).toUpperCase();
    if (!key) continue;

    const campus = campusForBuilding(key);
    if (!campus) unmappedBuildings.push(key);

    buildingWrites.push({
      ref: db.collection(COLLECTIONS.BUILDINGS).doc(key),
      data: {
        id:        key,
        legacyId:  key,
        name:      cleanString(row["Building Name"]),
        // Not in the AppSheet source — supplied so Phase 4 can write
        // event_revenue, which requires a valid campus.
        campus,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  await commitInBatches(db, buildingWrites);
  console.log(`[seed] buildings written: ${buildingWrites.length}`);
  if (unmappedBuildings.length) {
    console.warn(`[seed] WARNING no campus mapping for: ${unmappedBuildings.join(", ")}`);
    console.warn("[seed]         add them to BUILDING_CAMPUS in src/catering/schema.js");
  }

  // ── Rooms ──────────────────────────────────────────────────────────────
  const roomRows = loadCsv("rooms.csv", { allowExample: ALLOW_EXAMPLE });
  const roomWrites = [];
  const orphanRooms = [];
  const buildingKeys = new Set(buildingWrites.map((w) => w.data.id));

  for (const row of roomRows) {
    const key = cleanString(row["Room Key"]);
    if (!key) continue;

    const buildingId = cleanString(row["Building"]).toUpperCase();
    if (buildingId && !buildingKeys.has(buildingId)) orphanRooms.push(`${key} → ${buildingId}`);

    roomWrites.push({
      ref: db.collection(COLLECTIONS.ROOMS).doc(key),
      data: {
        id:           key,
        legacyId:     key,
        buildingId:   buildingId || null,
        campus:       campusForBuilding(buildingId),
        name:         cleanString(row["Room Name"]),
        capacity:     parseNumber(row["Capacity"]),
        seatingNotes: cleanString(row["Seating Notes"]),
        // Source column is "Fixed". The build plan called this isFlexible —
        // the opposite polarity — so it is stored under the source's name to
        // keep the meaning unambiguous. See docs/catering/DATA_MODEL.md §5.
        isFixed:      parseYesNo(row["Fixed"]),
        updatedAt:    FieldValue.serverTimestamp(),
      },
    });
  }

  await commitInBatches(db, roomWrites);
  console.log(`[seed] rooms written: ${roomWrites.length}`);
  if (orphanRooms.length) {
    console.warn(`[seed] WARNING rooms referencing an unknown building:\n  ${orphanRooms.join("\n  ")}`);
  }

  // ── Validation pass (build plan §4.4) ──────────────────────────────────
  // The expected counts describe the real export. Sample data is a handful of
  // synthetic rows, so asserting against them would fail every fresh clone.
  if (usedExampleData()) {
    console.log(
      `[seed] sample data: ${buildingWrites.length} buildings, ${roomWrites.length} rooms ` +
        "— skipping the source-sheet count check."
    );
    process.exit(0);
  }

  let ok = true;
  if (roomWrites.length !== EXPECTED_ROOMS) {
    console.error(`[seed] FAIL expected ${EXPECTED_ROOMS} rooms, wrote ${roomWrites.length}`);
    ok = false;
  }
  if (buildingWrites.length !== EXPECTED_BUILDINGS) {
    console.error(`[seed] FAIL expected ${EXPECTED_BUILDINGS} buildings, wrote ${buildingWrites.length}`);
    ok = false;
  }

  console.log(ok ? "[seed] ✅ counts match the source sheet" : "[seed] ❌ count mismatch");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[seed] error:", err.message);
  process.exit(1);
});
