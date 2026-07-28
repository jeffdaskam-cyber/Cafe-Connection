// api/catering-cron-reconcile.mjs
// Vercel Serverless Function — Cafe Connection / Catering Companion
//
// Nightly reconciliation sweep (build plan §7.4).
//
// GET or POST /api/catering-cron-reconcile
// Auth: CRON_SECRET bearer token (Vercel cron), or a manager-and-above ID token
//       for a manual run.
//
// This is the backstop for every side effect the console fires optimistically.
// The console never blocks a status change on a notification or a rollup
// succeeding, so anything that failed in the moment gets picked up here:
//
//   1. events whose current state has not been notified  → send
//   2. confirmed events with an amount but no revenue row → roll up
//   3. closed events with no recap                        → generate
//
// Every step is idempotent, so a re-run is always safe.

import { respondWithError, respondWithInternalError } from "./_lib/serverless.mjs";
import { initCateringAdmin, verifyStaffOrCron } from "./_lib/cateringAdminApp.mjs";
import { planWorkFor } from "./_lib/cateringReconcile.mjs";
import { revenueDocId } from "./_lib/cateringRevenue.mjs";

const SCOPE = "catering-cron-reconcile";

const adminApp = initCateringAdmin(SCOPE);
const db = adminApp.firestore();

// A sweep should never run unbounded against a growing collection.
const MAX_EVENTS = 500;

async function callSibling(route, eventId, origin) {
  const res = await fetch(`${origin}/api/${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ eventId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${route} failed (${res.status})`);
  return body;
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await verifyStaffOrCron(adminApp, db, req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  if (!process.env.CRON_SECRET) {
    return res.status(500).json({
      error: "CRON_SECRET is not configured; the sweep cannot call its sibling endpoints.",
    });
  }

  const origin =
    process.env.CATERING_APP_URL ||
    (req.headers["x-forwarded-host"]
      ? `https://${req.headers["x-forwarded-host"]}`
      : "http://127.0.0.1:5173");

  const summary = {
    scanned: 0, notified: 0, revenueRolled: 0, recapsGenerated: 0,
    // Work that was planned but produced nothing — usually a data problem such
    // as an event with no planner email. Surfaced rather than silently retried
    // forever, so it shows up in the nightly log.
    skipped: [], failures: [],
  };

  try {
    const snap = await db.collection("catering_events").limit(MAX_EVENTS).get();
    summary.scanned = snap.size;

    for (const docSnap of snap.docs) {
      const event = { id: docSnap.id, ...docSnap.data() };

      let revenueExists = false;
      try {
        revenueExists = (await db.collection("event_revenue").doc(revenueDocId(event.id)).get()).exists;
      } catch {
        revenueExists = false;
      }

      for (const work of planWorkFor(event, revenueExists)) {
        try {
          const route =
            work.kind === "notify"  ? "catering-notify" :
            work.kind === "revenue" ? "catering-revenue-rollup" :
                                      "catering-recap";
          const result = await callSibling(route, event.id, origin);

          if (["skipped", "noop"].includes(result.action)) {
            summary.skipped.push({ eventId: event.id, kind: work.kind, reason: result.reason });
          } else if (work.kind === "notify") {
            summary.notified += 1;
          } else if (work.kind === "revenue") {
            summary.revenueRolled += 1;
          } else {
            summary.recapsGenerated += 1;
          }
        } catch (err) {
          // One bad event must not abort the sweep.
          summary.failures.push({ eventId: event.id, kind: work.kind, error: String(err.message || err) });
        }
      }
    }

    if (summary.scanned === MAX_EVENTS) {
      summary.truncated = `Stopped at the ${MAX_EVENTS}-event cap; run again or raise MAX_EVENTS.`;
    }

    console.info(`[${SCOPE}]`, JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (err) {
    return respondWithInternalError(res, SCOPE, err, summary);
  }
}
