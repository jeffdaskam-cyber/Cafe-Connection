# Catering Companion — Delivery Status

Implements the July 27, 2026 build plan (*Catering Companion App — Detailed
Implementation Plan*), which builds on the July 22 feasibility recap.

Each phase is built and stopped for sign-off before the next one starts.
Sandbox setup and isolation are documented in [`SANDBOX.md`](./SANDBOX.md).

| Phase | Scope | Status |
|---|---|---|
| **0 — Environment** | Emulator sandbox, feature flag, `/catering` entry point, preview deploy | ✅ Complete — awaiting sign-off |
| **1 — Data foundation** | Collections, security rules, indexes, seed + migration scripts | ⏸ Not started |
| **2 — Requester intake** | `/catering` multi-step form, "my requests" | ⏸ Not started |
| **3 — Staff console** | Catering tab, queue, confirm / assign / close | ⏸ Not started |
| **4 — Reporting rollup** | Server-side `event_revenue` rollup, dashboard widget | ⏸ Not started |
| **5 — Automation + UAT** | Notifications, recap PDF, cron reconciliation, UAT sign-off | ⏸ Not started |

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
