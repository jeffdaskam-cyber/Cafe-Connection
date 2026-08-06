# Firebase Project Migration — Personal Account → Work Account

Moving Cafe Connection's Firebase project from a personal Google account to a
work (UCAR) account.

Firebase has no "clone project" feature, so there are two routes:

| | Option A — Transfer ownership | Option B — New project + migrate |
|---|---|---|
| Effort | ~15 minutes | Most of a day |
| Data risk | None (nothing moves) | Real (export/import, UID mapping) |
| Downtime | None | Cutover window |
| Project ID | Unchanged | New |
| Code changes | None | None (config + data only) |
| Vercel env changes | None | All 12 Firebase vars, Prod + Preview |

**Take Option A unless UCAR policy forces Option B.** Option B exists in this
document as a fallback, not a recommendation.

---

## Decide first: does the project need to live in UCAR's Cloud organization?

This single question picks the route, so answer it before doing anything else.

Option A transfers *ownership* of the project, not its *organization*. A project
created under a personal account sits outside any Google Cloud organization. If
UCAR requires projects to sit inside their org — for consolidated billing, DLP,
VPC-SC, org policy constraints, or audit — then ownership transfer alone will
not satisfy that.

Ask UCAR IT / Cloud administrators:

1. Can this project be transferred as-is and stay outside the UCAR org, or must
   it be migrated into the org?
2. If it must be migrated in: can you be granted `roles/resourcemanager.projectMover`
   on the destination org (or will an admin run the move)?
3. Are there org policy constraints that a migrated project would violate —
   e.g. domain-restricted sharing, which would break the service account's
   access to shared Drive folders?
4. Does billing need to move to a UCAR billing account?

Outcomes:

- **Stay outside the org** → Option A.
- **Move into the org** → Option A, then a project move (a Cloud IAM operation,
  not a Firebase one — the project keeps its ID and all data).
- **Must be created fresh under the org** → Option B.

---

## Option A — Transfer ownership (recommended)

Everything stays put: project ID, Firestore data, Storage objects and their
download URLs, auth users and their UIDs, the service account and its Drive
folder access, OAuth clients, Analytics history. No code or env var changes.

### Steps

1. **Add the work account as Owner.**
   Firebase Console → ⚙️ Project settings → *Users and permissions* → *Add member*.
   Enter the work address, role **Owner**. (Equivalently:
   `gcloud projects add-iam-policy-binding <project-id> --member="user:WORK@ucar.edu" --role="roles/owner"`.)

2. **Accept and verify from the work account.** Sign in as the work account and
   confirm you can:
   - open the project in the Firebase Console
   - read Firestore and Storage
   - run `firebase login` then `firebase use <project-id>` and
     `firebase deploy --only firestore:rules --dry-run`

3. **Move billing, if applicable.** If the project is on the Blaze plan against
   a personal card, attach the UCAR billing account before removing the personal
   owner: Cloud Console → Billing → *Change billing*. This requires Billing
   Account Administrator on the target account, so coordinate with UCAR IT.
   Re-create any budget alerts — they belong to the billing account, not the project.

4. **Re-check who else has access.** *Users and permissions* may still list
   personal-account collaborators, and the Cloud Console shows service accounts
   and IAM bindings the Firebase Console hides. Prune anything stale now.

5. **Remove the personal account as Owner** — last, and only after step 2
   passes. Removing the wrong principal can leave the project without a usable
   Owner, so confirm the work account really does have Owner and can deploy
   before revoking anything.

6. **Reassign the Gmail OAuth consent screen owner** if `/api/ingest-email-orders`
   is in use. The OAuth client and its consent screen live in the Cloud project
   and survive the transfer, but the consent screen lists a support email and
   developer contact that may still be the personal address:
   Cloud Console → APIs & Services → *OAuth consent screen*.

### Post-transfer verification

- [ ] Production URL loads; magic-link login works end-to-end
- [ ] Google sign-in works
- [ ] Dashboard, Weekly Ops, Financials, Reports all render data
- [ ] A Drive-backed route still returns data (`/api/get-schedule`) — confirms
      the service account kept its Drive access
- [ ] A file upload succeeds (`reports/` path) and the parsed result appears
- [ ] `firebase deploy --only firestore:rules` succeeds from the work account
- [ ] Billing account correct; budget alerts re-created

---

## Option B — New project + data migration

Only if UCAR requires a project created fresh under their organization.

### Why the code needs no changes

