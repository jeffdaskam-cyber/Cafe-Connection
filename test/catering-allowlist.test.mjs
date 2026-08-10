/**
 * Unit tests for the Catering Companion pilot allowlist.
 *
 * The security boundary is `cateringAllowed()` in firestore.rules, covered by
 * test/catering-rules.test.mjs. These cover the UI-side matching, whose job is
 * to agree with the rules so the interface never offers an action the database
 * will refuse.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { isAllowed, parseAllowlist } from "../src/catering/allowlist.js";

test("parseAllowlist splits, trims, and lowercases", () => {
  assert.deepEqual(
    parseAllowlist("Jdaskam@ucar.edu, Second.Person@UCAR.edu"),
    ["jdaskam@ucar.edu", "second.person@ucar.edu"]
  );
});

test("parseAllowlist tolerates how env vars actually get pasted", () => {
  // Trailing comma, doubled separators, stray whitespace, newline.
  assert.deepEqual(parseAllowlist("  a@ucar.edu ,, b@ucar.edu, \n"), ["a@ucar.edu", "b@ucar.edu"]);
  assert.deepEqual(parseAllowlist(""), []);
  assert.deepEqual(parseAllowlist(undefined), []);
  assert.deepEqual(parseAllowlist(null), []);
});

test("an empty allowlist permits everyone", () => {
  // The end state once the pilot opens up. Absence of configuration must not
  // lock the module out — the feature flag and roles are still in force.
  assert.equal(isAllowed("anyone@ucar.edu", []), true);
  assert.equal(isAllowed("anyone@ucar.edu", undefined), true);
});

test("a populated allowlist permits only its members", () => {
  const list = parseAllowlist("jdaskam@ucar.edu");
  assert.equal(isAllowed("jdaskam@ucar.edu", list), true);
  assert.equal(isAllowed("someone.else@ucar.edu", list), false);
});

test("matching ignores case and surrounding whitespace", () => {
  const list = parseAllowlist("jdaskam@ucar.edu");
  assert.equal(isAllowed("JDaskam@UCAR.edu", list), true);
  assert.equal(isAllowed("  jdaskam@ucar.edu  ", list), true);
});

test("a missing or empty email is never allowed against a populated list", () => {
  // Firebase can hand back a user with no email; that must not pass a gate.
  const list = parseAllowlist("jdaskam@ucar.edu");
  assert.equal(isAllowed(undefined, list), false);
  assert.equal(isAllowed(null, list), false);
  assert.equal(isAllowed("", list), false);
  assert.equal(isAllowed("   ", list), false);
});

test("no substring or prefix matching", () => {
  // "jdaskam@ucar.edu.evil.com" must not satisfy a "jdaskam@ucar.edu" entry.
  const list = parseAllowlist("jdaskam@ucar.edu");
  assert.equal(isAllowed("jdaskam@ucar.edu.evil.com", list), false);
  assert.equal(isAllowed("xjdaskam@ucar.edu", list), false);
  assert.equal(isAllowed("jdaskam@ucar.ed", list), false);
});

test("the UI list agrees with the one deployed in firestore.rules", async () => {
  // Drift here means the UI offers actions the database refuses, or hides a
  // module the database would allow. Both are confusing in ways that look like
  // bugs elsewhere.
  const { readFileSync } = await import("node:fs");
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const match = /function cateringAllowlist\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(rules);
  assert.ok(match, "cateringAllowlist() not found in firestore.rules");

  const inRules = match[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^'|'$/g, "").toLowerCase())
    .filter(Boolean);

  const documented = parseAllowlist(
    readFileSync(new URL("../.env.example", import.meta.url), "utf8")
      .split("\n")
      .find((line) => line.startsWith("VITE_CATERING_ALLOWLIST="))
      ?.split("=")[1] ?? ""
  );

  assert.deepEqual(
    inRules,
    documented,
    "firestore.rules cateringAllowlist() and VITE_CATERING_ALLOWLIST in .env.example have drifted"
  );
});
