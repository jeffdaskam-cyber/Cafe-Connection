import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeDriveQueryValue,
  isValidStorageUrl,
  firebasePrivateKey,
} from "../api/_lib/serverless.mjs";

test("escapeDriveQueryValue escapes single quotes for Drive queries", () => {
  assert.equal(escapeDriveQueryValue("Mesa Lab's Weekly"), "Mesa Lab\\'s Weekly");
});

test("isValidStorageUrl only allows Firebase Storage URLs from the configured bucket", () => {
  assert.equal(
    isValidStorageUrl(
      "https://firebasestorage.googleapis.com/v0/b/my-bucket/o/reports%2Ffoo.pdf?alt=media",
      "my-bucket"
    ),
    true
  );
  assert.equal(
    isValidStorageUrl(
      "https://example.com/v0/b/my-bucket/o/reports%2Ffoo.pdf?alt=media",
      "my-bucket"
    ),
    false
  );
  assert.equal(
    isValidStorageUrl(
      "https://firebasestorage.googleapis.com/v0/b/other-bucket/o/reports%2Ffoo.pdf?alt=media",
      "my-bucket"
    ),
    false
  );
});

test("isValidStorageUrl fails closed when no allowed bucket is configured", () => {
  // The second argument is required. Callers that omit it (or run with
  // ALLOWED_STORAGE_BUCKET unset) get a rejection, never a pass-through.
  const url = "https://firebasestorage.googleapis.com/v0/b/my-bucket/o/reports%2Ffoo.pdf?alt=media";
  assert.equal(isValidStorageUrl(url), false);
  assert.equal(isValidStorageUrl(url, undefined), false);
  assert.equal(isValidStorageUrl(url, ""), false);
});

test("isValidStorageUrl rejects malformed URLs instead of throwing", () => {
  assert.equal(isValidStorageUrl("not-a-url", "my-bucket"), false);
  assert.equal(isValidStorageUrl("", "my-bucket"), false);
});

test("firebasePrivateKey restores embedded newlines from env formatting", () => {
  assert.equal(firebasePrivateKey("line1\\nline2"), "line1\nline2");
});
