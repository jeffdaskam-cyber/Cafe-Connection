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

Two prerequisites, both checked before anything starts:

| | |
|---|---|
| **Node 22+** | <https://nodejs.org> — the current LTS |
| **Java 21+** | The Firestore and Storage emulators are Java programs, and firebase-tools rejects anything older |

Installing Java:

```bash
winget install --id Microsoft.OpenJDK.21 -e   # Windows — then reopen the terminal
brew install --cask temurin                   # macOS
sudo apt install openjdk-21-jre               # Debian/Ubuntu
```

Not `default-jre` on Debian/Ubuntu: it is still Java 11 on Ubuntu 22.04, which
the emulators reject.

On Windows, PATH only refreshes in a **new** terminal, so close and reopen the
one you are in before continuing. `java -version` should print 21 or newer.

```bash
npm ci          # installs firebase-tools as a devDependency
npm run sandbox # emulators + seed + dev server, one command
```

**On a fresh Windows machine**, `setup-windows.cmd` in the repo root does the
same thing and checks the prerequisites first, so a missing Node or Java is
reported before the `npm ci` wait rather than after it:

```
git clone https://github.com/jeffdaskam-cyber/Cafe-Connection.git
cd Cafe-Connection
setup-windows.cmd
```

### No admin rights on the machine

Node and Java both ship as plain `.zip` archives with no installer, so neither
needs administrator access. Extract them inside the repo and
`setup-windows.cmd` finds them without touching your PATH:

