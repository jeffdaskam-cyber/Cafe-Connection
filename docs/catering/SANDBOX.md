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

## 4. Vercel preview deployment

Pushing the feature branch produces a Vercel preview deployment automatically.
To exercise `/catering` there, set **preview-scoped** environment variables in
the Vercel project (Settings → Environment Variables → Preview):

- `VITE_CATERING_ENABLED=true`

Leave `VITE_USE_FIREBASE_EMULATORS` unset on Vercel — emulators only run
locally. A preview build therefore talks to whichever Firebase project the
preview `VITE_FIREBASE_*` variables name. **Before enabling catering writes on a
preview (Phase 1 onward), point those preview variables at a dedicated dev
Firebase project, not production.** Until Phase 1 the catering shell performs no
Firebase reads or writes at all, so the Phase 0 preview is inert either way.

`vercel.json` adds rewrites so `/catering` and `/catering/*` serve `index.html`
rather than 404ing on the static host. The rewrites are scoped to those paths
only and do not change routing for `/api/*` or the existing app.

---

## 5. Promotion to production

Not before Phase 5 UAT sign-off (see `PHASES.md`). At cutover:

1. Point catering collections at the production Firebase project and deploy the
   Firestore rules and indexes.
2. Set `VITE_CATERING_ENABLED=true` in the Vercel **production** environment.
3. Redeploy production.

Rollback is flipping the flag back to `false` and redeploying — no data
migration to undo.
