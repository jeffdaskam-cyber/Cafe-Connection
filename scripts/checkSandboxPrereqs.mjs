#!/usr/bin/env node
/**
 * Preflight for `npm run sandbox`.
 *
 * The Firestore and Storage emulators are Java programs. Without a JRE on PATH,
 * firebase-tools fails with "Could not spawn `java -version`", which does not
 * tell you what to install or where to get it. This checks first and prints
 * something actionable for the platform you are actually on.
 *
 * A JRE that is merely *present* is no longer enough: firebase-tools 15 raised
 * its minimum to Java 21 and throws rather than warns below it, so the version
 * is checked here too. Otherwise Java 17 passes this preflight and fails deep
 * inside the emulator instead — exactly the error this file exists to prevent.
 */

import { spawnSync } from "node:child_process";
import { platform } from "node:process";

// Mirrors MIN_SUPPORTED_JAVA_MAJOR_VERSION in firebase-tools' emulator/commandUtils.
const MIN_JAVA_MAJOR = 21;

const JAVA_HELP = {
  win32: [
    "  winget install --id Microsoft.OpenJDK.21 -e",
    "",
    "  Then close and reopen your terminal - PATH only refreshes in a new one.",
    "  No winget? Get the Temurin 21 MSI from https://adoptium.net and tick",
    "  \"Add to PATH\" during install.",
  ],
  darwin: [
    "  brew install --cask temurin",
    "",
    "  No Homebrew? Get the macOS package from https://adoptium.net",
  ],
  linux: [
    // Not default-jre: it is still Java 11 on Ubuntu 22.04, which is too old.
    "  sudo apt install openjdk-21-jre     # Debian/Ubuntu",
    "  sudo dnf install java-21-openjdk    # Fedora/RHEL",
  ],
};

/**
 * Probe the java on PATH.
 *
 * Returns null when there is no java at all, otherwise its major version — or
 * NaN when the version could not be read. An unreadable version is deliberately
 * not treated as too old: firebase-tools does its own check and would report a
 * real problem, and guessing here would block a working setup.
 */
function javaMajorVersion() {
  // `java -version` writes to stderr and exits 0. A missing binary surfaces as
  // an ENOENT error rather than a non-zero status.
  const res = spawnSync("java", ["-version"], { encoding: "utf8", shell: platform === "win32" });
  if (res.error || res.status !== 0) return null;

  // The version is quoted, and reads either "21.0.10" or — for Java 8 and older
  // — "1.8.0_202", where the major version is the second component. Scan the
  // whole output rather than the first line: JVM options echo above it.
  const match = /version "(\d+)(?:\.(\d+))?/.exec(`${res.stderr}${res.stdout}`);
  if (!match) return NaN;
  return Number(match[1] === "1" ? match[2] : match[1]);
}

const problems = [];
const javaMajor = javaMajorVersion();

if (javaMajor === null) {
  problems.push({
    what: "Java is not installed, or is not on your PATH.",
    why: "The Firestore and Storage emulators are Java programs.",
    fix: JAVA_HELP[platform] ?? JAVA_HELP.linux,
  });
} else if (javaMajor < MIN_JAVA_MAJOR) {
  problems.push({
    what: `Java ${javaMajor} is too old - ${MIN_JAVA_MAJOR} or newer is required.`,
    why: `firebase-tools refuses to start the emulators below Java ${MIN_JAVA_MAJOR}.`,
    fix: JAVA_HELP[platform] ?? JAVA_HELP.linux,
  });
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  problems.push({
    what: `Node ${process.versions.node} is too old - 22 or newer is required.`,
    why: "The scripts use Node 22 APIs, and the test runner's glob support.",
    fix: ["  https://nodejs.org - install the current LTS."],
  });
}

if (problems.length === 0) process.exit(0);

console.error("\nThe sandbox can't start yet:\n");
for (const p of problems) {
  console.error(`  [X] ${p.what}`);
  console.error(`    ${p.why}\n`);
  for (const line of p.fix) console.error(line);
  console.error("");
}
console.error("Then try again.\n");
process.exit(1);
