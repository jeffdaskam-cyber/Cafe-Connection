// api/ingest-email-orders.mjs
// Vercel Serverless Function — Cafe Connection
// Polls cafe-connection@ucar.edu Gmail inbox once daily.
// Downloads PDF attachments from unread, unprocessed emails,
// uploads to Firebase Storage, writes to Firestore event_orders collection.
//
// GET /api/ingest-email-orders
// Secured by CRON_SECRET (Vercel cron) or Firebase ID token (manual trigger).

import admin from "firebase-admin";

// ─── Firebase Admin Init (singleton) ────────────────────────────────────────
let adminApp;
try {
  adminApp = admin.app();
} catch {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const db      = admin.firestore();
const bucket  = admin.storage().bucket();

// ─── Auth check — accepts cron secret OR Firebase ID token ───────────────────
async function verifyRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const err = new Error("Unauthorized"); err.status = 401; throw err;
  }
  const token = authHeader.slice(7);

  // Vercel cron invocation
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return;

  // Authenticated user invocation — verify Firebase ID token
  await adminApp.auth().verifyIdToken(token);
}

// ─── Gmail OAuth token exchange ───────────────────────────────────────────────
async function getGmailAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Gmail OAuth error: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

// Search for unread messages that have attachments and are not yet processed.
async function listUnprocessedMessages(token) {
  const query = "is:unread has:attachment -label:cafe-connection-processed";
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail list error: ${data.error.message}`);
  return data.messages || [];
}

// Fetch full message to inspect parts and attachments.
async function getMessage(token, messageId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail get message error: ${data.error.message}`);
  return data;
}

// Download attachment bytes by attachmentId.
async function getAttachment(token, messageId, attachmentId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail attachment error: ${data.error.message}`);
  // Gmail returns base64url encoded data — convert to standard base64 then to Buffer
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

// Get or create the cafe-connection-processed label ID.
async function getProcessedLabelId(token) {
  const res  = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail labels error: ${data.error.message}`);
  const label = (data.labels || []).find(l => l.name === "cafe-connection-processed");
  if (!label) throw new Error("Gmail label 'cafe-connection-processed' not found. Please create it manually in Gmail first.");
  return label.id;
}

// Apply the processed label and mark as read.
async function markProcessed(token, messageId, labelId) {
  const url  = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
  const res  = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addLabelIds:    [labelId],
      removeLabelIds: ["UNREAD"],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail modify error: ${data.error.message}`);
}

// ─── Extract PDF parts from a message recursively ────────────────────────────
function extractPdfParts(parts) {
  const pdfs = [];
  for (const part of parts || []) {
    if (part.parts) {
      pdfs.push(...extractPdfParts(part.parts));
    }
    if (
      part.mimeType === "application/pdf" ||
      (part.filename && part.filename.toLowerCase().endsWith(".pdf"))
    ) {
      if (part.body?.attachmentId) {
        pdfs.push({
          filename:     part.filename || `attachment-${Date.now()}.pdf`,
          attachmentId: part.body.attachmentId,
        });
      }
    }
  }
  return pdfs;
}

// ─── Firestore duplicate check ────────────────────────────────────────────────
async function fileNameExists(fileName) {
  const snapshot = await db
    .collection("event_orders")
    .where("fileName", "==", fileName)
    .limit(1)
    .get();
  return !snapshot.empty;
}

// ─── Firebase Storage upload ──────────────────────────────────────────────────
async function uploadToStorage(fileName, buffer) {
  const destination = `event_orders/${fileName}`;
  const file        = bucket.file(destination);

  await file.save(buffer, {
    metadata: { contentType: "application/pdf" },
    resumable: false,
  });

  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${destination}`;
}

// ─── Firestore write ──────────────────────────────────────────────────────────
async function writeEventOrderDoc(fileName, downloadURL, size) {
  await db.collection("event_orders").add({
    fileName,
    downloadURL,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    size,
    source: "email",
  });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    await verifyRequest(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const results = { processed: 0, skipped: 0, errors: [] };

  try {
    const token        = await getGmailAccessToken();
    const labelId      = await getProcessedLabelId(token);
    const messages     = await listUnprocessedMessages(token);

    console.log(`[ingest-email-orders] Found ${messages.length} candidate message(s)`);

    for (const { id: messageId } of messages) {
      let message;
      try {
        message = await getMessage(token, messageId);
      } catch (err) {
        results.errors.push({ messageId, error: err.message });
        continue;
      }

      const pdfParts = extractPdfParts(message.payload?.parts);

      if (pdfParts.length === 0) {
        // No PDF attachments — mark processed so we don't revisit
        await markProcessed(token, messageId, labelId);
        console.log(`[ingest-email-orders] Message ${messageId}: no PDF attachments, marking processed`);
        continue;
      }

      let anyPdfProcessed = false;

      for (const { filename, attachmentId } of pdfParts) {
        try {
          // Duplicate check
          if (await fileNameExists(filename)) {
            console.log(`[ingest-email-orders] Skipping duplicate: ${filename}`);
            results.skipped++;
            continue;
          }

          const buffer      = await getAttachment(token, messageId, attachmentId);
          const downloadURL = await uploadToStorage(filename, buffer);
          await writeEventOrderDoc(filename, downloadURL, buffer.length);

          console.log(`[ingest-email-orders] Ingested: ${filename} (${buffer.length} bytes)`);
          results.processed++;
          anyPdfProcessed = true;
        } catch (err) {
          console.error(`[ingest-email-orders] Error processing ${filename}:`, err);
          results.errors.push({ filename, error: err.message });
        }
      }

      // Mark the email processed regardless — even if all PDFs were duplicates,
      // we don't want to re-check this message on subsequent runs.
      try {
        await markProcessed(token, messageId, labelId);
      } catch (err) {
        console.error(`[ingest-email-orders] Failed to label message ${messageId}:`, err);
      }
    }

    console.log(`[ingest-email-orders] Done. Processed: ${results.processed}, Skipped: ${results.skipped}, Errors: ${results.errors.length}`);
    return res.status(200).json({ success: true, ...results });

  } catch (err) {
    console.error("[ingest-email-orders] Fatal error:", err);
    return res.status(500).json({ error: err.message || "Internal server error", ...results });
  }
}
