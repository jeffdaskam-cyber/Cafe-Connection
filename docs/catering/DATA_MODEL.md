# Catering Companion — Data Model Reconciliation

Reconciles §2.1 of the build plan (a *proposed* schema) against the actual
AppSheet source: **"UCAR Summit Data Sheet"** (Google Drive, modified
2026-07-22), the spreadsheet backing the AppSheet app.

Source counts confirm this is the right sheet — they match the plan's §4
validation targets exactly:

| Table | Rows / columns | Plan's expectation |
|---|---|---|
| Events | 42 columns, 10 rows | "42 columns", "~10 existing rows" ✅ |
| Rooms | 44 rows | 44 ✅ |
| Buildings | 9 rows | 9 ✅ |
| Daily Schedule | 7 rows | — |
| Meal Selections | 5 rows | — |
| Event Rooms | 1 row | — |
| Users | `UserEmail`, `Name`, `LCPO`, `CreatedDate` | confirms `lcpo` (§2) ✅ |

Decisions recorded here were made by Jeff on 2026-07-27 and supersede the
plan where they conflict.

---

## 1. Events — all 42 columns mapped

Two columns are **not data**: `Logistics Header` and `Financials Header` are
AppSheet UI section dividers. 40 real fields remain.

| # | AppSheet column | Firestore field | Type | Notes |
|---|---|---|---|---|
| 1 | UniqueKey | `legacyKey` | string | AppSheet row key; traceability during transition |
| 2 | Event ID | `legacyEventId` | string | Unreliable — blank, `90012xxx` placeholder, and a duplicate `12345678` all present. Not a key. |
| 3 | Event Name | `eventName` | string | **Missing from the plan entirely** |
| 4 | Submission Date | `submittedAt` | timestamp | |
| 5 | Request Status | `requestStatus` | enum | See §3 |
| 6 | Event Start Date | `startDate` | date | |
| 7 | Event End Date | `endDate` | date | |
| 8 | Event Start Time | `startTime` | string | |
| 9 | Organization | `organization` | string | plan's `department` |
| 10 | Lab/Program | `lcpo` | string | matches Users table `LCPO` |
| 11 | Event Planner Name | `plannerName` | string | |
| 12 | Event Planner Email | `plannerEmail` | string | |
| 13 | Event Planner Phone | `plannerPhone` | string | |
| 14 | On-site Contact Name | `onsiteContactName` | string | **missing from plan** |
| 15 | On-site Contact Email | `onsiteContactEmail` | string | **missing from plan** |
| 16 | On-site Contact Phone | `onsiteContactPhone` | string | **missing from plan** |
| 17 | Secondary Contact | `secondaryContactName` | string | **missing from plan** |
| 18 | Secondary Contact Phone | `secondaryContactPhone` | string | **missing from plan** |
| 19 | Secondary Contact Email | `secondaryContactEmail` | string | **missing from plan** |
| 20 | *Logistics Header* | — | — | UI divider, not modeled |
| 21 | Building | `buildingId` | string | natural key, e.g. `CG1` |
| 22 | Room | `primaryRoomId` | string | natural key; see §5 on data quality |
| 23 | Attendance | `expectedAttendance` | number | |
| 24 | Catering | `needsCatering` | bool | genuinely Yes/No |
| 25 | Delivery Method | `deliveryMethod` | string | **missing from plan** |
| 26 | Lunch on Own/Count & Call | `lunchOnOwnCount` | string | **missing from plan** |
| 27 | Setup | `setupNotes` | string | **missing from plan** |
| 28 | Airwall Closure Timeline | `airwallClosureTimeline` | string | **missing from plan** |
| 29 | Alcohol | `needsAlcohol` | bool | genuinely Yes/No |
| 30 | Agenda Type | `agendaType` | string | `Link` observed |
| 31 | Agenda Link | `agendaLink` | string | **missing from plan** |
| 32 | Agenda File | `agendaFileUrl` | string | **missing from plan** |
| 33 | Special Requests | `specialRequests` | string | **missing from plan** |
| 34 | Security | `securityNotes` + `needsSecurity` | string + bool | See §2 |
| 35 | Access/Doors | `accessDoorsNotes` + `needsAccessDoors` | string + bool | See §2 |
| 36 | Custodial | `custodialNotes` + `needsCustodial` | string + bool | See §2 |
| 37 | Sustainability | `sustainabilityNotes` + `needsSustainability` | string + bool | See §2 |
| 38 | *Financials Header* | — | — | UI divider, not modeled |
| 39 | Payment Method | `paymentMethod` | enum | `Project ID` → `project_id`; `ACH (External)` → `ach_external`. Confirms plan §2.1. |
| 40 | Project ID | `projectIds[]` | string[] | **Multi-valued** — see §4 |
| 40a | Split allocation | `projectAllocations[]` | `{projectId, unit, amount}[]` | Present only when >1 project ID — see §4 |
| 41 | Payment Notes | `paymentNotes` | string | **missing from plan**; e.g. "Split payment 50/50" |
| 42 | Status | `lifecycleStatus` | enum | See §3 |

