// api/catering.mjs
// Vercel Serverless Function — Cafe Connection / Catering Companion
//
// Single entry point for every catering server-side action.
//
//   POST /api/catering  { action: "rollup",    eventId }
//   POST /api/catering  { action: "notify",    eventId, type?, force? }
//   POST /api/catering  { action: "recap",     eventId }
//   GET  /api/catering?action=reconcile        (nightly cron)
//
// Auth: manager-and-above Firebase ID token, or CRON_SECRET as a bearer token.
//
// WHY ONE FUNCTION
// ────────────────
// These were four separate endpoints. They are merged because the host caps
// serverless functions per deployment and the project sits at that cap.
//
// The merge also removed a wart: the nightly sweep used to invoke the other
// three over HTTP against its own origin, which meant extra cold starts, an
// extra auth round trip per event, and an origin it had to guess from headers.
// Now it calls them in process. That is both simpler here and the shape this
// wants to be on any host — see docs/catering/PHASES.md.
//
// Every action stays individually idempotent, so retries and the sweep are safe.

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { jsPDF } from "jspdf";

import {
  fetchWithTimeout, respondWithError, respondWithInternalError,
} from "./_lib/serverless.mjs";
import {
  initCateringAdmin, loadEventBundle, verifyStaffOrCron,
} from "./_lib/cateringAdminApp.mjs";
import {
  ALL_NOTIFICATION_TYPES, buildRawMessage, notificationStateOf, notificationTypeFor,
  recipientsFor, renderNotification,
} from "./_lib/cateringNotify.mjs";
import { buildRecap, recapStoragePath } from "./_lib/cateringRecap.mjs";
import { planWorkFor } from "./_lib/cateringReconcile.mjs";
import { buildRevenueDoc, revenueDocId, shouldRemoveRevenue } from "./_lib/cateringRevenue.mjs";
import {
  buildBuildingDocs, buildMenuItemDocs, buildRoomDocs, orphanRoomBuildings, unmappedBuildings,
} from "./_lib/cateringReference.mjs";

const SCOPE = "catering";
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_EVENTS = 500;

const adminApp = initCateringAdmin(SCOPE, { storageBucketEnvVar: "FIREBASE_STORAGE_BUCKET" });
const db = getFirestore(adminApp);

export const ACTIONS = ["rollup", "notify", "recap", "reconcile", "seed-reference", "seed-menu"];

// ── Revenue rollup ───────────────────────────────────────────────────────────
// The only writer of catering rows in event_revenue. The document ID is derived
// from the event ID, so the write is idempotent by construction.

async function runRollup(eventId, callerUid) {
  const eventSnap = await db.collection("catering_events").doc(eventId).get();
  if (!eventSnap.exists) return { status: 404, body: { error: "Catering event not found." } };

  const event = { id: eventSnap.id, ...eventSnap.data() };
  const revenueRef = db.collection("event_revenue").doc(revenueDocId(eventId));

  // Withdraw revenue for an event that is no longer confirmed.
  if (shouldRemoveRevenue(event)) {
    const existing = await revenueRef.get();
    if (existing.exists) {
      await revenueRef.delete();
      return { status: 200, body: { action: "removed", eventId } };
    }
    return { status: 200, body: { action: "noop", eventId, reason: "not confirmed" } };
  }

  const built = buildRevenueDoc(event);
  if (!built.ok) {
    // Not an error — a confirmed event with no amount yet is normal.
    return { status: 200, body: { action: "skipped", eventId, reason: built.reason } };
  }

  await revenueRef.set(
    {
      ...built.data,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: callerUid ?? "cron",
    },
    { merge: true }
  );

  await eventSnap.ref.set(
    {
      revenueRolledUpAt: FieldValue.serverTimestamp(),
      revenueRollupAmount: built.data.revenue,
    },
    { merge: true }
  );

  return {
    status: 200,
    body: {
      action: "written", eventId, docId: built.docId,
      revenue: built.data.revenue, type: built.data.type,
      campus: built.data.campus, monthKey: built.data.monthKey,
      isEstimate: built.data.isEstimate,
    },
  };
}

