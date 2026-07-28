# Catering Companion — User Acceptance Test

The last gate before the feature flag flips. Everything in Phases 0–5 is built
and verified against the emulator suite; UAT is the part that needs **real
people doing real work**, which automated tests cannot stand in for.

Target: **2–3 real planners**, per the build plan's §8 Phase 5 criteria.

---

## Before you start

| Prerequisite | Why | Status |
|---|---|---|
| `gmail.send` re-consent on the service mailbox | Without it, notifications compose and log but never arrive. UAT can run without it, but planners won't get email. | ⛔ **Outstanding** |
| `CATERING_OPS_INBOX` set | Otherwise the "new request" copy goes to the planner only and ops see nothing. | ⛔ **Outstanding** |
| `Request Status` / `Status` picklist values confirmed | The enums are inferred from the workflow plus three observed values. | ⛔ **Outstanding** |
| Dev/staging Firebase project with rules + indexes deployed | UAT must not run against production data. | Decide (see `SANDBOX.md` §4) |
| `VITE_CATERING_ENABLED=true` on the UAT environment | Otherwise `/catering` falls through to the staff shell. | — |
| `CRON_SECRET` set | The nightly sweep can't call its sibling endpoints without it. | — |

> Notifications can be exercised **before** the Gmail scope lands: the endpoint
> logs each fully-rendered message. Check the function logs to confirm the right
> people would have received the right text, then re-test delivery for real once
> the scope is granted.

---

## 1. Requester flow — each planner does this themselves

Send each planner only the `/catering` URL. Do not walk them through it; the
point is to find out where they get stuck.

- [ ] Signs in with their `@ucar.edu` Google account, first time, unaided
- [ ] Reaches "My requests" without an access error
- [ ] Completes all six steps for a **real upcoming event**: basics → schedule →
      meals → rooms → logistics → review
- [ ] Records the room they had **already booked** in the room calendar system
- [ ] Multi-day event: adds more than one schedule day, with meals on each
- [ ] Submits, and sees the request in "My requests" as **Submitted**
- [ ] Expands it and confirms every value they entered is shown correctly
- [ ] Edits something after submitting and sees the change persist
- [ ] Receives the "request received" email *(requires Gmail scope)*

**Watch for:** any field they hesitate over, anything they expected to enter and
couldn't, and whether "booked rooms" reads as recording an existing booking
rather than requesting one.

## 2. Staff flow — Event Services

- [ ] Catering tab is visible to managers, and to nobody below manager
- [ ] New requests appear in the queue without a refresh
- [ ] Filters work: status, lifecycle, building, date range, search
- [ ] Opens a request; every requester-entered value is present
- [ ] Confirms it → planner receives the confirmation *(requires Gmail scope)*
- [ ] Enters an estimated revenue amount → revenue rolls up
- [ ] Corrects a booked room; the requester sees the correction
- [ ] Enters actual attendance and actual revenue, then closes the event
- [ ] Recap PDF generates and its contents match the event
- [ ] Daily schedule shows the event on the right day with the right meals

## 3. Reporting

- [ ] Event Revenue page totals are **unchanged** with the catering toggle off
- [ ] Toggling "Include catering" adds the expected amounts, and only those
- [ ] Catering rows are typed correctly: Project ID → internal, ACH → external
- [ ] Dashboard catering widget shows the right counts for the campus
- [ ] Confirm with FP&A that no figure is being double-counted

## 4. Automation

- [ ] Trigger `/api/catering-cron-reconcile` manually; it reports what it did
- [ ] Break something on purpose (confirm an event while the notify endpoint is
      unreachable), then run the sweep and confirm it recovers
- [ ] Run the sweep twice; the second run reports zero work
- [ ] Review the `skipped` list — each entry is a real data problem worth fixing

## 5. Boundaries — verify, don't assume

- [ ] A requester cannot see another planner's request
- [ ] A requester has no Catering tab and cannot reach the staff console
- [ ] A requester cannot edit a request once it is confirmed
- [ ] Internal staff notes are never visible to the requester
- [ ] A non-`@ucar.edu` account cannot sign in at all

---

## Sign-off

| | |
|---|---|
| Planners who tested | |
| Date | |
| Issues found | |
| Issues fixed | |
| **Approved for cutover by** | |

Cutover steps are in [`SANDBOX.md`](./SANDBOX.md) §5. Rollback is flipping
`VITE_CATERING_ENABLED` back to `false` and redeploying — there is no data
migration to undo.

---

## Known gap this UAT must close

**Google sign-in has never been exercised.** This container's network blocks
`accounts.google.com`, so every automated run authenticated through the Firebase
Auth emulator instead. The auth-state handling, requester self-provisioning, and
every rules-enforced read and write are covered by those runs — but the Google
OAuth hand-off itself is not. Item 1's first checkbox is the only test of it.
