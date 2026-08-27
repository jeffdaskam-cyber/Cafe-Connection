/**
 * Guards the whole api/ surface against ESM/CommonJS resolution breaks.
 *
 * The host's Node runtime does not implement `require(esm)`. Local Node 22 does,
 * and enables it by default, so a dependency that makes a CommonJS module
 * `require()` an ESM-only package loads fine on a developer machine and then
 * crashes every function on deploy with ERR_REQUIRE_ESM. That is not a handler
 * bug and no unit test touches it, so it reaches production unseen — which is
 * how firebase-admin 14 (jwks-rsa 4 -> jose 6, ESM-only) took out every endpoint.
 *
 * Each handler is imported in a child process started with
 * --no-experimental-require-module, which turns the host's missing capability
 * into a local failure. Import alone is the point: these modules read config and
 * build their Admin app at module scope, so a load failure is a dead endpoint.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const apiDir = fileURLToPath(new URL("../api/", import.meta.url));

// cert() parses the private key while the module is still loading, so a
// placeholder string will not do. This throwaway pair is generated per run and
// never leaves the process; nothing authenticates with it.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// Enough to satisfy the top-level requireEnv() calls. The values are never used
// against a real service; the handler only has to finish loading.
const env = {
  ...process.env,
  FIREBASE_ADMIN_PROJECT_ID: "test-project",
  FIREBASE_ADMIN_CLIENT_EMAIL: "service-account@test-project.iam.gserviceaccount.com",
  // Stored the way Vercel stores it: real newlines escaped, as firebasePrivateKey() expects.
  FIREBASE_ADMIN_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  ALLOWED_STORAGE_BUCKET: "test-project.firebasestorage.app",
  FIREBASE_STORAGE_BUCKET: "test-project.firebasestorage.app",
  CRON_SECRET: "test-cron-secret-long-enough-to-pass",
  INVITE_APP_URL: "http://localhost:5173",
  CATERING_APP_URL: "http://localhost:5173",
  GOOGLE_SCHEDULE_FOLDER_ID: "folder-schedule",
  GOOGLE_SPECIALS_FOLDER_ID: "folder-specials",
  GOOGLE_EVENT_REPORTS_FOLDER_ID: "folder-event-reports",
  GOOGLE_SETUP_REPORT_FOLDER_ID: "folder-setup-report",
  GMAIL_CLIENT_ID: "client-id",
  GMAIL_CLIENT_SECRET: "client-secret",
  GMAIL_REFRESH_TOKEN: "refresh-token",
};

// Handlers only: api/_lib/ is covered through whatever imports it.
const handlers = readdirSync(apiDir)
  .filter((name) => name.endsWith(".js") || name.endsWith(".mjs"))
  .sort();

test("there are handlers to check", () => {
  assert.ok(handlers.length > 0, "no handlers found in api/");
});

for (const handler of handlers) {
  test(`api/${handler} loads without require(esm)`, async () => {
    await execFileAsync(
      process.execPath,
      ["--no-experimental-require-module", "--input-type=module", "-e", `await import("${apiDir}${handler}")`],
      { env, timeout: 60000 }
    );
  });
}
