/**
 * Guards against the two Windows failures that broke `npm run sandbox`, both
 * caused by handing something to a shell that a shell then re-parsed.
 *
 * These are source assertions rather than behavioral ones on purpose: the
 * failures only reproduce on cmd.exe, which CI does not run, so the thing worth
 * pinning is the shape of the code that caused them.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = resolve(import.meta.dirname, "..");
const runnerSource = readFileSync(resolve(ROOT, "scripts/startSandbox.mjs"), "utf8");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));

// The file's own comments describe the bugs being guarded against, `shell: true`
// among them. Strip comments so the assertions read code, not prose.
const runner = runnerSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the sandbox runner never spawns through a shell", () => {
  // `shell: true` plus process.execPath is what produced
  // "'C:\\Program' is not recognized" — cmd.exe split "C:\Program Files\...".
  assert.doesNotMatch(
    runner,
    /shell\s*:\s*(true|useShell|platform)/,
    "startSandbox.mjs must spawn without a shell so paths containing spaces survive"
  );
});

test("the sandbox runner invokes Vite as a Node script, not a .bin shim", () => {
  // node_modules/.bin/vite is vite.cmd on Windows and needs a shell; bin/vite.js
  // is plain JS and does not.
  assert.match(runner, /vite\/bin\/vite\.js/);
  assert.match(runner, /process\.execPath/);
});

test("the sandbox npm script does not chain commands inside a quoted argument", () => {
  // "node seed… && vite …" passed to emulators:exec is re-parsed by cmd.exe,
  // which can split it and drop `--mode sandbox`.
  const quoted = pkg.scripts.sandbox.match(/"([^"]*)"/g) ?? [];
  for (const arg of quoted) {
    assert.ok(
      !arg.includes("&&"),
      `sandbox script passes a chained command as one quoted argument: ${arg}`
    );
  }
});

test("the sandbox pins its own port so a stray Vite app cannot shadow it", () => {
  // Vite silently moves to 5174 when 5173 is taken; --strictPort fails instead.
  assert.match(runner, /--strictPort/);
  assert.doesNotMatch(runner, /SANDBOX_PORT \|\| "5173"/);
});
