/**
 * rewrite-storage-urls.mjs — repoint persisted Firebase Storage download URLs
 * at a new project's bucket after a project migration (see MIGRATION.md § B6).
 *
 * Only needed for Option B (new project + data migration). Option A (ownership
 * transfer) leaves buckets and download URLs untouched.
 *
 * How Firebase download URLs work: the URL is
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<enc-path>?alt=media&token=<token>
 * where <token> comes from the object's own `firebaseStorageDownloadTokens`
 * custom metadata. The token is per-object, not per-project, so:
 *   - if the copy preserved custom metadata, the existing token stays valid in
 *     the new bucket and only the host/bucket segment needs to change;
 *   - if it did not, a token must be minted and written to the object.
 * This script handles both: it reads the object's metadata, reuses the token if
 * present, mints one if not, and rebuilds the URL. That is why it is not a
 * plain hostname string-replace — a swap alone can leave a URL whose token
 * matches no metadata, which 403s.
 *
 * Targets `event_orders.downloadURL` — the only field in the schema that
 * persists a Storage URL (written by src/firebase/uploads.js
 * `uploadEventOrder` and api/ingest-email-orders.mjs `writeEventOrderDoc`).
 * `fpa_uploads` and `event_revenue` store filenames and metrics only. Also
 * reports, without touching, any `vendor_links` URL pointing at the old bucket,
 * since those fields are admin-entered and may hold a pasted Storage URL.
 *
 * Run AFTER the Firestore import and the Storage copy have both completed, with
 * credentials pointing at the NEW project.
 *
 * Usage:
 *   export FIREBASE_ADMIN_PROJECT_ID=<new-project-id>
 *   export FIREBASE_ADMIN_CLIENT_EMAIL=<new-service-account-email>
 *   export FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
 *   export OLD_STORAGE_BUCKET=<old-project>.firebasestorage.app
 *   export NEW_STORAGE_BUCKET=<new-project>.firebasestorage.app
 *
 *   node scripts/rewrite-storage-urls.mjs           # dry run (default)
 *   node scripts/rewrite-storage-urls.mjs --apply   # write changes
 */

import { randomUUID } from "node:crypto";

const STORAGE_HOST = "firebasestorage.googleapis.com";

/**
 * Pull the object path out of a Firebase Storage download URL, but only if the
 * URL points at `expectedBucket`. Returns null otherwise.
 */
export function objectPathFromUrl(url, expectedBucket) {
  if (typeof url !== "string" || !expectedBucket) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== STORAGE_HOST) return null;

  const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) return null;

  const [, urlBucket, encodedPath] = match;
  if (urlBucket !== expectedBucket) return null;

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

/** Build the canonical Firebase Storage download URL for an object. */
export function buildDownloadUrl(bucketName, objectPath, token) {
  return (
    `https://${STORAGE_HOST}/v0/b/${bucketName}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media&token=${token}`
  );
}

/** Read the first download token from an object's metadata, or null. */
export function tokenFromMetadata(metadata) {
  const raw = metadata?.metadata?.firebaseStorageDownloadTokens;
  if (typeof raw !== "string" || !raw) return null;
  return raw.split(",")[0] || null;
}

/**
 * Resolve a working download URL for `objectPath` in `bucket`, reusing the
 * object's existing token or minting one. Mints only when `apply` is true, so a
 * dry run never mutates Storage metadata.
 */
async function resolveDownloadUrl(bucket, objectPath, apply) {
  const file = bucket.file(objectPath);

  const [exists] = await file.exists();
  if (!exists) return { error: "object missing in new bucket" };

  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (err) {
    return { error: `could not read metadata: ${err.message}` };
  }

  const existing = tokenFromMetadata(metadata);
  if (existing) {
    return { url: buildDownloadUrl(bucket.name, objectPath, existing), tokenSource: "preserved" };
  }

  const token = randomUUID();
  if (apply) {
    try {
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    } catch (err) {
      return { error: `could not write download token: ${err.message}` };
    }
  }
  return { url: buildDownloadUrl(bucket.name, objectPath, token), tokenSource: "minted" };
}

