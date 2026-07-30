# Catering Companion — Delivery Status

Implements the July 27, 2026 build plan (*Catering Companion App — Detailed
Implementation Plan*), which builds on the July 22 feasibility recap.

Each phase is built and stopped for sign-off before the next one starts.
Sandbox setup and isolation are documented in [`SANDBOX.md`](./SANDBOX.md).

| Phase | Scope | Status |
|---|---|---|
| **0 — Environment** | Emulator sandbox, feature flag, `/catering` entry point, preview deploy | ✅ Complete |
| **1 — Data foundation** | Collections, security rules, indexes, seed + migration scripts | ✅ Complete |
| **2 — Requester intake** | `/catering` multi-step form, "my requests" | ✅ Complete |
| **3 — Staff console** | Catering tab, queue, confirm / edit / close | ✅ Complete |
| **4 — Reporting rollup** | Server-side `event_revenue` rollup, dashboard widget | ✅ Complete |
| **5 — Automation + UAT** | Notifications, recap PDF, cron reconciliation, UAT sign-off | ⚠️ Built — **UAT still to run** |

---

## Phase 0 — what was built

| Area | Change |
|---|---|
| Sandbox data | `firebase.json` gains an `emulators` block (Auth 9099, Firestore 8080, Storage 9199, UI 4000). `firebase-tools` added as a devDependency. `.firebaserc` gains a `sandbox` alias for the offline-only `demo-cafe-connection` project. |
| SDK wiring | `src/firebase/core.js` connects to the emulators when `VITE_USE_FIREBASE_EMULATORS=true`, supplies emulator-only fallback config so no real credentials are needed, and logs a loud sandbox warning. Non-sandbox behavior is unchanged, including the missing-config error. |
| Feature flag | `src/config/features.js` exposes `CATERING_ENABLED`, `SANDBOX_MODE`, and `DATA_TARGET_LABEL`. |
| Entry point | `src/main.jsx` picks the catering app over the Cafe Connection shell when the flag is on *and* the path is under `/catering`. The catering app is `React.lazy`-loaded, so with the flag off its chunk is never fetched. |
| Routing | `src/catering/routing.js` (pure path helpers, unit tested in `test/catering-routing.test.mjs`). `vercel.json` gains rewrites so `/catering` and `/catering/*` serve `index.html`; `/api/*` and existing routes are untouched. |
| Shell | `src/catering/CateringApp.jsx` — placeholder confirming route, flag, and data target, with a sandbox banner. Performs no Firebase reads or writes. |
| Env | `.env.sandbox` (committed, emulator placeholders only) plus a documented Catering section in `.env.example`. |

**Acceptance criteria — Phase 0**