`src/firebase/core.js` builds `firebaseConfig` entirely from `VITE_FIREBASE_*`
env vars, and `api/_lib/serverless.mjs` `getAdminApp()` reads
`FIREBASE_ADMIN_*`. There are no hardcoded project IDs, bucket names, or
`*.firebaseapp.com` hosts anywhere in `src/` or `api/`. `.firebaserc` still
holds the `your-firebase-project-id` placeholder, so CLI calls already pass
`--project` explicitly.

Roles live in the Firestore `user_roles` collection (see
`src/contexts/AuthContext.jsx`, `api/update-user-role.mjs`), **not** in Firebase
Auth custom claims — so there are no claims to migrate. But note the corollary
in the UID warning below.

### B1. Create and configure the new project

1. Create the project under the UCAR org. Enable Firestore (**same region as the
   old one** — region is permanent, and a mismatch makes the export/import
   slower and cross-region), Storage, and Authentication.
2. Set the billing plan to match the old project (Blaze if the old one was —
   scheduled functions and outbound fetch in the API routes need it).
3. Register a Web app; copy the SDK config values for the `VITE_*` env vars.
4. Enable these APIs — the serverless routes sign their own JWTs against them
   (`api/get-schedule.js`, `get-specials.mjs`, `get-event-report.mjs`,
   `get-setup-report.mjs`):
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Gmail API (only if `/api/ingest-email-orders` is used)
5. Authentication → Sign-in method: enable **Email link (passwordless)** and
   **Google**.
6. Authentication → Settings → Authorized domains: add the Vercel production
   domain **and** the preview domain pattern. Missing preview domains is a
   common trap — the app builds and loads on a preview URL but magic-link
   sign-in fails there.
7. Re-create the email action templates (Authentication → Templates). These do
   not export. `api/generate-invite-link.mjs` calls
   `generateSignInWithEmailLink()` with `url: APP_URL`, so `INVITE_APP_URL`
   must point at the new deployment.
8. Apply bucket CORS: `gcloud storage buckets update gs://<new-bucket> --cors-file=cors.json`
   (update the origin in `cors.json` first — it still holds
   `https://your-app.example.com`).
9. Enable App Check if the old project had it.

### B2. Deploy rules and indexes

From the repo root:

```bash
firebase deploy --project <new-project-id> --only firestore:rules,firestore:indexes,storage
```

Composite indexes build asynchronously — start this early, before importing
data, and let them finish. Queries in `src/firebase/data.js` and
`src/catering/` that rely on the eleven indexes in `firestore.indexes.json`
will fail until the build completes.

### B3. Migrate Firestore

```bash
# Export from the old project
gcloud config set project <old-project-id>
gsutil mb -l <region> gs://<old-project-id>-migration
gcloud firestore export gs://<old-project-id>-migration/export-$(date +%Y%m%d)

# Grant the NEW project's service agent read access on that bucket
gsutil iam ch \
  serviceAccount:service-<NEW_PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com:objectViewer \
  gs://<old-project-id>-migration

# Import into the new project
gcloud config set project <new-project-id>
gcloud firestore import gs://<old-project-id>-migration/export-<date>
```

`<NEW_PROJECT_NUMBER>` is the numeric project number (Cloud Console → project
picker, or `gcloud projects describe <new-project-id> --format='value(projectNumber)'`),
not the project ID.

Collections carried over (per `firestore.rules`): `beos`, `buildings`,
`cafe_specials`, `cash_drops`, `catering_events`, `daily_metrics`,
`event_orders`, `event_report_entries`, `event_reports`, `event_revenue`,
`fpa_facts`, `fpa_uploads`, `generated_reports`, `pending_invites`, `rooms`,
`setup_report_entries`, `setup_reports`, `user_dashboard_prefs`, `user_roles`,
`users`, `vendor_links`, `weekly_schedules`.

`catering_events` carries three subcollections — `catering_schedule_days`
(itself holding `catering_meal_selections`) and `catering_event_rooms`. A
`gcloud firestore export` with no `--collection-ids` filter takes everything,
subcollections included; if you scope the export, name the subcollections too
or the events arrive empty.

### B4. Migrate Storage

```bash
gcloud storage rsync -r \
  gs://<old-project>.firebasestorage.app \
  gs://<new-project>.firebasestorage.app
```

Paths in use, per `storage.rules`: `reports/{campus}/`, `event_orders/`,
`event_revenue_uploads/`, `fpa_uploads/`, `catering_recaps/`.

`rsync` copies object bytes but **not** the download tokens that Firebase
Storage download URLs embed. New URLs must be generated — hence B6.

### B5. Migrate Auth users — preserve UIDs

```bash
firebase auth:export users.json --project <old-project-id>
firebase auth:import users.json --project <new-project-id>
```

