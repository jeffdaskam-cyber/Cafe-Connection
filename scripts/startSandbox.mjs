#!/usr/bin/env node
/**
 * Sandbox entry point, run inside `firebase emulators:exec`.
 *
 * Everything here exists to keep a shell out of the path, because two separate
 * Windows failures came from letting one in:
 *
 *   1. The command handed to emulators:exec used to be the shell string
 *      "node scripts/seed… && vite --mode sandbox". cmd.exe does not treat `&&`
 *      inside a quoted argument the way a POSIX shell does, so it could split —
 *      starting Vite without `--mode sandbox`, which means .env.sandbox never
 *      loads and /catering silently falls through to the Cafe Connection shell.
 *
 *   2. Spawning with `shell: true` broke on `process.execPath`, which on Windows
 *      is "C:\Program Files\nodejs\node.exe". cmd.exe split it at the space:
 *      'C:\Program' is not recognized as an internal or external command.
 *
 * So: absolute interpreter, explicit argument arrays, no shell anywhere. Both
 * steps run as `node <script.js>`, including Vite — its .bin entry on Windows is
 * a .cmd wrapper that would need a shell, but bin/vite.js is plain JS and needs
 * nothing.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/** Run a Node script to completion. No shell — paths may contain spaces. */
function runNode(scriptPath, args = []) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

// vite/bin/vite.js is not exposed through the package's `exports`, so it cannot
// be resolved with createRequire — reference it by path and check it is there.
const VITE_BIN = resolve(ROOT, "node_modules/vite/bin/vite.js");
if (!existsSync(VITE_BIN)) {
  console.error(
    `\n[sandbox] Could not find ${VITE_BIN}\n` +
      "  Run `npm ci` first — dependencies are not installed.\n"
  );
  process.exit(1);
}

const seedStatus = runNode(resolve(ROOT, "scripts/seedCateringReferenceData.mjs"));
if (seedStatus !== 0) {
  console.error("\n[sandbox] Seeding failed — not starting the dev server.\n");
  process.exit(seedStatus);
}

// A dedicated port, not Vite's default 5173. Another Vite app on 5173 would
// make this one silently drift to 5174 while the browser stays on 5173 showing
// the other app — and if that app shares this codebase, the symptom is a
// confusing "you don't have access" rather than an obvious wrong-app.
// strictPort turns a collision into a loud failure instead of a silent move.
const PORT = process.env.SANDBOX_PORT || "5180";

// stdout is piped rather than inherited so the banner below can be printed
// *after* Vite's own. Vite advertises only its root URL, and terminals make that
// clickable — following it lands on the Cafe Connection staff app, where signing
// in reports "you don't have access" because the requester self-provisioning
// lives on the /catering entry point. Whatever prints last is what gets clicked,
// so this has to come second. stderr stays inherited so errors are never held up.
const vite = spawn(
  process.execPath,
  [VITE_BIN, "--mode", "sandbox", "--port", PORT, "--strictPort"],
  { stdio: ["inherit", "pipe", "inherit"] }
);

let bannerShown = false;
function showBanner() {
  if (bannerShown) return;
  bannerShown = true;
  process.stdout.write(
    `\n  Catering Companion  ->  http://localhost:${PORT}/catering   <- start here\n` +
      `  Cafe Connection     ->  http://localhost:${PORT}/\n` +
      `  Emulator UI         ->  http://localhost:4000\n\n`
  );
}

vite.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  // Vite prints "ready in NNN ms" then its Local/Network lines. Waiting a beat
  // puts this banner after all of them.
  if (!bannerShown && /ready in/.test(chunk.toString())) setTimeout(showBanner, 300);
});

// If Vite's output ever stops matching, still show the URLs rather than none.
const bannerFallback = setTimeout(showBanner, 15000);
bannerFallback.unref?.();

vite.on("error", (err) => {
  console.error(`\n[sandbox] Could not start Vite: ${err.message}\n`);
  process.exit(1);
});

// Ctrl-C reaches this process first; pass it on so Vite exits cleanly and
// emulators:exec can shut the emulators down.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { vite.kill(signal); });
}

vite.on("exit", (code, signal) => {
  process.exit(signal ? 0 : (code ?? 0));
});
