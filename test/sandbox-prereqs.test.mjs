/**
 * Guards the `npm run sandbox` preflight against drifting out of step with the
 * emulator requirements it exists to check for.
 *
 * These are source assertions rather than behavioral ones for the same reason
 * as sandbox-runner.test.mjs: checkSandboxPrereqs.mjs runs its checks and exits
 * at import time, so it cannot be imported and called. What is worth pinning is
 * that the check is still there and still agrees with firebase-tools.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = resolve(import.meta.dirname, "..");
const prereqsSource = readFileSync(resolve(ROOT, "scripts/checkSandboxPrereqs.mjs"), "utf8");

// The file's comments name the versions being guarded against, `default-jre`
// among them. Strip them so the assertions read code, not prose. The [^:] guard
// keeps `https://` in the install hints from looking like a line comment.
const prereqs = prereqsSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const declaredMinJava = Number(/MIN_JAVA_MAJOR = (\d+)/.exec(prereqs)?.[1]);

test("the preflight checks the Java version, not just that java exists", () => {
  // firebase-tools 15 throws below Java 21, so a presence-only check would let
  // Java 17 through here and fail deep inside the emulator instead.
  assert.ok(
    Number.isInteger(declaredMinJava),
    "checkSandboxPrereqs.mjs must declare a MIN_JAVA_MAJOR to compare against"
  );
  assert.match(prereqs, /javaMajor < MIN_JAVA_MAJOR/);
});

test("the preflight's Java minimum matches what firebase-tools enforces", () => {
  // Reaching into firebase-tools' internals, so treat an unreadable file as
  // "cannot check" rather than failing — the assertion above still holds.
  let commandUtils;
  try {
    commandUtils = readFileSync(
      resolve(ROOT, "node_modules/firebase-tools/lib/emulator/commandUtils.js"),
      "utf8"
    );
  } catch {
    return;
  }

  const enforced = Number(
    /MIN_SUPPORTED_JAVA_MAJOR_VERSION = (\d+)/.exec(commandUtils)?.[1]
  );
  if (!Number.isInteger(enforced)) return;

  assert.equal(
    declaredMinJava,
    enforced,
    `firebase-tools now requires Java ${enforced}; update MIN_JAVA_MAJOR and the ` +
      "install hints in scripts/checkSandboxPrereqs.mjs to match"
  );
});

test("the Linux install hint names a JRE new enough to work", () => {
  // `default-jre` is Java 11 on Ubuntu 22.04 — following that hint would install
  // a JRE the emulators reject.
  assert.doesNotMatch(prereqs, /default-jre/);
  assert.match(prereqs, new RegExp(`openjdk-${declaredMinJava}-jre`));
});