> **UIDs must survive this step.** `user_roles/{uid}` and
> `user_dashboard_prefs/{userId}` are keyed by Firebase Auth UID. If UIDs
> change, every role assignment orphans and **all users lose access, admins
> included** — and because roles live in Firestore rather than in claims, there
> is no fallback path to grant yourself admin from the console. `auth:import`
> preserves the `localId` field from the export, so this works by default; the
> failure mode is users being re-created by hand instead.
>
> Verify before cutover: pick three UIDs from `user_roles` and confirm each
> exists in the new project's Auth (`firebase auth:export check.json --project <new-project-id>`,
> then grep). Sign-in providers are email-link and Google only, so there are no
> password hashes to carry.

Delete `users.json` when done — it contains every user's email and provider data.

### B6. Rewrite stale Storage download URLs

`src/firebase/uploads.js` (`uploadEventOrder`) and
`api/ingest-email-orders.mjs` (`writeEventOrderDoc`) persist a `downloadURL`
field on `event_orders` documents. Those URLs embed the **old** bucket host and
an old download token, so after the migration they point at the old project.
Two consequences:

- `EventOrderLibraryWidget.jsx` and `WeeklyPacketReport.jsx` fetch that field
  directly — links break once the old project is deleted.
- `isValidStorageUrl()` in `api/_lib/serverless.mjs` compares the URL against
  `ALLOWED_STORAGE_BUCKET`, so old-bucket URLs are rejected outright by
  `/api/parse-report` and `/api/parse-fpa-report`.

`event_orders` is the only collection this script rewrites — `fpa_uploads` and
`event_revenue` store filenames and metrics only. Also spot-check
`vendor_links.logoUrl`, which is admin-entered and *could* contain a pasted
Storage URL.

`catering_events.recapUrl` also embeds the old bucket, but does not need the
script. Its download token is derived from the event ID rather than randomly
assigned, so re-running the recap action regenerates both the PDF and a URL
pointing at the new bucket:

```bash
curl -X POST https://<new-host>/api/catering \
  -H "Authorization: Bearer <staff-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"recap","eventId":"<id>"}'
```

Or clear `recapUrl` on the closed events and let the nightly sweep
(`/api/catering?action=reconcile`) regenerate them — it already treats a closed
event without a recap as work to do.

Run `scripts/rewrite-storage-urls.mjs` (dry-run by default) against the new
project after B3 and B4 complete:

```bash
export FIREBASE_ADMIN_PROJECT_ID=<new-project-id>
export FIREBASE_ADMIN_CLIENT_EMAIL=<new-service-account-email>
export FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
export OLD_STORAGE_BUCKET=<old-project>.firebasestorage.app
export NEW_STORAGE_BUCKET=<new-project>.firebasestorage.app

node scripts/rewrite-storage-urls.mjs           # dry run — prints planned changes
node scripts/rewrite-storage-urls.mjs --apply   # writes
```

The script does not string-swap the hostname. A Firebase download URL's
`token` parameter must match the object's `firebaseStorageDownloadTokens`
custom metadata, so the script reads that metadata in the new bucket, reuses
the token when the copy preserved it, mints one when it did not, and rebuilds
the URL. A bare hostname swap can leave a token matching no metadata, which
403s. Dry run never mutates Storage metadata — tokens are only minted under
`--apply`.

Its URL parsing and building helpers are covered by
`test/rewrite-storage-urls.test.mjs`, including a case asserting that generated
URLs satisfy the API's own `isValidStorageUrl()` check.

### B7. Service account and Drive access

**The most easily missed step.** A new project means a new service account with
a new email address, and the Drive-backed routes authenticate to Google Drive,
Sheets, and Docs using the *Firebase Admin* private key.

1. Firebase Console → Project settings → Service accounts → *Generate new
   private key*. This JSON supplies `FIREBASE_ADMIN_PROJECT_ID`,
   `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY`.
2. **Re-share every Google Drive folder** with the new service account email
   (Viewer is enough — the routes request `drive.readonly`):
   - `GOOGLE_SCHEDULE_FOLDER_ID`
   - `GOOGLE_SPECIALS_FOLDER_ID`
   - `GOOGLE_EVENT_REPORTS_FOLDER_ID`
   - `GOOGLE_SETUP_REPORT_FOLDER_ID`

   Skip this and the app looks completely healthy — it builds, logs in, renders
   — while every schedule, specials, and report fetch returns 404.

   If UCAR enforces domain-restricted sharing, sharing with a
   `*.iam.gserviceaccount.com` principal may be blocked by org policy. Confirm
   this with UCAR IT during the pre-flight questions above; it can be a
   blocker for Option B specifically.
