import test from "node:test";
import assert from "node:assert/strict";

import {
  CATERING_BASE_PATH,
  isCateringPath,
  cateringSubPath,
} from "../src/catering/routing.js";

test("isCateringPath matches the catering base path and nested routes", () => {
  assert.equal(isCateringPath("/catering"), true);
  assert.equal(isCateringPath("/catering/"), true);
  assert.equal(isCateringPath("/catering/new"), true);
  assert.equal(isCateringPath("/catering/events/abc123"), true);
});

test("isCateringPath ignores query strings and hashes", () => {
  assert.equal(isCateringPath("/catering?step=2"), true);
  assert.equal(isCateringPath("/catering/new#meals"), true);
});

test("isCateringPath does not match sibling or unrelated paths", () => {
  assert.equal(isCateringPath("/"), false);
  assert.equal(isCateringPath("/cateringfoo"), false);
  assert.equal(isCateringPath("/api/get-schedule"), false);
  assert.equal(isCateringPath("/dashboard/catering"), false);
});

test("isCateringPath tolerates missing or non-string input", () => {
  assert.equal(isCateringPath(""), false);
  assert.equal(isCateringPath(undefined), false);
  assert.equal(isCateringPath(null), false);
});

test("cateringSubPath returns the catering-relative route", () => {
  assert.equal(cateringSubPath("/catering"), "/");
  assert.equal(cateringSubPath("/catering/"), "/");
  assert.equal(cateringSubPath("/catering/new"), "/new");
  assert.equal(cateringSubPath("/catering/events/abc123"), "/events/abc123");
  assert.equal(cateringSubPath("/catering/new?draft=1"), "/new");
});

test("cateringSubPath falls back to root for non-catering paths", () => {
  assert.equal(cateringSubPath("/"), "/");
  assert.equal(cateringSubPath("/cateringfoo"), "/");
});

test("CATERING_BASE_PATH is the documented entry point", () => {
  assert.equal(CATERING_BASE_PATH, "/catering");
});
