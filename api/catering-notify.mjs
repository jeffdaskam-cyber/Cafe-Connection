// api/catering-notify.mjs
// Vercel Serverless Function — Cafe Connection / Catering Companion
//
// Sends a catering notification for one event and records that it was sent.
//
// POST /api/catering-notify
// Body: { eventId: string, type?: "created"|"updated"|"confirmed"|"closed", force?: boolean }
// Auth: manager-and-above Firebase ID token, or CRON_SECRET (nightly sweep).
//
// TRANSPORT
// ─────────
// Sending requires the service mailbox to hold the `gmail.send` OAuth scope.
// That re-consent is an IT/Workspace action and is still outstanding, so the
// transport is chosen at call time:
//
//   gmail  — GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN set AND CATERING_EMAIL_ENABLED=true
//   log    — otherwise: the fully-rendered message is logged, nothing is sent
//
// The log transport runs the identical code path, so recipients, templates, and
// the lastNotified bookkeeping are all exercised now. Flipping
// CATERING_EMAIL_ENABLED once the scope lands is the only change needed.

import admin from "firebase-admin";

import {
  createHttpError, fetchWithTimeout, respondWithError, respondWithInternalError,
} from "./_lib/serverless.mjs";
import { initCateringAdmin, loadEventBundle, verifyStaffOrCron } from "./_lib/cateringAdminApp.mjs";
import {
  ALL_NOTIFICATION_TYPES, buildRawMessage, notificationStateOf, notificationTypeFor,
  recipientsFor, renderNotification,
} from "./_lib/cateringNotify.mjs";

const SCOPE = "catering-notify";
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const adminApp = initCateringAdmin(SCOPE);
const db = adminApp.firestore();

export function transportName() {
  const hasCreds = Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );
  return hasCreds && process.env.CATERING_EMAIL_ENABLED === "true" ? "gmail" : "log";
}

async function gmailAccessToken() {
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail OAuth request failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("Gmail OAuth error: no access_token returned.");
  return data.access_token;
}

async function sendViaGmail({ from, to, cc, subject, body }) {
  const token = await gmailAccessToken();
  const raw = buildRawMessage({ from, to, cc, subject, body });

  const res = await fetchWithTimeout(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    // A 403 here almost always means the mailbox still lacks gmail.send.
    throw new Error(`Gmail send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyStaffOrCron(adminApp, db, req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  const { eventId, type: requestedType, force = false } = req.body || {};
  if (!eventId || typeof eventId !== "string" || !EVENT_ID_RE.test(eventId)) {
    return res.status(400).json({ error: "A valid eventId is required." });
  }
  if (requestedType && !ALL_NOTIFICATION_TYPES.includes(requestedType)) {
    return res.status(400).json({ error: `Unknown notification type "${requestedType}".` });
  }

  try {
    const bundle = await loadEventBundle(db, eventId);
    if (!bundle) return res.status(404).json({ error: "Catering event not found." });

    const { event, ref } = bundle;
    const type = requestedType ?? notificationTypeFor(event);
    if (!type) {
      return res.status(200).json({
        action: "skipped", eventId,
        reason: `no notification applies to state ${notificationStateOf(event)}`,
      });
    }

    const state = notificationStateOf(event);
    // Idempotency: the same state is not notified twice unless forced. This is
    // what stops the nightly sweep from re-sending every night.
    if (!force && !requestedType && event.lastNotifiedStatus === state) {
      return res.status(200).json({ action: "noop", eventId, reason: "already notified for this state" });
    }

    const opsInbox = process.env.CATERING_OPS_INBOX || null;
    const { to, cc } = recipientsFor(type, event, opsInbox);
    if (to.length === 0) {
      return res.status(200).json({
        action: "skipped", eventId, reason: "event has no planner email to notify",
      });
    }

    const appUrl = process.env.CATERING_APP_URL || null;
    const { subject, body } = renderNotification(type, event, {
      recapUrl: event.recapUrl ?? null,
      appUrl,
    });

    const from = process.env.CATERING_FROM_ADDRESS || "UCAR Event Services <noreply@ucar.edu>";
    const transport = transportName();

    if (transport === "gmail") {
      await sendViaGmail({ from, to, cc, subject, body });
    } else {
      // Deliberately loud: this is what "notifications are built but not yet
      // switched on" looks like in the logs.
      console.info(
        `[${SCOPE}] LOG TRANSPORT (gmail.send scope not enabled) — not sent\n` +
        `  type: ${type}\n  to: ${to.join(", ")}\n  cc: ${cc.join(", ") || "—"}\n` +
        `  subject: ${subject}\n---\n${body}\n---`
      );
    }

    await ref.set(
      {
        lastNotifiedStatus: state,
        lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastNotifiedType: type,
        lastNotifiedTransport: transport,
      },
      { merge: true }
    );

    return res.status(200).json({
      action: transport === "gmail" ? "sent" : "logged",
      eventId, type, transport, to, cc, subject,
    });
  } catch (err) {
    return respondWithInternalError(res, SCOPE, err);
  }
}

export { createHttpError };