3. Re-create the Gmail OAuth client and mint a fresh refresh token for
   `/api/ingest-email-orders`: the client lives in the old Cloud project and
   does not transfer. `scripts/test-gmail-send.mjs` documents the consent-screen
   setup and prints a new refresh token.
4. Store the new private key in Vercel only. Never commit it.

### B8. Update Vercel environment variables

Set every variable in **both Production and Preview** (Vercel Project →
Settings → Environment Variables). Per `.env.example`:

Frontend (`VITE_`, exposed to the browser):
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_FIREBASE_MEASUREMENT_ID`

Serverless only (never `VITE_`-prefixed):
`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
`FIREBASE_ADMIN_PRIVATE_KEY`, `ALLOWED_STORAGE_BUCKET`,
`FIREBASE_STORAGE_BUCKET`, `INVITE_APP_URL`

`ALLOWED_STORAGE_BUCKET` and `FIREBASE_STORAGE_BUCKET` must both equal
`VITE_FIREBASE_STORAGE_BUCKET`, or upload parsing rejects its own uploads.

Rotate `CRON_SECRET` while you are in here. Google Drive folder IDs and
`VITE_EMAIL_CLIENT` carry over unchanged.

### B9. What does not migrate at all

- **Analytics history.** A new project means a new GA property and a new
  `measurementId`. Old data stays in the old property.
- **Auth email template customizations** — re-created by hand (B1.7).
- **Firebase Console settings** generally: authorized domains, App Check,
  budget alerts, sign-in provider config.
- **Storage download tokens** — see B6.
- **Firestore TTL policies and backup schedules**, if any are configured.

### B10. Cutover and verification

Freeze writes during the window — otherwise documents written after the export
are silently lost.

1. Announce a maintenance window; stop uploads.
2. Re-run B3 (Firestore export/import) and B4 (Storage rsync) to capture
   anything written since the trial run.
3. Run B6 with `--apply`.
4. Update Vercel env vars (B8) and redeploy.
5. Work through the `RELEASE_CHECKLIST.md` post-deploy section, plus:
   - [ ] Magic-link login works on production **and** on a preview URL
   - [ ] Google sign-in works
   - [ ] An existing admin still has admin (confirms UID preservation)
   - [ ] `/api/get-schedule`, `/api/get-specials`, `/api/get-event-report`,
         `/api/get-setup-report` all return data (confirms Drive re-share)
   - [ ] A new upload parses end-to-end via `/api/parse-report`
   - [ ] An **old** `event_orders` link opens (confirms B6)
   - [ ] Firestore index builds all complete
6. Keep the old project intact and read-only for at least 30 days. Do not
   delete it until the new one has run a full reporting cycle — project deletion
   is effectively irreversible after the 30-day grace period.

---

## Verifying with `npm test`

```bash
npm test
```

This is safe to use as post-cutover verification. It previously reported a
failure on a clean checkout regardless of code health — it ran bare
`node --test`, whose default discovery glob matches `test-*.mjs` and so picked up
`scripts/test-gmail-send.mjs`, an interactive OAuth helper that exits non-zero
without `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`. Discovery is now scoped to
`test/**/*.test.mjs`, so a red suite means a real failure.

Note that the test suite covers pure helpers only. It does not exercise
Firestore, Storage, Auth, or the Drive-backed routes, so a green suite says
nothing about whether a migration succeeded — work the § B10 cutover checklist
regardless.

## Note on the `isValidStorageUrl` guards

There are **two** functions with this name, which matters if you are auditing
the upload paths during migration:

- the shared `isValidStorageUrl(url, allowedBucket)` exported from
  `api/_lib/serverless.mjs`, taking the bucket as its second argument — used by
  `api/parse-report.js` and `api/parse-fpa-report.mjs`;
- a **local** single-argument `isValidStorageUrl(url)` defined inside
  `api/parse-event-revenue.mjs` (line 53), which closes over a module-level
  `ALLOWED_STORAGE_BUCKET` read from the environment at import time.

Both fail closed when the bucket is unset, and both are correct as written. The
single-argument call in `parse-event-revenue.mjs` is calling its own local
function, not the shared one — it is not a missing-argument bug. The duplication
is a refactor opportunity, not a defect.

The practical migration consequence: `parse-event-revenue.mjs` reads
`ALLOWED_STORAGE_BUCKET` at module load and throws at import time if it is
missing (lines 20-22), so a partially-updated Vercel environment fails that
route loudly at cold start rather than at request time. Set the bucket vars
before redeploying.