// ── Notifications ────────────────────────────────────────────────────────────
// Sending requires the service mailbox to hold the `gmail.send` OAuth scope.
// Until that re-consent lands the transport logs the fully-rendered message
// instead, so recipients, templates, and bookkeeping are all still exercised.

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

async function runNotify(eventId, { type: requestedType, force = false } = {}) {
  if (requestedType && !ALL_NOTIFICATION_TYPES.includes(requestedType)) {
    return { status: 400, body: { error: `Unknown notification type "${requestedType}".` } };
  }

  const bundle = await loadEventBundle(db, eventId);
  if (!bundle) return { status: 404, body: { error: "Catering event not found." } };

  const { event, ref } = bundle;
  const type = requestedType ?? notificationTypeFor(event);
  if (!type) {
    return {
      status: 200,
      body: {
        action: "skipped", eventId,
        reason: `no notification applies to state ${notificationStateOf(event)}`,
      },
    };
  }

  const state = notificationStateOf(event);
  // Idempotency: the same state is not notified twice unless forced. This is
  // what stops the nightly sweep re-sending every night.
  if (!force && !requestedType && event.lastNotifiedStatus === state) {
    return {
      status: 200,
      body: { action: "noop", eventId, reason: "already notified for this state" },
    };
  }

  const opsInbox = process.env.CATERING_OPS_INBOX || null;
  const { to, cc } = recipientsFor(type, event, opsInbox);
  if (to.length === 0) {
    return {
      status: 200,
      body: { action: "skipped", eventId, reason: "event has no planner email to notify" },
    };
  }

  const { subject, body } = renderNotification(type, event, {
    recapUrl: event.recapUrl ?? null,
    appUrl: process.env.CATERING_APP_URL || null,
  });

  const from = process.env.CATERING_FROM_ADDRESS || "UCAR Event Services <noreply@ucar.edu>";
  const transport = transportName();

  if (transport === "gmail") {
    await sendViaGmail({ from, to, cc, subject, body });
  } else {
    // Deliberately loud: this is what "notifications built but not switched on"
    // looks like in the logs.
    console.info(
      `[${SCOPE}] LOG TRANSPORT (gmail.send scope not enabled) — not sent\n` +
      `  type: ${type}\n  to: ${to.join(", ")}\n  cc: ${cc.join(", ") || "—"}\n` +
      `  subject: ${subject}\n---\n${body}\n---`
    );
  }

  await ref.set(
    {
      lastNotifiedStatus: state,
      lastNotifiedAt: FieldValue.serverTimestamp(),
      lastNotifiedType: type,
      lastNotifiedTransport: transport,
    },
    { merge: true }
  );

  return {
    status: 200,
    body: {
      action: transport === "gmail" ? "sent" : "logged",
      eventId, type, transport, to, cc, subject,
    },
  };
}

// ── Recap PDF ────────────────────────────────────────────────────────────────

const PAGE = { width: 595.28, height: 841.89 }; // A4 points
const MARGIN = 48;
const UCAR_SPACE = [1, 24, 55];
const UCAR_AQUA = [0, 162, 180];
const MUTED = [90, 122, 145];