- ✅ `/catering` loads behind the flag (`npm run dev:sandbox` → <http://localhost:5173/catering>).
- ✅ With the flag off, `/catering` falls through to the existing shell and the catering chunk is not loaded.
- ✅ No impact on production Cafe Connection: no production code path changed, no live Firebase project touched, nothing merged to `main`.

**Deviation from the plan:** the plan names the branch `feature/catering-companion`;
this work is on `claude/catering-companion-app-build-kr9ib1` per the session's
branch assignment. Isolation is otherwise identical.

---

## Phase 1 — what was built

| Area | Change |
|---|---|
| Schema | `src/catering/schema.js` — collection names, both status enums, payment methods, meal periods, building→campus map, service-field pairs, and the requester-editable allowlist. Single source of truth shared by client, scripts, and tests. |
| Roles | `permissions.js` gains `REQUESTER_ROLE` / `ALL_ROLES` / `isRequesterRole()`. `requester` is a sibling of the staff ladder: `roleAtLeast()` always returns false for it, and `canAccessPage()` / `widgetAccess()` deny it explicitly rather than by omission. `useRole.js` validates against `ALL_ROLES` so a requester is no longer silently downgraded to `user`. |
| Rules | `catering_events` + three subcollections, `rooms`, `buildings`. Requester edits are limited to an explicit field allowlist and blocked once `requestStatus` leaves draft/submitted. Revenue fields are unwritable from any client. Booked rooms are writable by the event owner and by staff (corrected 2026-07-28 — see below). `user_roles` gains a narrow self-provisioning path pinned to the literal role `'requester'`. |
| Indexes | Seven composite/collection-group indexes covering the staff queue, "my requests", the daily schedule view, the cron sweep, and cross-event meal lookups. |
| Scripts | `seedCateringReferenceData.mjs`, `migrateCateringEvents.mjs`, and shared libs (`cateringTransforms.mjs`, `csv.mjs`, `cateringAdmin.mjs`). Both refuse to write to a live project unless explicitly opted in. |
| Tests | 35 pure transform/CSV/routing tests under `npm test`; rules tests under `npm run test:rules`. |

**Acceptance criteria — Phase 1**

- ✅ Rules unit tests pass (28/28 after the 2026-07-28 room correction): a
  requester cannot read others' events, cannot write revenue fields, cannot
  advance status, cannot touch another requester's records, and cannot
  self-provision as staff.
- ✅ Seeded counts match the source: **44 rooms, 9 buildings**.
- ✅ Migrated event count matches the source: **10 events** (5 flagged
  `needsReview`, 1 orphan meal selection skipped — see
  [`SEED_AND_MIGRATION.md`](./SEED_AND_MIGRATION.md) §4).
- ✅ Firestore rules runtime confirmed working in the container (the open risk
  carried over from Phase 0).

**Note on source data.** `data/catering/*.csv` is git-ignored — the Events
export carries staff names, emails, and phone numbers, and this is a public
repository. Committed `*.example.csv` files document the format with synthetic
data.

**Deliberately not fixed:** the pre-existing `userRole()` helper in
`firestore.rules` still reads from `/users` and so always returns `''`. The
catering rules use their own `user_roles`-based helpers and are unaffected.
Correcting `userRole()` changes live production permissions on `event_revenue`
and should be a separate, deliberate change.

---

## Phase 2 — what was built

| Area | Change |
|---|---|
| Form model | `src/catering/formState.js` — step definitions, empty state, per-step validation, Firestore mapping, and draft persistence. Pure, so the whole model is unit tested without React. |
| Intake form | `src/catering/IntakeForm.jsx` — six steps (basics → schedule → meals → rooms → logistics → review) with repeatable schedule days, meals nested per day, booked rooms, inline validation, and an editable review summary. |
| My requests | `src/catering/MyRequests.jsx` — live list scoped to `createdBy == uid`, expandable detail showing schedule, meals, booked rooms, services, and payment. |
| Shell | `CateringApp.jsx` wraps the module in `AuthProvider selfProvisionRole="requester"` and switches between the list and the form. |
| Auth | `AuthProvider` gains a `selfProvisionRole` prop: an `@ucar.edu` user with no role document and no invite is provisioned as `requester` instead of being signed out. `LoginPage` gains `productName` / `tagline` / `description` props so both entry points share one sign-in implementation. |
| Data | `src/catering/data.js` — reference-data reads, request submission (parent then batched children), the live "my requests" subscription, and detail reads. |

**Acceptance criteria — Phase 2**

- ✅ A test `@ucar.edu` account signs in, is self-provisioned as `requester`,
  submits a full event (2 schedule days, 2 meals, a booked room, split
  payment), and sees it in "my requests" — verified end to end in a real
  browser against the emulator suite.
- ✅ Submitted detail round-trips: booked room with its setup and times,
  security and access notes, both project IDs, payment notes, and per-day meals
  all persist and render.
- ✅ An unfinished request survives a page refresh and reopens itself;
  cancelling discards it.

**Note on the E2E harness.** This container's proxy blocks
`accounts.google.com`, so the Google sign-in button cannot complete here. The
acceptance run signs in through the Auth emulator instead; everything
downstream — `onAuthStateChanged`, self-provisioning, and all rules-enforced
reads and writes — runs exactly as in the browser. **The Google sign-in path
itself still needs manual confirmation during Phase 5 UAT.**

### Correction: rooms are bookings, not requests

The build plan modelled room assignment as a staff action, with
`catering_event_rooms` writable only by manager-and-above. **That was wrong
about how rooms actually work at UCAR.** Rooms are reserved through a separate
room-calendar system, and the catering form is filled in only after that
reservation is secured — so the room a requester enters is already booked, and
the requester is the one who knows it.

Corrected on 2026-07-28:

- `catering_event_rooms` is now readable and writable by the event owner **and**
  by manager-and-above.
- The form gained a dedicated **Rooms** step: one or more booked rooms, each
  with building, room, setup style, start/end times, headcount, and notes, with
  one marked primary. At least one booked room is required.
- `buildingId` / `primaryRoomId` / `roomIds[]` on the event are now derived from
  those bookings as a query denormalization; the subcollection is authoritative.
- "Requested room" and "Not yet assigned" are gone from the UI — the model has
  no pending-assignment state.

### Two bugs this phase surfaced

1. **`plannerEmail` was missing from the requester allowlist** (Phase 1
   oversight). Creating a request would have worked, but every later edit would
   have been rejected. Caught by the test asserting `toEventDoc()` only emits
   allowlisted fields. Added to both `schema.js` and `firestore.rules`.

2. **`AuthContext`'s UID-migration lookup aborted sign-in.** It runs a `list`
   query on `user_roles`, which the rules only permit for administrators. The
   denial threw inside the shared `try`, so the handler fell to its catch and
   signed the user out with "We couldn't verify your account" — before ever
   reaching the pending-invite or self-provisioning paths. This is pre-existing
   and affects any first-time sign-in, not just catering. Fixed by scoping that
   lookup in its own try/catch and treating a denial as "no match to migrate",
   which needed no rule change. **Worth verifying against production invite
   activation** — the same path runs there.

---

## Phase 3 — what was built

| Area | Change |
|---|---|
| Tab | `App.jsx` gains a **Catering** tab, gated by `canAccessPage(role, "catering")` (manager and above) *and* by `CATERING_ENABLED`, and lazy-loaded so it stays out of the main bundle while the flag is off. |
| Console | `staff/CateringConsole.jsx` — two views (request queue, daily schedule) plus the event detail drill-in. Denies access itself as well as relying on the rules. |
| Queue | `staff/RequestQueue.jsx` — summary chips, filters for status / lifecycle / building / date range / free-text search, and a sortable table. |
| Event detail | `staff/EventDetail.jsx` — confirm, close, reopen, cancel; edit any event field including actual attendance and internal staff notes; correct booked rooms; clear a migration review flag. |
| Daily schedule | `staff/DailySchedule.jsx` — cross-event view by day via a collection-group query, with per-meal-period event and headcount totals. |
| Data | `staffData.js` (status transitions with history, field edits, room edits, collection-group range query) and `staffFilters.js` (pure filtering, sorting, grouping, totals). |

**Acceptance criteria — Phase 3**

- ✅ A manager-role test account confirmed, edited (actual attendance + staff
  notes), and closed a test event — verified end to end in a real browser.
- ✅ A requester cannot perform those actions: no Catering tab, staff console
  unreachable, and the rules reject every staff-only write (36/36 rules tests).
- ✅ Internal staff notes are not visible to the requester.
- ✅ The cross-event daily schedule renders with meal-period totals.

### Three bugs this phase surfaced

1. **The daily schedule would not have worked in production.** A
   collection-group query is matched by collection ID only — the nested rule
   under `/catering_events/{eventId}` does **not** apply. The query was denied
   even for managers. Fixed with an explicit
   `match /{path=**}/catering_schedule_days/{dayId}` rule granting read to
   manager-and-above; requesters still reach their own days only through the
   nested path. The Phase 1 index was necessary but not sufficient.

2. **The header's decorative wave overlay swallowed tab clicks.** Its wrapper
   `<div>` had no `pointer-events: none` (only the inner SVG did), so it
   intercepted clicks on any tab it overlapped. Adding a seventh tab made this
   reachable; it was latent before and would already have affected narrow
   windows. One-line fix in `App.jsx`.

3. **`Field` produced nested labels for checkbox groups.** The component wraps
   children in a `<label>`; the catering-services checkboxes are themselves
   labelled inputs. Nested labels are invalid HTML and make the browser
   associate the outer label with the first inner input — selecting "Lunch"
   actually toggled "Breakfast". `Field` now takes a `group` prop rendering
   `<fieldset>`/`<legend>` instead. This was a live data-entry bug, not just a
   test artifact.

---

## Phase 4 — what was built

| Area | Change |
|---|---|
| Rollup endpoint | The only writer of catering rows in `event_revenue`. Verifies a manager-and-above caller against `user_roles`, then writes, skips, or removes. (Now the `rollup` action of `api/catering.mjs` — see the consolidation note below.) |
| Mapping | `api/_lib/cateringRevenue.mjs` — pure, unit-tested: payment method → type, building → campus (resolved server-side, never trusting the client-writable `campus`), actual-over-estimate amount, start date → month. |
| Revenue entry | Staff enter estimated and actual amounts in the event detail view. The console triggers the rollup after any confirm, close, cancel, or revenue edit, and shows what happened. |
| Dashboard widget | `CateringWidget` reads `catering_events` directly (the plan's §5.1 "live widget read"), showing awaiting-decision count, upcoming events, guests, and revenue. |
| Event Revenue view | Catering rows are tagged `source: "catering"` and excluded by default, with an "Include catering (n)" toggle. |
| Dev serverless | A dev-only Vite middleware serves `/api/catering` so the rollup is testable locally; sandbox mode wires the Firestore, Auth, and Storage emulator hosts automatically. Scoped to the catering route — the rest of `api/` still 404s in dev, as before. |

**Decisions taken (2026-07-28)**

- **Double counting.** The uploaded Internal/External spreadsheets already
  include catering, and `EventRevenuePage` sums every document in
  `event_revenue`. Catering rows are therefore tagged and hidden by default;
  flip the toggle's default once catering leaves the uploads.
- **Split payments.** One entry per event, with every project ID recorded.
  `event_revenue` has no project dimension, so allocation stays finance-side.
- **Revenue source.** Staff enter the amounts; nothing else in the system knows
  them (there is no price list anywhere in the repo).

**Acceptance criteria — Phase 4**

- ✅ Confirming an event with `paymentMethod: project_id` produces a
  correctly-typed (`internal`) entry with campus resolved from the building,
  the right `monthKey`, and both project IDs recorded.
- ✅ Non-duplicated: the document ID is derived from the event ID, so
  re-saving updates in place. Verified by re-saving with an actual amount —
  still exactly one row, estimate replaced.
- ✅ Visible in the existing Event Revenue view via the toggle, and excluded
  from its totals by default.
- ✅ Cancelling an event withdraws its revenue row.
- ✅ A confirmed event with no amount yet is skipped with an explanation
  rather than written as zero.

### Design notes

- **Idempotency by construction.** The deliberate contrast with the
  spreadsheet importer, which uses an accumulating transaction because each
  upload carries new totals. A deterministic ID means no duplicate is possible,
  which is stronger than the plan's §5.3 "check then update".
- **Campus is re-derived server-side.** The event's `campus` field is
  requester-writable, so the rollup maps it from `buildingId` and refuses to
  write when it cannot.

### Known gap

`FIREBASE_AUTH_EMULATOR_HOST` had to be set for the Admin SDK to verify
emulator-issued tokens; without it every call was a 401. Worth remembering for
Phase 5's notification endpoints, which will hit the same wall.

---

## Phase 5 — what was built

| Area | Change |
|---|---|
| Notifications | `_lib/cateringNotify.mjs`. All four plan types (created / updated / confirmed / closed), recipient rules, plain-text templates, and Gmail RFC-2822 encoding. |
| Recap PDF | `_lib/cateringRecap.mjs`. Built only from the event's own stored fields, rendered with `jspdf`, stored at a deterministic path, URL saved on the event. |
| Cron reconciliation | `_lib/cateringReconcile.mjs`, wired to a nightly cron (08:00 UTC). Sweeps for un-notified states, missing revenue rows, and missing recaps. |
| Console | Confirm and close now fire the notification (and, on close, the recap) alongside the revenue rollup, each reporting what happened. |
| Config | `storage.rules` gains `catering_recaps/`; `.env.example` documents the five new vars; `vercel.json` gains the cron and function timeouts. |

### The email transport is deliberately switchable

Sending needs the service mailbox to hold the `gmail.send` OAuth scope, which is
**still outstanding**. Rather than block, the transport is chosen at call time:

- `gmail` — credentials present **and** `CATERING_EMAIL_ENABLED=true`
- `log` — otherwise: the fully-rendered message is logged, nothing is sent

The log path runs the identical code, so recipients, templates, and the
`lastNotified*` bookkeeping are all exercised today. Flipping one env var is the
only change needed once the scope lands. The console says so plainly rather than
implying an email went out.

**Acceptance criteria — Phase 5**

- ✅ All four notification types fire with the correct recipients: created →
  planner (+ ops cc), updated → planner, confirmed and closed → planner and
  on-site contact.
- ✅ Re-notifying an already-notified state is a no-op; `lastNotifiedStatus`
  records both status axes.
- ✅ Recap PDF matches the source data — verified by asserting the generated
  document contains each source value (event, dates, contacts, room, setup,
  menu, service notes, project IDs, payment notes, actual revenue, actual
  attendance).
- ✅ Regenerating a recap overwrites in place.
- ✅ The nightly sweep recovers a missed notification and a missing revenue row,
  reports what it did, and finds nothing on a second run.
- ✅ The cron endpoint rejects unauthenticated calls.
- ⚠️ **UAT with 2–3 real planners has NOT been run** — see [`UAT.md`](./UAT.md).

### Three bugs this phase surfaced

1. **The nightly sweep could not roll up revenue.** It authenticates with
   `CRON_SECRET`, but `catering-revenue-rollup` had its own `verifyStaff()` that
   only accepted staff ID tokens, so every sweep attempt returned "Invalid
   token". Now uses the shared `verifyStaffOrCron`.

2. **The recap endpoint had no storage bucket.** `catering-revenue-rollup`
   carried a duplicate inline Admin SDK bootstrap without one, and
   `firebase-admin` keeps a single default app per process — so whichever
   endpoint loaded first decided whether Storage worked at all. All catering
   endpoints now share one bootstrap.

3. **The sweep never looked like it converged.** It counted no-ops and skips as
   work done. It now counts only real outcomes and reports `skipped` separately,
   which is what surfaced a test event with no planner email instead of silently
   retrying it nightly.

---

## Post-Phase-5 — endpoint consolidation (2026-07-28)

The host caps serverless functions per deployment, and Cafe Connection already
sat exactly at that cap with 12. Adding catering's four took it to 16, so every
deployment from Phase 4 onward failed — the build succeeded and then died at
"Deploying outputs" with nothing in the log.

Consolidated back to 12 with no loss of behavior:

| Before | After |
|---|---|
| `catering-revenue-rollup`, `catering-notify`, `catering-recap`, `catering-cron-reconcile` | **`api/catering.mjs`** — one endpoint routing on `action` |
| `generate-invite-link`, `delete-invite` | **`api/invites.mjs`** — one endpoint routing on HTTP method |

`12 − 2 + 1 + 1 = 12`.

The catering endpoint takes `{ action, ... }` on POST, and the cron calls it as
`GET /api/catering?action=reconcile`. The invite endpoint is `POST` to create
and `DELETE` to remove; the two former files were byte-for-byte identical apart
from method and body.

**This also removed a wart.** The nightly sweep used to invoke the other three
endpoints over HTTP against its own origin — extra cold starts, an extra auth
round trip per event, and an origin guessed from request headers. Now it calls
them in process. That is simpler here and is the shape it wants on any host,
so the Azure rebuild inherits the better design rather than the workaround.

Re-verified after consolidation: all three browser suites (Phase 2 intake,
Phase 3 staff console, Phase 4 revenue) and the Phase 5 automation suite pass
unchanged, including the cron invoked as a GET with a query string.

> **Azure note.** This consolidation is scaffolding for the current host's
> limit, not a design constraint Azure shares. Azure Functions has no
> comparable per-deployment cap, so the actions could be split back into
> separate functions there if that reads better — but the in-process
> reconciliation should stay either way.

---

## Findings from reconciling the plan against the live repo

The plan asks that its schema and rules be treated as proposals and reconciled
against the actual repo. These are the mismatches found so far. None block
Phase 0; **items 1–3 need decisions before Phase 1 rules are written.**

### 1. Roles live in `user_roles/{uid}`, not `users/{uid}`

The plan's §2.6 says to reuse the existing user/role document pattern. The
authoritative store is `user_roles/{uid}.role` — written by
`api/update-user-role.mjs`, `AdminPage.jsx`, and `AuthContext.jsx`, and read by
`useRole.js`. `users/{uid}` holds profile data only (uid, email, displayName,
lastLoginAt) and **never** carries a `role` field.

Consequence for the existing rules: the `userRole()` helper in
`firestore.rules` reads `role` from `/users/$(uid)`, so it always evaluates to
`''`. That makes `isAdmin()` permanently false and blocks all *client-side*
`event_revenue` writes, which currently only succeed via the Admin SDK. This is
pre-existing and outside the catering scope, but it lands directly on Phase 4's
rollup path — the rollup should be server-side (Admin SDK) as the plan already
specifies, and catering rules should use the `user_roles`-based
`isManagerOrAbove()` helper rather than `userRole()`. **Flagging rather than
fixing: correcting `userRole()` changes existing production permissions and
should be a separate, deliberate change.**

### 2. `useRole.js` silently downgrades unknown roles to `user`

`useRole.js` does `ROLES.includes(raw) ? raw : "user"`. If a `requester` role
doc were created today, that requester would be treated as a Cafe Connection
`user` — which grants dashboard and Weekly Ops access. That is exactly the
outcome §2.6 of the plan warns against. Phase 1 must add `requester` as a
sibling value that is recognized but explicitly *not* on the
`user → manager → senior_leader → administrator` ladder, and `roleAtLeast()`
must not place it on that ladder either (`ROLE_ORDER.indexOf("requester")`
returning `-1` needs handling, not accident).

### 3. First sign-in for a requester currently fails

`AuthContext.jsx` signs out any authenticated user who has neither a
`user_roles` doc nor a matching `pending_invites` doc. The plan's §6.1 expects
any `@ucar.edu` user to land on `/catering` and be provisioned as `requester`
on first sign-in. That needs both an `AuthContext` change (self-provision when
arriving via the catering entry point) and a new `user_roles` create rule
permitting self-creation *only* with `role == 'requester'`. Phase 2 work, but
the rule belongs in Phase 1.

### 4. No router dependency

The app has no `react-router`; `App.jsx` switches tabs by state. Phase 0 keeps
it that way — the entry point is chosen from `window.location.pathname` and
`vercel.json` rewrites make the path resolve on the static host. Phase 2's
multi-step form will need a decision: in-component step state (no dependency,
no deep links) versus adding a router. Recommendation is step state plus
`history.pushState` for shareable step URLs, avoiding the new dependency.

### 5. Rules unit tests need a new devDependency

`@firebase/rules-unit-testing` is not installed. Phase 1 adds it alongside the
existing `node --test` runner; the emulator suite from Phase 0 is the host.

### 6. The proposed schema in §2.1 is materially incomplete

The AppSheet source was located and reconciled — see
[`DATA_MODEL.md`](./DATA_MODEL.md) for the full 42-column mapping. Summary of
what changed versus the plan:

- **~14 real fields have no home in §2.1**, most conspicuously `Event Name`.
- **Security / Custodial / Access-Doors / Sustainability are free text**, not
  booleans. Modeled as `*Notes` string + derived `needs*` boolean.
- **`Request Status` and `Status` are orthogonal axes**, not one enum.
  Modeled as `requestStatus` + `lifecycleStatus`.
- **`Project ID` is multi-valued** (`projectIds[]`), with split-payment cases
  that Phase 4's revenue rollup must decide how to attribute.
- **Buildings carry no campus**, which Phase 4's `event_revenue` write requires.
  The seed script adds the mapping.
- The Rooms source column is `Fixed`; the plan's field is `isFlexible` —
  inverted, so seeded as `isFixed`.
- Child tables (Daily Schedule, Meal Selections, Event Rooms) match the plan
  closely, except `Coffee Break` is a real meal period missing from the enum.

---

## Open items for Jeff (not code)

Carried from §10 of the plan, plus what Phase 0 surfaced.

**Resolved 2026-07-27:**

- ~~Literal 42-column AppSheet Events list~~ — located in Drive
  ("UCAR Summit Data Sheet") and reconciled in `DATA_MODEL.md`. Rooms (44),
  Buildings (9), and the 10 historical events came with it, so the Phase 1 seed
  and migration inputs are all in hand.
- ~~Historical migration vs archive-only~~ — **migrate all 10** as
  `lifecycleStatus: 'closed'` with `migratedFromAppSheet: true`; unresolvable
  room references keep their raw value plus `needsReview: true`.
- ~~Free-text vs boolean service fields~~ — **both**: verbatim text plus a
  derived boolean.
- ~~One status enum vs two~~ — **two axes**.

**Still open:**

1. **Gmail `gmail.send` re-consent** for the service mailbox — start now, it
   blocks Phase 5 notifications. (Repo state is consistent with read-only: the
   only Gmail env vars are `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` /
   `GMAIL_REFRESH_TOKEN`, used by `api/ingest-email-orders.mjs`, which reads.)
2. **Full picklist values** for AppSheet's `Request Status` and `Status`
   columns. Only `Confirmed` / `Open` / `Closed` appear in the 10 sample rows;
   the enums in `DATA_MODEL.md` §3 are otherwise inferred. Adding a value later
   is cheap, renaming one is not.
3. **Catering ops inbox address** for the "created" notification copy.
4. **Split-payment revenue attribution** (Phase 4) — for events with multiple
   `projectIds`, split revenue proportionally, attribute to a primary project,
   or write one combined `event_revenue` entry?
5. **Dev Firebase project** — Phase 0 uses local emulators, which covers
   development and testing. A shared Vercel preview that exercises real
   Firestore (useful for Phase 2–3 UAT rehearsal) needs a second Firebase
   project with preview-scoped `VITE_FIREBASE_*` variables. Decide whether that
   is wanted, or whether local emulators plus Phase 5 UAT on production-after-
   sign-off is sufficient.
