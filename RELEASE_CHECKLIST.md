# Cafe Connection — Release Checklist

Run through this checklist before merging any structural change to `main`.
Main branch auto-deploys to production on every push via Vercel.

---

## Pre-Merge (Preview Verification)

- [ ] Changes have been pushed to a feature branch and a Vercel preview deployment exists
- [ ] Preview URL tested end-to-end in a browser (not just a build pass)
- [ ] Verified the affected tab(s): Dashboard, Weekly Ops, Financials, Reports
- [ ] No console errors on page load or during normal use
- [ ] Auth flow tested: magic-link login, ProtectedRoute redirect, logout

---

## API / Serverless Routes

- [ ] `/api/parse-report` — test with a real PDF or Excel upload in preview
- [ ] `/api/get-schedule` — confirm schedule loads correctly for current week
- [ ] Both routes return 401 for unauthenticated requests (verify in Network tab)
- [ ] No Firebase credentials or secrets logged to console or response bodies

---

## Firestore & Storage

- [ ] Firestore rules deployed if `firestore.rules` was modified:
  ```
  firebase deploy --only firestore:rules
  ```
- [ ] Verified new rules don't block legitimate client operations (test in preview)
- [ ] No unprotected writes: confirm `daily_metrics` is still client-write-blocked
- [ ] If new collections were added, schemas are documented in `src/schemas/firestore.js`

---

## Environment Variables

- [ ] Any new env vars added to Vercel project settings (both Production and Preview)
- [ ] `VITE_` vars set for the frontend; non-`VITE_` vars set for serverless only
- [ ] Local `.env` updated (do not commit `.env` to the repo)

---

## Code Quality

- [ ] No hardcoded credentials, API keys, or project IDs in source files
- [ ] No `console.log` debug statements left in production paths
- [ ] Theme changes use `src/theme.js` constants — no one-off hex values

---

## Post-Deploy (Production Verification)

- [ ] Production URL loads and splash screen completes
- [ ] At least one tab verified functional after deploy
- [ ] Vercel deployment logs reviewed for build errors or function failures
- [ ] If Firestore rules were deployed, verify a test read/write from the live app

---

## Rollback Plan

If a production issue is found after merge:
1. Revert the commit on `main` with `git revert <sha>` and push
2. Vercel will auto-redeploy to the previous working state
3. If Firestore rules were changed, redeploy the previous version:
   `firebase deploy --only firestore:rules`
