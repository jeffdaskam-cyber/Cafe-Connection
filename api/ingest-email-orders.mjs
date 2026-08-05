// api/ingest-email-orders.mjs
// Vercel Serverless Function � Cafe Connection
// Polls cafe-connection@ucar.edu Gmail inbox once daily.
// Downloads PDF attachments from unread, unprocessed emails,
// uploads to Firebase Storage, writes to Firestore event_orders collection.
//
// GET /api/ingest-email-orders
// Secured by CRON_SECRET (Vercel cron) or Firebase ID token (manual trigger).

import { randomUUID } from "crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  createHttpError,
  fetchWithTimeout,
  getAdminApp,
  requireEnv,
  respondWithInternalError,
} from "./_lib/serverless.mjs";

const REQUIRED_ENV = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "FIREBASE_STORAGE_BUCKET",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
];
requireEnv("ingest-email-orders", process.env, REQUIRED_ENV);

const adminApp = getAdminApp(process.env, "ingest-email-orders", {
  storageBucketEnvVar: "FIREBASE_STORAGE_BUCKET",
});
const db = getFirestore();
const bucket = getStorage().bucket();

async function verifyRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw createHttpError("Unauthorized", 401);
  }

  const token = authHeader.slice(7);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return;

  const decoded = await getAuth(adminApp).verifyIdToken(token);
  const roleDoc = await db.collection("user_roles").doc(decoded.uid).get();
  if (roleDoc.data()?.role !== "administrator") {
    throw createHttpError("Forbidden", 403);
  }
}

async function getGmailAccessToken() {
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

async function listUnprocessedMessages(token) {
  const query = "is:unread has:attachment -label:cafe-connection-processed";
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail list request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Gmail list error: ${data.error.message}`);
  return data.messages || [];
}

async function getMessage(token, messageId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail get message request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Gmail get message error: ${data.error.message}`);
  return data;
}

async function getAttachment(token, messageId, attachmentId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail attachment request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Gmail attachment error: ${data.error.message}`);
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

async function getProcessedLabelId(token) {
  const res = await fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail labels request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Gmail labels error: ${data.error.message}`);
  const label = (data.labels || []).find((entry) => entry.name === "cafe-connection-processed");
  if (!label) {
    throw new Error("Gmail label 'cafe-connection-processed' not found. Please create it manually in Gmail first.");
  }
  return label.id;
}

async function markProcessed(token, messageId, labelId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addLabelIds: [labelId],
      removeLabelIds: ["UNREAD"],
    }),
  });
  if (!res.ok) throw new Error(`Gmail modify request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Gmail modify error: ${data.error.message}`);
}

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
          filename: part.filename || `attachment-${Date.now()}.pdf`,
          attachmentId: part.body.attachmentId,
        });
      }
    }
  }
  return pdfs;
}

async function fileNameExists(fileName) {
  const snapshot = await db
    .collection("event_orders")
    .where("fileName", "==", fileName)
    .limit(1)
    .get();
  return !snapshot.empty;
}

async function uploadToStorage(fileName, buffer) {
  const destination = `event_orders/${fileName}`;
  const file = bucket.file(destination);

  // Mint a Firebase download token so the file is reachable only via an
  // unguessable, token-scoped URL — the same scheme the client upload path
  // gets from getDownloadURL(). Do NOT makePublic(): a public ACL bypasses
  // Storage security rules and exposes event-order PDFs to anyone with the URL.
  const downloadToken = randomUUID();
  await file.save(buffer, {
    metadata: {
      contentType: "application/pdf",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
    resumable: false,
  });

  const encodedPath = encodeURIComponent(destination);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

async function writeEventOrderDoc(fileName, downloadURL, size) {
  await db.collection("event_orders").add({
    fileName,
    downloadURL,
    uploadedAt: FieldValue.serverTimestamp(),
    size,
    source: "email",
  });
}

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
    const token = await getGmailAccessToken();
    const labelId = await getProcessedLabelId(token);
    const messages = await listUnprocessedMessages(token);

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
        await markProcessed(token, messageId, labelId);
        continue;
      }

      for (const { filename, attachmentId } of pdfParts) {
        try {
          if (await fileNameExists(filename)) {
            results.skipped++;
            continue;
          }

          const buffer = await getAttachment(token, messageId, attachmentId);
          const downloadURL = await uploadToStorage(filename, buffer);
          await writeEventOrderDoc(filename, downloadURL, buffer.length);
          results.processed++;
        } catch (err) {
          console.error(`[ingest-email-orders] Error processing ${filename}:`, err);
          results.errors.push({ filename, error: err.message });
        }
      }

      try {
        await markProcessed(token, messageId, labelId);
      } catch (err) {
        console.error(`[ingest-email-orders] Failed to label message ${messageId}:`, err);
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    return respondWithInternalError(res, "ingest-email-orders", err, results);
  }
}