async function rewriteEventOrders(db, bucket, oldBucket, apply) {
  const snap = await db.collection("event_orders").get();
  const stats = { scanned: snap.size, rewritten: 0, skipped: 0, failed: 0, minted: 0, preserved: 0 };
  const failures = [];

  for (const doc of snap.docs) {
    const objectPath = objectPathFromUrl(doc.get("downloadURL"), oldBucket);
    if (!objectPath) {
      stats.skipped++;
      continue;
    }

    const { url, error, tokenSource } = await resolveDownloadUrl(bucket, objectPath, apply);
    if (error) {
      stats.failed++;
      failures.push({ id: doc.id, objectPath, error });
      console.warn(`  ! ${doc.id} — ${objectPath}: ${error}`);
      continue;
    }

    if (apply) {
      const { FieldValue } = await import("firebase-admin/firestore");
      await doc.ref.update({
        downloadURL: url,
        migratedFromBucket: oldBucket,
        migratedAt: FieldValue.serverTimestamp(),
      });
    }

    stats.rewritten++;
    stats[tokenSource === "minted" ? "minted" : "preserved"]++;
    console.log(`  ${apply ? "✓" : "→"} ${doc.id} — ${objectPath} (token ${tokenSource})`);
  }

  return { stats, failures };
}

/** Report-only: vendor_links fields are admin-entered and may hold pasted Storage URLs. */
async function reportVendorLinks(db, oldBucket) {
  const snap = await db.collection("vendor_links").get();
  const hits = [];

  for (const doc of snap.docs) {
    for (const field of ["logoUrl", "url"]) {
      const value = doc.get(field);
      if (objectPathFromUrl(value, oldBucket)) hits.push({ id: doc.id, field, value });
    }
  }
  return hits;
}

async function main() {
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getStorage } = await import("firebase-admin/storage");
  const { getAdminApp, requireEnv } = await import("../api/_lib/serverless.mjs");

  const SCOPE = "rewrite-storage-urls";
  const apply = process.argv.includes("--apply");

  requireEnv(SCOPE, process.env, [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
    "OLD_STORAGE_BUCKET",
    "NEW_STORAGE_BUCKET",
  ]);

  const oldBucket = process.env.OLD_STORAGE_BUCKET;
  const newBucket = process.env.NEW_STORAGE_BUCKET;

  if (oldBucket === newBucket) {
    console.error(`[${SCOPE}] OLD_STORAGE_BUCKET and NEW_STORAGE_BUCKET are identical — nothing to do.`);
    process.exit(1);
  }

  const app = getAdminApp(process.env, SCOPE, { storageBucketEnvVar: "NEW_STORAGE_BUCKET" });
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(newBucket);

  console.log(`[${SCOPE}] ${apply ? "APPLY" : "DRY RUN — no changes are written"}`);
  console.log(`[${SCOPE}] ${oldBucket} → ${newBucket}`);
  console.log(`[${SCOPE}] Firestore project: ${process.env.FIREBASE_ADMIN_PROJECT_ID}\n`);

  console.log("event_orders.downloadURL:");
  const { stats, failures } = await rewriteEventOrders(db, bucket, oldBucket, apply);
  console.log(
    `\n  scanned ${stats.scanned} · ${apply ? "rewritten" : "to rewrite"} ${stats.rewritten} ` +
      `(${stats.preserved} token preserved, ${stats.minted} minted) · ` +
      `skipped ${stats.skipped} (not an old-bucket URL) · failed ${stats.failed}`
  );

  const vendorHits = await reportVendorLinks(db, oldBucket);
  if (vendorHits.length) {
    console.log(`\nvendor_links — ${vendorHits.length} old-bucket URL(s), NOT modified (fix by hand):`);
    for (const hit of vendorHits) console.log(`  · ${hit.id}.${hit.field} = ${hit.value}`);
  } else {
    console.log("\nvendor_links: no old-bucket URLs found.");
  }

  if (failures.length) {
    console.log(`\n${failures.length} document(s) could not be rewritten:`);
    for (const f of failures) console.log(`  · ${f.id} (${f.objectPath}): ${f.error}`);
    console.log("\nUsually means the Storage copy is incomplete — re-run it, then re-run this script.");
  }

  if (!apply && stats.rewritten > 0) {
    console.log("\nRe-run with --apply to write these changes.");
  }

  process.exit(failures.length ? 1 : 0);
}

// Only run when executed directly, so tests can import the pure helpers above.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("[rewrite-storage-urls] Fatal:", err);
    process.exit(1);
  });
}
