#!/usr/bin/env node
/**
 * Sandbox entry point, run inside `firebase emulators:exec`.
 *
 * This used to be the shell string "node scripts/seed… && vite --mode sandbox"
 * passed to emulators:exec. That is a cross-platform hazard: cmd.exe does not
 * treat `&&` inside a quoted argument the way a POSIX shell does, so on Windows
 * the command could split and Vite would start WITHOUT `--mode sandbox`. Vite
 * then never loads .env.sandbox, VITE_CATERING_ENABLED is unset, and /catering
 * silently falls through to the Cafe Connection shell — which looks like a
 * permissions bug ("You don't have access to this application") rather than a
 * quoting bug.
 *
 * Spawning with explicit argument arrays removes the shell from the path.
 */

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:process";

// npm puts node_modules/.bin on PATH; on Windows the runnable file is vite.cmd,
// which needs a shell. Everywhere else it does not.
const useShell = platform === "win32";

function run(command, args) {
  const res = spawnSync(command, args, { stdio: "inherit", shell: useShell });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

const seedStatus = run(process.execPath, ["scripts/seedCateringReferenceData.mjs"]);
if (seedStatus !== 0) {
  console.error("\n[sandbox] Seeding failed — not starting the dev server.\n");
  process.exit(seedStatus);
}

// A dedicated port, not Vite's default 5173. Another Vite app on 5173 would
// make this one silently drift to 5174 while the browser stays on 5173 and
// shows the other app — and if that app shares this codebase, the symptom is a
// confusing "you don't have access" rather than an obvious wrong-app.
// strictPort turns a collision into a loud failure instead of a silent move.
const PORT = process.env.SANDBOX_PORT || "5180";

console.log(`\n[sandbox] Catering Companion → http://localhost:${PORT}/catering`);
console.log(`[sandbox] Cafe Connection staff app → http://localhost:${PORT}/\n`);

const vite = spawn("vite", ["--mode", "sandbox", "--port", PORT, "--strictPort"], {
  stdio: "inherit",
  shell: useShell,
});

// Ctrl-C reaches this process first; pass it on so Vite exits cleanly and
// emulators:exec can shut the emulators down.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { vite.kill(signal); });
}

vite.on("exit", (code, signal) => {
  process.exit(signal ? 0 : (code ?? 0));
});