export function renderRecapPdf(recap) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const newPageIfNeeded = (needed) => {
    if (y + needed <= PAGE.height - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  doc.setFillColor(...UCAR_SPACE);
  doc.rect(0, 0, PAGE.width, 76, "F");
  doc.setTextColor(...UCAR_AQUA);
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("UCAR", MARGIN, 34);
  doc.setTextColor(255, 255, 255);
  doc.text("Catering Recap", MARGIN + 46, 34);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(recap.subtitle, MARGIN, 54);
  y = 104;

  doc.setTextColor(...UCAR_SPACE);
  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text(recap.title, MARGIN, y);
  y += 26;

  for (const section of recap.sections) {
    newPageIfNeeded(48);

    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.setTextColor(...UCAR_AQUA);
    doc.text(section.heading.toUpperCase(), MARGIN, y);
    y += 6;
    doc.setDrawColor(...UCAR_AQUA);
    doc.line(MARGIN, y, PAGE.width - MARGIN, y);
    y += 14;

    doc.setFontSize(9.5);
    for (const [label, value] of section.rows) {
      const labelWidth = 150;
      const valueWidth = PAGE.width - MARGIN * 2 - labelWidth;
      const lines = doc.splitTextToSize(String(value), valueWidth);
      const blockHeight = Math.max(lines.length * 12, 12);

      newPageIfNeeded(blockHeight + 6);

      doc.setFont("helvetica", "normal").setTextColor(...MUTED);
      doc.text(String(label), MARGIN, y);
      doc.setTextColor(...UCAR_SPACE);
      doc.text(lines, MARGIN + labelWidth, y);
      y += blockHeight + 4;
    }
    y += 12;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(
      `Generated ${new Date().toISOString().slice(0, 10)} · UCAR Event Services · ${recap.eventId}`,
      MARGIN, PAGE.height - 24
    );
    doc.text(`${p} / ${pages}`, PAGE.width - MARGIN, PAGE.height - 24, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

async function runRecap(eventId) {
  const bundle = await loadEventBundle(db, eventId);
  if (!bundle) return { status: 404, body: { error: "Catering event not found." } };

  const recap = buildRecap(bundle.event, bundle.scheduleDays, bundle.eventRooms);
  const pdf = renderRecapPdf(recap);

  const path = recapStoragePath(eventId);
  const file = getStorage(adminApp).bucket().file(path);
  // A stable download token keeps the URL constant across regenerations.
  const token = `recap-${eventId}`;
  await file.save(pdf, {
    contentType: "application/pdf",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });

  const bucketName = getStorage(adminApp).bucket().name;
  // Sandbox runs against the Storage emulator, which serves downloads from its
  // own host. Production is unaffected.
  const storageOrigin = process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
    : "https://firebasestorage.googleapis.com";
  const recapUrl =
    `${storageOrigin}/v0/b/${bucketName}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`;

  await bundle.ref.set(
    {
      recapUrl,
      recapGeneratedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    status: 200,
    body: {
      action: "generated", eventId, recapUrl,
      sections: recap.sections.length, bytes: pdf.length,
    },
  };
}

// ── Nightly reconciliation ───────────────────────────────────────────────────
// The backstop for every side effect the console fires optimistically. Calls
// the actions above in process rather than over HTTP.

/**
 * True when `uid` holds the administrator role.
 *
 * verifyStaffOrCron() only establishes manager-or-above, which is the right bar
 * for working requests but not for rewriting shared reference data.
 */
async function isAdministrator(uid) {
  if (!uid) return false;
  const snap = await db.collection("user_roles").doc(uid).get();
  return snap.exists && snap.data()?.role === "administrator";
}

// ── Reference data seed ──────────────────────────────────────────────────────
// Buildings and rooms for the intake form's Rooms step. Normally run from a
// terminal (`npm run catering:seed`), but a live project may be administered by
// someone with no local Node install, and an empty room list makes the form
// unusable. Administrator-only, and idempotent: document IDs come from the
// source sheet's room keys and every write is a merge, so re-running converges
// rather than duplicating.

async function runSeedReference(callerUid) {
  const now = FieldValue.serverTimestamp();
  const buildings = buildBuildingDocs(now);
  const rooms = buildRoomDocs(now);

  // Firestore caps a batch at 500 writes; 9 + 44 is comfortably inside one, but
  // chunk anyway so growth in the source sheet cannot silently break this.
  const writes = [
    ...buildings.map((b) => ({ ref: db.collection("buildings").doc(b.id), data: b.data })),
    ...rooms.map((r) => ({ ref: db.collection("rooms").doc(r.id), data: r.data })),
  ];

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + 400)) batch.set(ref, data, { merge: true });
    await batch.commit();
  }

  return {
    status: 200,
    body: {
      action: "seeded",
      buildings: buildings.length,
      rooms: rooms.length,
      // Surfaced rather than logged: a room pointing at an unknown building
      // silently disappears from the form's building filter.
      orphanRooms: orphanRoomBuildings(),
      buildingsWithoutCampus: unmappedBuildings(),
      seededBy: callerUid,
    },
  };
}

// ── Menu catalog seed ─────────────────────────────────────────────────────────
// The structured menu pickers on the intake form's Meals step (Coffee Break to
// start) read the catering_menu_items collection. Kept a separate action from
// seed-reference: buildings/rooms almost never change, but the menu catalog
// grows meal-period by meal-period as menus are handed off, so it needs to be
// re-runnable on its own. Administrator-only, and idempotent — document IDs are
// the source's stable slugs and every write is a merge, so a re-seed after a
// price edit converges rather than duplicating.

async function runSeedMenu(callerUid) {
  const now = FieldValue.serverTimestamp();
  const items = buildMenuItemDocs(now);

  const writes = items.map((i) => ({
    ref: db.collection("catering_menu_items").doc(i.id), data: i.data,
  }));

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + 400)) batch.set(ref, data, { merge: true });
    await batch.commit();
  }

  return {
    status: 200,
    body: { action: "seeded", menuItems: items.length, seededBy: callerUid },
  };
}

