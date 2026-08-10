/**
 * Build the Firestore documents for catering reference data.
 *
 * Shared by scripts/seedCateringReferenceData.mjs (terminal) and the
 * `seed-reference` action on /api/catering (browser). Both must write byte-for
 * byte the same documents, so the shapes live here rather than in either
 * caller — production was seeded from the browser and the sandbox from the
 * terminal, and a drift between them would be invisible until something read
 * a field that only one path wrote.
 *
 * Pure: no Firestore, no env, no I/O. Callers supply `now` because the server
 * timestamp sentinel differs between the Admin SDK and the client SDK.
 */

import { campusForBuilding } from "../../scripts/lib/cateringTransforms.mjs";
import { BUILDINGS, ROOMS } from "./cateringReferenceData.mjs";

/** "Yes"/"No" from the source sheet. Blank is unknown, not false. */
function parseFixed(value) {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "yes" || v === "y" || v === "true") return true;
  if (v === "no" || v === "n" || v === "false") return false;
  return null;
}

export function buildBuildingDocs(now) {
  return BUILDINGS.map(({ key, name }) => ({
    id: key,
    data: {
      id:        key,
      legacyId:  key,
      name,
      // Not in the AppSheet source — supplied so Phase 4 can write
      // event_revenue, which requires a valid campus.
      campus:    campusForBuilding(key),
      updatedAt: now,
    },
  }));
}

export function buildRoomDocs(now) {
  return ROOMS.map((room) => ({
    id: room.key,
    data: {
      id:           room.key,
      legacyId:     room.key,
      buildingId:   room.building || null,
      campus:       campusForBuilding(room.building),
      name:         room.name,
      capacity:     typeof room.capacity === "number" ? room.capacity : null,
      seatingNotes: room.seatingNotes || "",
      // Source column is "Fixed". The build plan called this isFlexible — the
      // opposite polarity — so it is stored under the source's name to keep the
      // meaning unambiguous. See docs/catering/DATA_MODEL.md §5.
      isFixed:      parseFixed(room.fixed),
      updatedAt:    now,
    },
  }));
}

/** Buildings referenced by a room but absent from BUILDINGS. */
export function orphanRoomBuildings() {
  const known = new Set(BUILDINGS.map((b) => b.key));
  return ROOMS
    .filter((r) => r.building && !known.has(r.building))
    .map((r) => `${r.key} -> ${r.building}`);
}

/** Buildings with no campus mapping in schema.js. */
export function unmappedBuildings() {
  return BUILDINGS.filter((b) => !campusForBuilding(b.key)).map((b) => b.key);
}