| Download | Extract so this path exists |
|---|---|
| [Node 22 Windows x64 ZIP](https://nodejs.org/en/download) | `tools\node\node.exe` |
| [Temurin 21 Windows x64 **ZIP**](https://adoptium.net/temurin/releases/?version=21&package=jdk) | `tools\java\bin\java.exe` |

Take the **.zip**, not the `.msi`/installer — the installer is the part that
wants admin. `tools/` is git-ignored. Everything else works exactly as it does
with a system-wide install.

Without Java, firebase-tools fails with ``Could not spawn `java -version` `` and
shuts the emulators down — which reads like a broken repo rather than a missing
dependency. `npm run sandbox` checks for both prerequisites first and prints the
install command for your platform.

Then open <http://localhost:5180/catering>. You should see the Catering
Companion shell with an orange **SANDBOX** banner across the top and a
`[firebase] SANDBOX MODE` warning in the browser console. The emulator UI is at
<http://localhost:4000>. `Ctrl-C` stops everything.

**Port 5180, not Vite's usual 5173.** Another Vite app already holding 5173
would push this one silently to 5174 while the browser stays on 5173 showing the
*other* app. If that app shares this codebase, `/catering` falls through to its
shell and reports "You don't have access to this application" — which looks like
a permissions problem and is not one. 5180 is used with `--strictPort`, so a
collision fails loudly instead. Override with `SANDBOX_PORT` if 5180 is taken.

> If you ever see "Access required — contact your administrator", check the page
> heading first. **UCAR Catering Companion** means you are in the right app and
> it is a real permissions issue. **UCAR Cafe Connection** means `/catering` fell
> through — wrong port, wrong app, or `VITE_CATERING_ENABLED` unset — and no
> amount of role-granting will fix it.

`npm run sandbox` starts the emulators, seeds reference data, and runs Vite
against them. No Firebase project, no credentials, no Vercel changes — the
`demo-` project prefix makes the SDK refuse to reach a live project even if real
credentials are present.

**Signing in.** Click *Continue with Google*. Against the Auth emulator this
opens the emulator's own account chooser rather than a real Google prompt — add
any `@ucar.edu` address and it becomes a signed-in user. First sign-in at
`/catering` self-provisions you as a `requester`.

**Getting to the staff side.** Staff roles are not self-provisioned, so the
Catering tab will not appear until you grant yourself one:

```bash
npm run catering:grant -- --sandbox you@ucar.edu administrator
```

Run it in a second terminal while the sandbox is still going. `--sandbox` points
the script at the local emulators, so no environment variables are needed —
setting those takes `set` on cmd.exe, `$env:` in PowerShell, and a prefix
assignment in bash, which is three ways to get it wrong before doing anything
useful.

Sign out and back in, then open <http://localhost:5180/> — the Catering tab sits
between Reports and Admin.

**Sample vs. real data.** The AppSheet exports in `data/catering/` are
git-ignored, so a fresh clone has none. Rather than fail, the seed falls back to
the committed `*.example.csv` files — two synthetic buildings and three rooms,
enough to click through the whole flow. It says so on stdout. Drop the real
exports into `data/catering/` and re-run for the full 9 buildings and 44 rooms.
The fallback is emulator-only: seeding a live project with synthetic rooms would
be worse than failing.

### Running the pieces separately

Useful when you want the emulators to outlive a dev-server restart:

```bash
npm run emulators    # terminal 1 — Auth 9099, Firestore 8080, Storage 9199, UI 4000
npm run dev:sandbox  # terminal 2
npm run catering:seed
```

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

This is the runbook for standing up a hosted `/catering` URL backed by a
dedicated dev Firebase project, so it can be used without touching production
data. Written for one person getting hands on the app first; §4.4 is the only
part that exists solely for handing the URL to other people, and it is
skippable until then. Every step needs Firebase Console or Vercel Dashboard
access.

`vercel.json` adds rewrites so `/catering` and `/catering/*` serve `index.html`
rather than 404ing on the static host. The rewrites are scoped to those paths
only and do not change routing for `/api/*` or the existing app.

> **This dev project is deliberately temporary.** Cafe Connection is scheduled
> to move to UCAR-owned GitHub, Firestore, and Azure hosting. Stand this up in
> whichever account is available now and treat its *data* as throwaway — UAT
> events, test planners, seeded rooms. What carries forward is all in this repo
> already: `firestore.rules`, `firestore.indexes.json`, `storage.rules`, and the
> seed scripts. Don't let UAT data accumulate into something that feels worth
> migrating; `FIREBASE_TRANSFER.md` covers moving production, not this.

### 4.1 Create the dev Firebase project

In the Firebase Console, create a project (suggested ID `cafe-connection-dev`)
and enable three products:

| Product | Setting |
|---|---|
| **Authentication** | Enable the **Google** provider. The app rejects non-`@ucar.edu` addresses in `verifyStaffOrCron` and in the rules, so no extra restriction is needed here. |
| **Firestore** | Any region. Rules are deployed from this repo in 4.2 — do **not** accept the console's default test-mode rules. |
| **Storage** | Needed for catering recap PDFs (`catering_recaps/`). |

Then register a **Web app** and copy the SDK config — those seven values become
the `VITE_FIREBASE_*` variables in 4.5.

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

### 4.4 Get other people past Vercel Authentication

**Confirmed on this project:** `ssoProtection` is enabled with deployment type
`all_except_custom_domains` — Vercel's "Standard Protection". Every
`*.vercel.app` URL sits behind a Vercel login wall. The main app is reached
through its production custom domain, which is exempt; preview URLs are not.

**If you are the only one using the preview, skip this section.** The project
owner is already signed in to Vercel, so the wall opens on its own. It only
becomes a problem the first time someone without a Vercel account on this team
needs the URL — then authorizing the domain in Firebase (4.3) does nothing for
them, because these are two different walls in series. Options for that day,
best first:

| Option | Trade-off |
|---|---|
| **Shareable Link** (Project Settings → Deployment Protection → Shareable Links, or the Share button on a deployment) | Vercel's intended answer. Bypasses SSO for that link only; production stays protected. Best for UAT. |
| **Custom domain** on the UAT deployment | Custom domains are exempt under Standard Protection. Heavier setup, but gives planners a URL that looks real. |
| **Protection Bypass for Automation** | A token in a header or query param. Fine for scripts, awkward to hand to a person. |
| **Disable SSO protection** | Exposes *all* `*.vercel.app` URLs including production deployment aliases. Not worth it for UAT. |

Firebase Google sign-in and the Firestore rules are still the real access
boundary either way — a shareable link only gets someone to the login screen,
not to any data.

### 4.5 Set preview-scoped environment variables

Vercel Dashboard → Settings → Environment Variables, each scoped to
**Preview** only. Leaving production untouched is the entire point.

**Required — nothing works without these twelve:**

| Variable | Value |
|---|---|
| `VITE_CATERING_ENABLED` | `true` |
| `VITE_FIREBASE_API_KEY` | dev project web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | dev project web config |
| `VITE_FIREBASE_PROJECT_ID` | dev project web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | dev project web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | dev project web config |
| `VITE_FIREBASE_APP_ID` | dev project web config |
| `FIREBASE_ADMIN_PROJECT_ID` | dev service-account key |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | dev service-account key |
| `FIREBASE_ADMIN_PRIVATE_KEY` | dev service-account key, newlines as `\n` |
| `FIREBASE_STORAGE_BUCKET` | must equal `VITE_FIREBASE_STORAGE_BUCKET` |

The three `FIREBASE_ADMIN_*` values are the only ones `/api/catering` hard-fails
on at module load — see `initCateringAdmin` in
[`api/_lib/cateringAdminApp.mjs`](../../api/_lib/cateringAdminApp.mjs). Generate
the key at Firebase Console → Project Settings → Service Accounts → Generate new
private key. `FIREBASE_STORAGE_BUCKET` is what recap PDFs are written to; the
recap action fails without it, everything else works.

**Optional — add when you need the behavior:**

| Variable | Needed for | If unset |
|---|---|---|
| `CATERING_APP_URL` | "view your request" links in notifications | Links are omitted; nothing breaks |
| `CATERING_EMAIL_ENABLED` | Actually sending mail | Defaults off — messages are composed and logged instead |
| `CATERING_OPS_INBOX` | Cc'ing ops on new requests | Planner gets their copy only |
| `CRON_SECRET` | The nightly sweep authenticating as itself | Crons do not run on preview anyway; call the endpoint with a staff token |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics | Unused by catering |
| `INVITE_APP_URL`, `ALLOWED_STORAGE_BUCKET` | `/api/invites` and the main app's report parsers | Not catering paths |

**Leave `VITE_USE_FIREBASE_EMULATORS` unset.** Emulators only run locally;
setting it on Vercel points the SDK at a `127.0.0.1` that does not exist there.

> **This changes previews for every branch, not just this one.** Preview-scoped
> variables apply to all preview deployments. Once `VITE_FIREBASE_*` points at
> the dev project, a preview of any unrelated Cafe Connection PR will also run
> against dev — an empty database, not production data. That is usually what you
> want from a preview, but it is a behavior change worth knowing about before a
> reviewer opens an unrelated preview and finds no data.

### 4.6 Confirm the flag actually took effect

`VITE_CATERING_ENABLED` is read at **build** time, so setting the variable does
nothing until the next deployment — redeploy after 4.5. Two ways to tell it
worked:

- The preview's `index.html` should reference a **different** `index-*.js` hash
  than production. Identical hashes mean the preview built with production's
  variables and the flag never changed.
- In that bundle, the render call should branch. Flag off compiles to a single
  child:
  ```js
  render(jsx(StrictMode, { children: jsx(Hl, {}) }))   // Hl = the staff App
  ```
  Flag on keeps the conditional and the `Suspense` wrapper. The presence of a
  `CateringApp-*.js` chunk proves nothing — it is emitted either way.

### 4.7 Seed the dev project

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
The event migration is optional and needs the git-ignored CSVs in
`data/catering/`; skip it to start on an empty queue.

### 4.8 Give yourself a staff role

A fresh project has no administrator, and staff roles are not self-provisioned
— only `requester` is. So on first sign-in you land on the requester side with
no Catering tab, and no way to invite yourself.

Sign in once at `/catering` so the Auth user exists, then:

```bash
node scripts/grantCateringRole.mjs you@ucar.edu administrator
```

Sign out and back in for it to take effect. The script writes the same document
shape `AuthContext` writes on invite activation, so the app cannot tell the
difference. It needs the same `FIREBASE_ADMIN_*` and
`CATERING_ALLOW_PRODUCTION_WRITE=true` exports as 4.7, and works against the
emulator with no credentials at all.

### 4.9 Verify

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
