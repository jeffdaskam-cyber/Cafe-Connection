# Catering Companion — Sandbox Environment

The Catering Companion is built in a sandbox so that no development work can
reach the live Cafe Connection Firebase project or database. This document
covers how the sandbox is wired and how to run it.

Related: [`PHASES.md`](./PHASES.md) for delivery status and open decisions.

---

## 1. Isolation model

Four independent layers keep this work away from production:

| Layer | Mechanism |
|---|---|
| **Branch** | All work lands on `claude/catering-companion-app-build-kr9ib1`, never on `main`. |
| **Data** | The Firebase Emulator Suite runs locally under project ID `demo-cafe-connection`. The `demo-` prefix is recognized by the emulators as offline-only, so the SDK cannot reach a live project even if real credentials were present. |
| **Deploy** | Vercel builds the branch as a preview deployment. Production environment variables are untouched. |
| **Feature flag** | `VITE_CATERING_ENABLED` gates the module. With the flag off, the catering chunk is never fetched and `/catering` falls through to the normal Cafe Connection shell — the module can ship to production dark and be switched on deliberately. |

The flag and the sandbox flag are independent: `VITE_CATERING_ENABLED=true`
with `VITE_USE_FIREBASE_EMULATORS` unset would point the catering app at a real
project. That combination is intended only for the eventual production cutover.

---

## 2. Running the sandbox locally

Requires Node 22+ and a JRE (the Firestore and Storage emulators are Java).

```bash
npm ci                 # installs firebase-tools as a devDependency

# Terminal 1 — emulators (Auth 9099, Firestore 8080, Storage 9199, UI 4000)
npm run emulators

# Terminal 2 — Vite against the emulators
npm run dev:sandbox
```

Then open <http://localhost:5173/catering>. You should see the Catering
Companion shell with an orange **SANDBOX** banner across the top and a
`[firebase] SANDBOX MODE` warning in the browser console. The emulator UI is at
<http://localhost:4000>.

`npm run dev:sandbox` runs Vite in `--mode sandbox`, which loads the committed
[`.env.sandbox`](../../.env.sandbox). Every value in that file is an emulator
placeholder — it contains no secrets and is safe in version control. Your own
`.env.local` (real project credentials) is not read in sandbox mode.

Plain `npm run dev` is unchanged: it uses `.env.local` and, with
`VITE_CATERING_ENABLED` unset there, behaves exactly as it did before.

### Serverless functions in the sandbox

A dev-only Vite middleware serves the Catering Companion's endpoint —
`/api/catering` — from the dev server, so the rollup, notifications, recap, and
reconciliation sweep can be exercised locally instead of 404ing. In sandbox mode the Firestore and Auth
emulator hosts are set automatically, so it runs against the emulators with no
credentials.

**Scoped on purpose.** Every other function in `api/` belongs to Cafe
Connection proper, needs real Google service-account credentials, and continues
to 404 under `npm run dev` exactly as it did before this module existed. The
middleware does not touch them.

### Emulator data persistence

Emulator data is in-memory and discarded on shutdown. To keep a data set across
restarts:

```bash
npm run emulators -- --export-on-exit ./.emulator-data
npm run emulators -- --import ./.emulator-data --export-on-exit ./.emulator-data
```

`.emulator-data/` is git-ignored.

---

## 3. Environment variables

| Variable | Purpose | Production value |
|---|---|---|
| `VITE_CATERING_ENABLED` | Gates `/catering` and the staff Catering tab | `false` until Phase 5 sign-off |
| `VITE_USE_FIREBASE_EMULATORS` | Points the Firebase SDK at local emulators | unset / `false` — **never** `true` |
| `VITE_FIREBASE_EMULATOR_HOST` | Emulator host (default `127.0.0.1`) | unset |
| `VITE_FIREBASE_EMULATOR_AUTH_PORT` | Default `9099` | unset |
| `VITE_FIREBASE_EMULATOR_FIRESTORE_PORT` | Default `8080` | unset |
| `VITE_FIREBASE_EMULATOR_STORAGE_PORT` | Default `9199` | unset |

Both flags are read in [`src/config/features.js`](../../src/config/features.js);
the emulator wiring lives in [`src/firebase/core.js`](../../src/firebase/core.js).

---

## 4. Vercel preview deployment — the UAT environment

This is the runbook for standing up a shareable `/catering` URL backed by a
dedicated dev Firebase project, so real planners can test without touching
production data. Every step needs Firebase Console or Vercel Dashboard access.

`vercel.json` adds rewrites so `/catering` and `/catering/*` serve `index.html`
rather than 404ing on the static host. The rewrites are scoped to those paths
only and do not change routing for `/api/*` or the existing app.

### 4.1 Create the dev Firebase project

In the Firebase Console, create a project (suggested ID `cafe-connection-dev`)
and enable three products:

| Product | Setting |
|---|---|
| **Authentication** | Enable the **Google** provider. The app rejects non-`@ucar.edu` addresses in `verifyStaffOrCron` and in the rules, so no extra restriction is needed here. |
| **Firestore** | Any region. Rules are deployed from this repo in 4.2 — do **not** accept the console's default test-mode rules. |
| **Storage** | Needed for catering recap PDFs (`catering_recaps/`). |

Then register a **Web app** and copy the SDK config — those seven values become
the `VITE_FIREBASE_*` variables in 4.4.

### 4.2 Deploy rules and indexes to it

