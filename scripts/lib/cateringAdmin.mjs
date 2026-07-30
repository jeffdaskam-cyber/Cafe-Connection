/**
 * Shared Admin SDK bootstrap and CSV loading for the catering scripts.
 *
 * Sandbox-first: if FIRESTORE_EMULATOR_HOST is set, the Admin SDK talks to the
 * local emulator and no service-account credentials are needed or used. Running
 * against a real project requires the FIREBASE_ADMIN_* vars the rest of the
 * repo already uses, and prompts before writing.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import admin from "firebase-admin";

import { parseCsv } from "./csv.mjs";

export const DATA_DIR = resolve(process.cwd(), "data/catering");

export function isEmulator() {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

/** Initialize the Admin SDK once, against the emulator or a real project. */
export function initAdmin() {
  try {
    return admin.app();
  } catch {
    // not initialized yet
  }

  if (isEmulator()) {
    return admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-cafe-connection",
    });
  }

  const required = [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}.\n` +
        "Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 to run against the local " +
        "sandbox instead, which needs no credentials."
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

/**
 * Load one export CSV from data/catering/. That directory is git-ignored — the
 * AppSheet export carries staff names, emails, and phone numbers and this is a
 * public repository. See docs/catering/SEED_AND_MIGRATION.md.
 */
export function loadCsv(filename) {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}\n` +
        "Export the tab from the 'UCAR Summit Data Sheet' as CSV into " +
        "data/catering/. See docs/catering/SEED_AND_MIGRATION.md for the " +
        "expected filenames and columns."
    );
  }
  return parseCsv(readFileSync(path, "utf8"));
}

/** Guard destructive writes against a real (non-emulator) project. */
export function assertWriteAllowed() {
  if (isEmulator()) return;
  if (process.env.CATERING_ALLOW_PRODUCTION_WRITE === "true") return;
  throw new Error(
    "Refusing to write to a live Firebase project.\n" +
      "Run against the emulator (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080), or " +
      "set CATERING_ALLOW_PRODUCTION_WRITE=true if this is a deliberate " +
      "production seed."
  );
}

/** Commit docs in chunks — Firestore batches cap at 500 writes. */
export async function commitInBatches(db, writes, batchSize = 400) {
  for (let i = 0; i < writes.length; i += batchSize) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + batchSize)) {
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  }
}
