import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDownloadUrl,
  objectPathFromUrl,
  tokenFromMetadata,
} from "../scripts/rewrite-storage-urls.mjs";

const OLD = "old-project.firebasestorage.app";
const NEW = "new-project.firebasestorage.app";

test("objectPathFromUrl extracts and decodes the object path for the expected bucket", () => {
  assert.equal(
    objectPathFromUrl(
      `https://firebasestorage.googleapis.com/v0/b/${OLD}/o/event_orders%2F123_order.pdf?alt=media&token=abc`,
      OLD
    ),
    "event_orders/123_order.pdf"
  );
});

test("objectPathFromUrl decodes spaces and nested report paths", () => {
  assert.equal(
    objectPathFromUrl(
      `https://firebasestorage.googleapis.com/v0/b/${OLD}/o/reports%2FMesa_Lab%2F17_daily%20sales.pdf?alt=media`,
      OLD
    ),
    "reports/Mesa_Lab/17_daily sales.pdf"
  );
});

test("objectPathFromUrl ignores URLs already pointing at another bucket", () => {
  assert.equal(
    objectPathFromUrl(
      `https://firebasestorage.googleapis.com/v0/b/${NEW}/o/event_orders%2F1.pdf?alt=media`,
      OLD
    ),
    null
  );
});

test("objectPathFromUrl rejects non-Storage hosts, junk, and empty input", () => {
  assert.equal(objectPathFromUrl(`https://evil.example.com/v0/b/${OLD}/o/x.pdf`, OLD), null);
  assert.equal(objectPathFromUrl("not-a-url", OLD), null);
  assert.equal(objectPathFromUrl("", OLD), null);
  assert.equal(objectPathFromUrl(undefined, OLD), null);
  assert.equal(objectPathFromUrl(null, OLD), null);
  assert.equal(objectPathFromUrl(42, OLD), null);
});

test("objectPathFromUrl returns null when no expected bucket is supplied", () => {
  assert.equal(
    objectPathFromUrl(`https://firebasestorage.googleapis.com/v0/b/${OLD}/o/x.pdf`, undefined),
    null
  );
});

test("objectPathFromUrl rejects a Storage host with no object segment", () => {
  assert.equal(objectPathFromUrl(`https://firebasestorage.googleapis.com/v0/b/${OLD}/o/`, OLD), null);
});

test("buildDownloadUrl round-trips through objectPathFromUrl", () => {
  const path = "reports/Mesa_Lab/1700000000_daily sales.pdf";
  const url = buildDownloadUrl(NEW, path, "tok-123");
  assert.equal(objectPathFromUrl(url, NEW), path);
  assert.match(url, /[?&]token=tok-123$/);
  assert.match(url, /[?&]alt=media/);
});

test("buildDownloadUrl output passes the API's own isValidStorageUrl check", async () => {
  const { isValidStorageUrl } = await import("../api/_lib/serverless.mjs");
  assert.equal(isValidStorageUrl(buildDownloadUrl(NEW, "fpa_uploads/1_x.xlsx", "t"), NEW), true);
});

test("tokenFromMetadata reads the first token and handles absence", () => {
  assert.equal(
    tokenFromMetadata({ metadata: { firebaseStorageDownloadTokens: "tok-a,tok-b" } }),
    "tok-a"
  );
  assert.equal(tokenFromMetadata({ metadata: { firebaseStorageDownloadTokens: "solo" } }), "solo");
  assert.equal(tokenFromMetadata({ metadata: { firebaseStorageDownloadTokens: "" } }), null);
  assert.equal(tokenFromMetadata({ metadata: {} }), null);
  assert.equal(tokenFromMetadata({}), null);
  assert.equal(tokenFromMetadata(undefined), null);
});