```bash
firebase login
firebase use --add          # select the dev project, alias it `dev`
firebase deploy --project dev --only firestore:rules,firestore:indexes,storage
```

The eleven composite indexes build asynchronously. Catering's queue, daily
schedule, and meal lookups will fail until they finish — start this before
seeding, not after.

### 4.3 Authorize the preview domain — do this or Google sign-in fails

Firebase Auth rejects OAuth from any origin not on its **Authorized domains**
list, with `auth/unauthorized-domain`. Vercel's per-deployment URLs contain a
fresh hash each build, so authorizing one is useless. Authorize the **branch
alias**, which is stable:

```
cafe-connection-git-claude-cat-c21903-jeffdaskam-7140s-projects.vercel.app
```

Firebase Console → Authentication → Settings → Authorized domains → Add domain.

That same branch-alias URL is the one to send planners — not the hashed
per-deployment URL, which changes on every push.

> Check Vercel's **Deployment Protection** setting too (Project Settings →
> Deployment Protection). If Vercel Authentication is enabled for previews,
> anyone without a Vercel account on this team gets an SSO wall before the app
> ever loads. Planners will need it disabled for previews, or a protection
> bypass, or they cannot reach the URL at all.

### 4.4 Set preview-scoped environment variables

Vercel Dashboard → Settings → Environment Variables, each scoped to
**Preview** only. Leaving production untouched is the entire point.

| Variable | Value |
|---|---|
| `VITE_CATERING_ENABLED` | `true` |
| `VITE_FIREBASE_API_KEY` | dev project web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | dev project web config |
| `VITE_FIREBASE_PROJECT_ID` | dev project web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | dev project web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | dev project web config |
| `VITE_FIREBASE_APP_ID` | dev project web config |
| `VITE_FIREBASE_MEASUREMENT_ID` | dev project web config (optional) |
| `FIREBASE_ADMIN_PROJECT_ID` | dev service-account key |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | dev service-account key |
| `FIREBASE_ADMIN_PRIVATE_KEY` | dev service-account key, newlines as `\n` |
| `FIREBASE_STORAGE_BUCKET` | must equal `VITE_FIREBASE_STORAGE_BUCKET` |
| `ALLOWED_STORAGE_BUCKET` | same again |
| `CRON_SECRET` | any long random string |
| `INVITE_APP_URL` | the branch-alias URL from 4.3 |
| `CATERING_APP_URL` | the branch-alias URL from 4.3 |
| `CATERING_EMAIL_ENABLED` | `false` until `gmail.send` re-consent lands |
| `CATERING_OPS_INBOX` | ops distribution list, or blank |

Generate the service-account key at Firebase Console → Project Settings →
Service Accounts → Generate new private key.

**Leave `VITE_USE_FIREBASE_EMULATORS` unset.** Emulators only run locally;
setting it on Vercel points the SDK at a `127.0.0.1` that does not exist there.

> **This changes previews for every branch, not just this one.** Preview-scoped
> variables apply to all preview deployments. Once `VITE_FIREBASE_*` points at
> the dev project, a preview of any unrelated Cafe Connection PR will also run
> against dev — an empty database, not production data. That is usually what you
> want from a preview, but it is a behavior change worth knowing about before a
> reviewer opens an unrelated preview and finds no data.

### 4.5 Seed the dev project

The seed scripts refuse to write to any non-emulator project unless the guard
is lifted deliberately — see `assertWriteAllowed()` in
[`scripts/lib/cateringAdmin.mjs`](../../scripts/lib/cateringAdmin.mjs). A dev
project is a real project, so the guard applies:

```bash
export FIREBASE_ADMIN_PROJECT_ID=<dev-project-id>
export FIREBASE_ADMIN_CLIENT_EMAIL=<dev-service-account-email>
export FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
export CATERING_ALLOW_PRODUCTION_WRITE=true   # required for any live project

node scripts/seedCateringReferenceData.mjs    # 44 rooms, 9 buildings
node scripts/migrateCateringEvents.mjs        # historical events (optional)
```

Reference data is required — the Rooms step has nothing to offer without it.
The event migration is optional for UAT and needs the git-ignored CSVs in
`data/catering/`; skip it to start planners on an empty queue.

Give yourself a staff role in the dev project by creating a `user_roles`
document keyed by your UID with `{ role: "administrator", email: "..." }`.
Requesters self-provision on first sign-in; staff roles do not.

### 4.6 Verify before inviting planners

- [ ] The branch-alias URL loads, and `/catering` shows the Catering Companion
      rather than the Cafe Connection shell
- [ ] Google sign-in with a `@ucar.edu` account completes — the one thing no
      automated run has ever covered (see `UAT.md`)
- [ ] The Rooms step lists buildings and rooms (confirms seeding and indexes)
- [ ] A submitted request appears in the dev project's Firestore, and **nothing
      new appears in production Firestore**
- [ ] `POST /api/catering` with `{"action":"reconcile"}` and a staff token
      returns a report rather than a 401

Note that `vercel.json` crons run on **production only**, so the nightly sweep
does not fire on a preview. Trigger it by hand, which is what `UAT.md` §4 asks
for anyway.

---

## 5. Promotion to production

Not before Phase 5 UAT sign-off (see `PHASES.md`). At cutover:

1. Point catering collections at the production Firebase project and deploy the
   Firestore rules and indexes.
2. Set `VITE_CATERING_ENABLED=true` in the Vercel **production** environment.
3. Redeploy production.

Rollback is flipping the flag back to `false` and redeploying — no data
migration to undo.
