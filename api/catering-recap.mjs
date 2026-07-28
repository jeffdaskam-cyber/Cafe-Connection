// api/catering-recap.mjs
// Vercel Serverless Function — Cafe Connection / Catering Companion
//
// Renders an event recap PDF, stores it, and records the URL on the event.
//
// POST /api/catering-recap
// Body: { eventId: string }
// Auth: manager-and-above Firebase ID token, or CRON_SECRET.
//
// The recap is built only from the event's own stored fields, so it cannot
// drift from the source data — see api/_lib/cateringRecap.mjs.
// Idempotent: the storage path is derived from the event ID, so regenerating
// overwrites in place.

import admin from "firebase-admin";
import { jsPDF } from "jspdf";

import { respondWithError, respondWithInternalError } from "./_lib/serverless.mjs";
import { initCateringAdmin, loadEventBundle, verifyStaffOrCron } from "./_lib/cateringAdminApp.mjs";
import { buildRecap, recapStoragePath } from "./_lib/cateringRecap.mjs";

const SCOPE = "catering-recap";
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const adminApp = initCateringAdmin(SCOPE, { storageBucketEnvVar: "FIREBASE_STORAGE_BUCKET" });
const db = adminApp.firestore();

// ── Layout ───────────────────────────────────────────────────────────────────
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

  // Header
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

  // Footer on every page
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyStaffOrCron(adminApp, db, req);
  } catch (err) {
    return respondWithError(res, err, 401);
  }

  const { eventId } = req.body || {};
  if (!eventId || typeof eventId !== "string" || !EVENT_ID_RE.test(eventId)) {
    return res.status(400).json({ error: "A valid eventId is required." });
  }

  try {
    const bundle = await loadEventBundle(db, eventId);
    if (!bundle) return res.status(404).json({ error: "Catering event not found." });

    const recap = buildRecap(bundle.event, bundle.scheduleDays, bundle.eventRooms);
    const pdf = renderRecapPdf(recap);

    const path = recapStoragePath(eventId);
    const file = adminApp.storage().bucket().file(path);
    // A stable download token keeps the URL constant across regenerations.
    const token = `recap-${eventId}`;
    await file.save(pdf, {
      contentType: "application/pdf",
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      resumable: false,
    });

    const bucketName = adminApp.storage().bucket().name;
    // Sandbox runs against the Storage emulator, which serves downloads from
    // its own host. Production is unaffected.
    const storageOrigin = process.env.FIREBASE_STORAGE_EMULATOR_HOST
      ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
      : "https://firebasestorage.googleapis.com";
    const recapUrl =
      `${storageOrigin}/v0/b/${bucketName}/o/` +
      `${encodeURIComponent(path)}?alt=media&token=${token}`;

    await bundle.ref.set(
      {
        recapUrl,
        recapGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({
      action: "generated", eventId, recapUrl,
      sections: recap.sections.length,
      bytes: pdf.length,
    });
  } catch (err) {
    return respondWithInternalError(res, SCOPE, err);
  }
}