async function runReconcile(callerUid) {
  const summary = {
    scanned: 0, notified: 0, revenueRolled: 0, recapsGenerated: 0,
    // Work planned but producing nothing — usually a data problem such as an
    // event with no planner email. Surfaced rather than silently retried.
    skipped: [], failures: [],
  };

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
        const result =
          work.kind === "notify"  ? await runNotify(event.id) :
          work.kind === "revenue" ? await runRollup(event.id, callerUid) :
                                    await runRecap(event.id);

        const action = result.body?.action;
        if (result.status !== 200) {
          summary.failures.push({
            eventId: event.id, kind: work.kind,
            error: result.body?.error || `status ${result.status}`,
          });
        } else if (["skipped", "noop"].includes(action)) {
          summary.skipped.push({ eventId: event.id, kind: work.kind, reason: result.body.reason });
        } else if (work.kind === "notify") {
          summary.notified += 1;
        } else if (work.kind === "revenue") {
          summary.revenueRolled += 1;
        } else {
          summary.recapsGenerated += 1;
        }
      } catch (err) {
        // One bad event must not abort the sweep.
        summary.failures.push({
          eventId: event.id, kind: work.kind, error: String(err.message || err),
        });
      }
    }
  }

  if (summary.scanned === MAX_EVENTS) {
    summary.truncated = `Stopped at the ${MAX_EVENTS}-event cap; run again or raise MAX_EVENTS.`;
  }

  console.info(`[${SCOPE}] reconcile`, JSON.stringify(summary));
  return { status: 200, body: summary };
}

// ── Router ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let caller;
  try {
    caller = await verifyStaffOrCron(adminApp, db, req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  // The cron hits this as GET with a query string; the app posts a JSON body.
  const action = req.body?.action ?? req.query?.action;
  if (!ACTIONS.includes(action)) {
    return res.status(400).json({
      error: `A valid action is required. Expected one of: ${ACTIONS.join(", ")}.`,
    });
  }

  try {
    if (action === "reconcile") {
      const { status, body } = await runReconcile(caller.uid);
      return res.status(status).json(body);
    }

    if (action === "seed-reference" || action === "seed-menu") {
      // Stricter than the rest: these rewrite shared reference data, so
      // manager-or-above is not enough, and the cron has no business doing it.
      if (caller.viaCron || !(await isAdministrator(caller.uid))) {
        return res.status(403).json({ error: "Administrator access required." });
      }
      const { status, body } = action === "seed-menu"
        ? await runSeedMenu(caller.uid)
        : await runSeedReference(caller.uid);
      return res.status(status).json(body);
    }

    const eventId = req.body?.eventId ?? req.query?.eventId;
    if (!eventId || typeof eventId !== "string" || !EVENT_ID_RE.test(eventId)) {
      return res.status(400).json({ error: "A valid eventId is required." });
    }

    const { status, body } =
      action === "rollup" ? await runRollup(eventId, caller.uid) :
      action === "notify" ? await runNotify(eventId, { type: req.body?.type, force: req.body?.force }) :
                            await runRecap(eventId);

    return res.status(status).json(body);
  } catch (err) {
    return respondWithInternalError(res, SCOPE, err);
  }
}
