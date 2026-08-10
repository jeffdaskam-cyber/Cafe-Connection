#!/usr/bin/env node
/**
 * Seed catering reference data — buildings and rooms — into Firestore.
 *
 *   npm run catering:seed                        # local sandbox (emulators)
 *   CATERING_ALLOW_PRODUCTION_WRITE=true \
 *     FIREBASE_ADMIN_* … node scripts/seedCateringReferenceData.mjs
 *
 * The data itself lives in api/_lib/cateringReferenceData.mjs, committed to the
 * repo, and the document shapes in api/_lib/cateringReference.mjs. Both are
 * shared with the `seed-reference` action on /api/catering, so seeding from a
 * browser and seeding from a terminal produce identical documents.
 *
 * Idempotent: document IDs are the source sheet's room and building keys, and
 * every write is a merge, so re-running converges rather than duplicating.
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  buildBuildingDocs, buildRoomDocs, orphanRoomBuildings, unmappedBuildings,
} from "../api/_lib/cateringReference.mjs";
import { COLLECTIONS } from "../src/catering/schema.js";
import { assertWriteAllowed, commitInBatches, initAdmin, isEmulator } from "./lib/cateringAdmin.mjs";

async function main() {
  assertWriteAllowed();
  const app = initAdmin();
  const db = getFirestore(app);
  const now = FieldValue.serverTimestamp();

  console.log(
    `[seed] target: ${isEmulator()
      ? "EMULATOR " + process.env.FIRESTORE_EMULATOR_HOST
      : "LIVE PROJECT " + (process.env.FIREBASE_ADMIN_PROJECT_ID || "unknown")}`
  );

  const buildings = buildBuildingDocs(now);
  await commitInBatches(db, buildings.map((b) => ({
    ref: db.collection(COLLECTIONS.BUILDINGS).doc(b.id),
    data: b.data,
  })));
  console.log(`[seed] buildings written: ${buildings.length}`);

  const rooms = buildRoomDocs(now);
  await commitInBatches(db, rooms.map((r) => ({
    ref: db.collection(COLLECTIONS.ROOMS).doc(r.id),
    data: r.data,
  })));
  console.log(`[seed] rooms written: ${rooms.length}`);

  // A room pointing at an unknown building silently vanishes from the intake
  // form's building filter, and a building with no campus blocks the Phase 4
  // revenue rollup. Both are data problems worth seeing.
  const orphans = orphanRoomBuildings();
  if (orphans.length) {
    console.warn(`[seed] WARNING rooms referencing an unknown building:\n  ${orphans.join("\n  ")}`);
  }
  const unmapped = unmappedBuildings();
  if (unmapped.length) {
    console.warn(`[seed] WARNING no campus mapping for: ${unmapped.join(", ")}`);
    console.warn("[seed]         add them to BUILDING_CAMPUS in src/catering/schema.js");
  }

  console.log("[seed] done");
}

main().catch((err) => {
  console.error("[seed] error:", err.message);
  process.exit(1);
});