Plus audit fields not in AppSheet, per plan §2.1: `createdAt`, `createdBy`,
`updatedAt`, and the notification/recap fields (`lastNotifiedStatus`,
`lastNotifiedAt`, `recapUrl`, `recapGeneratedAt`).

---

## 2. Service fields — text plus derived boolean

**Decision: store both.** The plan modeled `needsSecurity` / `needsCustodial`
as booleans. In the source these are free text carrying the actual operational
instructions:

- Security: *"Security required at this event from 8 am to 5 pm. Cost is $45/hr"*
- Custodial: *"Check trash cans twice a day"*
- Access/Doors: *"East doors open from 8am - 5pm on 7/22 and 8am to 12pm on 7/23"*

Booleans alone would reduce all of that to `true`. Each of the four service
fields therefore gets a `*Notes` string (verbatim) plus a derived `needs*`
boolean for filtering and conditional form sections. The boolean is derived on
write, never authored independently — the text is the source of truth.

`Sustainability` is inconsistent in the source (`Yes`, `ddd`), which is exactly
why the raw text is preserved rather than coerced.

---

## 3. Two status axes, not one

**Decision: keep both.** The plan states AppSheet's `Request Status` and
`Status` "collapse into one enum". They are orthogonal in the data — all 10
rows are `Request Status: Confirmed`, while `Status` is `Open` (4) or
`Closed` (6). Approval state and lifecycle state are different questions.

- `requestStatus`: `draft` | `submitted` | `confirmed` | `cancelled`
- `lifecycleStatus`: `open` | `closed`

Each carries its own history array (`{status, changedBy, changedAt}`).

> **Open item:** only `Confirmed` / `Open` / `Closed` appear in the 10 sample
> rows. The full AppSheet picklist for both columns still needs confirming
> before the enums are frozen — the values above are inferred from the plan's
> intended workflow plus observed data. Composite indexes and notification
> triggers key off these, so a late addition is cheap but a rename is not.

---

## 4. Project IDs are multi-valued

Source: `"PRJ000565231 , PRJ00054123"` with `Payment Notes: "Split payment 50/50"`.

The plan's `projectId` (single, nullable) cannot represent this. Modeled as
`projectIds[]` (one entry per project ID the planner adds) plus free-text
`paymentNotes`.

When a planner charges more than one project, the intake form also records a
structured split in `projectAllocations[]`: one `{ projectId, unit, amount }`
per project, where `unit` is a single shared `"%"` or `"$"` for the whole split.
Percentage splits are validated to total 100% at intake; dollar splits are
captured as entered (the event total is not known then). A single-project event
records no allocation. `projectAllocations` is the planner's stated intent, not
revenue — it is on the requester allowlist but carries no financial authority.

**Revenue attribution lands on Phase 4.** The `event_revenue` rollup attributes
revenue to an event; a split-payment event has no single project to attribute
to. The rollup will need an explicit rule — proportional split,
primary-project-only, or a single rolled-up entry — and that decision is best
made when Phase 4 starts, now with `projectAllocations` available alongside the
free-text `paymentNotes`.

---

## 5. Rooms, Buildings, and the campus gap

`Rooms` columns: `Room Key`, `Room Name`, `Building`, `Capacity`,
`Seating Notes`, `Fixed`.

> ⚠️ The source column is **`Fixed`**, the plan's field is **`isFlexible`** —
> they are inverted. Seed as `isFixed` to match the source and avoid a silent
> polarity bug.

`Buildings` columns: `Building Key`, `Building Name` — 9 rows: ML, CG1, CG2,
FL0, FL1, FL2, FL3, FL4, FLA.

**Campus gap (not in the plan).** Buildings carry no campus. Phase 4's rollup
writes `event_revenue`, and the existing `firestore.rules` require
`campus in ['Mesa Lab', 'Foothills', 'Center Green']`. The seed script must
add:

| Building keys | Campus |
|---|---|
| `ML` | Mesa Lab |
| `CG1`, `CG2` | Center Green |
| `FL0`, `FL1`, `FL2`, `FL3`, `FL4`, `FLA` | Foothills |

Room and building keys are human-readable natural keys
(`CG1-1210-South-Auditorium`, `CG1`), so they serve as both document ID and the
plan's `legacyId` — those collapse into one field.

---

## 6. Child tables — the plan got these right

| AppSheet table | Columns | Plan mapping |
|---|---|---|
| Daily Schedule | `Schedule ID`, `Event ID`, `Date`, `Start Time`, `End Time`, `Catering` | `catering_schedule_days` ✅ — `Catering` is multi-valued (`"Coffee Break , Lunch , Reception"`) → `cateringServicesNeeded[]` ✅ |

> **`cateringServicesNeeded` is derived, not entered.** As of the conditional
> Meals step, the intake form no longer has a per-day meal-period picker. The
> Schedule step carries a single event-level **Catering services needed? Yes/No**
> (`needsCatering`), which gates whether the Meals step appears. On save,
> `cateringServicesNeeded[]` is derived from the meal periods the planner
> actually enters on the Meals step (`dayMealPeriods` in `formState.js`), so it
> stays denormalized onto each schedule-day document for the staff console's
> meal-period filter, the daily schedule, and the recap — none of which had to
> change. When catering is No, a day carries no meals and an empty
> `cateringServicesNeeded[]`. The legacy `Catering` column above still feeds the
> field on import via `scripts/migrateCateringEvents.mjs`.
| Meal Selections | `Meal Selection ID`, `Schedule ID`, `Meal Period`, `Meal Start Time`, `Menu Selection`, `Location` | `catering_meal_selections` ✅ — keyed by `Schedule ID`, confirming the plan's nesting under schedule day ✅ |
| Event Rooms | `Event Room ID`, `Event ID`, `Building ID`, `Room ID`, `Setup`, `Room Start Time`, `Room End Time`, `Expected Headcount`, `Is Primary Room`, `Room Notes` | `catering_event_rooms` ✅ — near-exact match, plus `Room Notes` |

> **Rooms are bookings, not requests.** Corrected 2026-07-28. The build plan's
> §3 made `catering_event_rooms` staff-write-only, describing room assignment as
> "a staff action". That does not match the actual workflow: rooms are reserved
> in a **separate room-calendar system**, and the catering form is filled in
> *after* that reservation is secured. A room recorded here is therefore an
> existing booking, and the requester is the one who knows it.
>
> Consequences, all implemented:
> - `catering_event_rooms` is readable and writable by the event owner **and**
>   by manager-and-above. Neither party "approves" the other's room.
> - The intake form has a dedicated **Rooms** step where the requester records
>   one or more booked rooms, each with its own setup, times, headcount, and
>   notes, with one marked primary.
> - `buildingId`, `primaryRoomId`, and `roomIds[]` on the event are a
>   denormalization of that subcollection for list queries. The subcollection is
>   authoritative.
>
> There is no "pending room assignment" state anywhere in the model.

Observed meal periods: `Breakfast`, `Coffee Break`, `Lunch` — note **`Coffee
Break`** is a real period not listed in the plan's
`breakfast | lunch | dinner | reception | custom` enum.

---

## 7. Source data quality — migration cannot be 1:1

**Decision: migrate all 10, flag what doesn't resolve.** Events import as
`lifecycleStatus: 'closed'` with `migratedFromAppSheet: true`. Anything
unresolvable keeps its raw value plus `needsReview: true` — nothing is invented,
and staff can correct it in the console (Phase 3).

Known defects in the 10 rows:

| Issue | Detail |
|---|---|
| Room refs don't resolve | `CG-2126` (should be `CG1-2126`), bare `2122`, `CG1-2156` (absent from Rooms), `Full Auditorium`, `CG1 Lobby` |
| Building/room mismatch | One event: Building `CG2`, Room `CG1-2156` |
| Orphan meal selection | `Schedule ID e3bf44f7` references a non-existent Daily Schedule row |
| Event ID unusable | Blank, literal `90012xxx`, and duplicate `12345678` |
| Inconsistent times | `8:00:00` vs `8:00 AM` in the same column |
| Sparse Event Rooms | Only 1 row for 10 events; `Is Primary Room` blank |

Roughly 4 of 10 events have room references needing review. The Phase 1
validation pass should therefore assert **10 migrated events, 44 rooms, 9
buildings**, and report the `needsReview` count rather than requiring zero.
