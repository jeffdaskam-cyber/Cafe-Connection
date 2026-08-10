# Catering Companion — Seed & Migration

How to load the catering reference data (`rooms`, `buildings`) and the
historical AppSheet events into Firestore.

Source of record: **"UCAR Summit Data Sheet"** in Google Drive — the
spreadsheet backing the AppSheet app. Field mapping is in
[`DATA_MODEL.md`](./DATA_MODEL.md).

## Seeding reference data without a terminal

Buildings and rooms now live in `api/_lib/cateringReferenceData.mjs`, committed
to the repo. An administrator seeds a live project from the **Admin** tab: the *Catering
Reference Data* panel at the bottom, then **Seed buildings & rooms**. It reports
the counts written plus `orphanRooms` and `buildingsWithoutCampus` —
any warnings. Administrator-only and idempotent: document IDs are the source
sheet's room keys and every write is a merge, so re-running converges rather
than duplicating.

The panel posts `{"action":"seed-reference"}` to `/api/catering`. Note there is
no global `firebase` object on the page — the app uses the modular SDK — so a
hand-written console snippet calling `firebase.auth()` will not work.

`npm run catering:seed` does exactly the same thing from a terminal. Both share
the document builders in `api/_lib/cateringReference.mjs` so the two paths
cannot drift.

### Regenerating from a new export

Export the Rooms tab of the "UCAR Summit Data Sheet" as CSV, then rebuild the
module from `Room Key, Room Name, Building, Capacity, Seating Notes, Fixed`.
Keep the existing room keys: they are the Firestore document IDs, so changing
one orphans anything already pointing at it.

---

## 1. Export the tabs

The scripts read CSVs from `data/catering/`. Export each AppSheet tab from the
source spreadsheet (**File → Download → Comma-separated values**) and save it
under the matching filename:

| File | Source tab | Columns |
|---|---|---|
| `buildings.csv` | Buildings | `Building Key`, `Building Name` |
| `rooms.csv` | Rooms | `Room Key`, `Room Name`, `Building`, `Capacity`, `Seating Notes`, `Fixed` |
| `events.csv` | Events | all 42 — see `DATA_MODEL.md` §1 |
| `schedule_days.csv` | Daily Schedule | `Schedule ID`, `Event ID`, `Date`, `Start Time`, `End Time`, `Catering` |
| `meal_selections.csv` | Meal Selections | `Meal Selection ID`, `Schedule ID`, `Meal Period`, `Meal Start Time`, `Menu Selection`, `Location` |
| `event_rooms.csv` | Event Rooms | `Event Room ID`, `Event ID`, `Building ID`, `Room ID`, `Setup`, `Room Start Time`, `Room End Time`, `Expected Headcount`, `Is Primary Room`, `Room Notes` |

Column headers must match exactly — the transforms key off the literal AppSheet
header text. A committed `*.example.csv` sits beside each one showing the
expected shape with synthetic data.

> ⚠️ **`data/catering/*.csv` is git-ignored and must stay that way.** The Events
> export contains staff names, email addresses, and phone numbers, which do not
> belong in version control. Only the `*.example.csv` files are tracked; the
> local sandbox falls back to them when the real exports are absent.

---

## 2. Run against the sandbox

```bash
npm run catering:seed
```

That starts the Firestore emulator, seeds reference data, migrates the events,
and shuts the emulator down. To run against an emulator you already have up:

```bash
npm run emulators   # separate terminal

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seedCateringReferenceData.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrateCateringEvents.mjs
```

Seed first — the migration resolves room references against the seeded `rooms`
collection, and exits if it is empty.

Both scripts are **idempotent**: documents are keyed by the AppSheet natural key
(`Room Key`, `Building Key`, `UniqueKey`), so re-running updates in place.

### Expected output

The scripts assert the counts from the build plan's §4.4 validation pass:

```
[seed] buildings written: 9
[seed] rooms written: 44
[seed] ✅ counts match the source sheet

[migrate] events written: 10
[migrate] schedule days written: 7
[migrate] meal selections written: 4
[migrate] event rooms written: 1
[migrate] ✅ 10 events migrated (5 need review)
```

A count mismatch exits non-zero. The `needsReview` count is *reported, not
asserted* — the source is known to be dirty (see §4 below), so requiring zero
would mean failing on data problems the scripts are designed to surface.

---

## 3. Running against a real Firebase project

Both scripts refuse to write anywhere but an emulator unless you opt in:

```bash
CATERING_ALLOW_PRODUCTION_WRITE=true \
FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=... \
node scripts/seedCateringReferenceData.mjs
```

Not before Phase 5 sign-off. Deploy rules and indexes alongside it:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

---

## 4. What gets flagged, and why

The migration **never invents data**. Anything unresolvable keeps its raw value
and the document is flagged `needsReview: true` with a `reviewNotes` array, for
staff to correct in the Phase 3 console.

From the current 10-event export, 5 are flagged — all unresolved rooms. The
script names the affected events in its console output; the raw values are:

| Raw `Room` value | Why it doesn't resolve |
|---|---|
| `CG-2126` | Typo for `CG1-2126`. Plausible, but guessing risks the wrong room. |
| `2122` | Bare number recorded under Building `CG2`; the real room is `CG1-2122`, so the building is also wrong. |
| `CG1-2156` | No such room in the Rooms tab. |
| `CG1 Lobby` | Not a bookable room in the Rooms tab. |
| `Full Auditorium` | Informal name, not a Room Key. |

Room resolution tries exact match, then case-insensitive, then
building-qualified (`2122` + `CG1` → `CG1-2122`). It deliberately does **not**
fuzzy-match: assigning an event to the wrong room is worse than flagging it.

One meal selection (`934a593c`) is skipped as an orphan — its `Schedule ID`
`e3bf44f7` references a Daily Schedule row that does not exist in the source.
Orphans are reported and skipped rather than written to a fabricated parent.

Fixing any of these at the source and re-running is safe and idempotent.
