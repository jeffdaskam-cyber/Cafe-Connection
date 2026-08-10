import { isAllowed, parseAllowlist } from "../catering/allowlist.js";

/**
 * Cafe Connection — build-time feature flags.
 *
 * Flags are read from Vite env vars, so they are resolved at build time and
 * differ per deployment environment (local / Vercel preview / production).
 * A flag that is unset or anything other than the string "true" is OFF.
 */

/**
 * Gates the entire Catering Companion module: the `/catering` requester entry
 * point and (from Phase 3) the staff "Catering" tab.
 *
 * Off in production until Phase 5 UAT sign-off. With the flag off, the catering
 * chunk is never even fetched and `/catering` falls through to the normal
 * Cafe Connection shell.
 */
export const CATERING_ENABLED = import.meta.env.VITE_CATERING_ENABLED === "true";

/**
 * Pilot allowlist for the Catering Companion, as a comma-separated list of
 * email addresses.
 *
 * The feature flag alone is all-or-nothing: turning it on in production would
 * reveal the staff Catering tab to every manager, and — more importantly — let
 * any @ucar.edu user who finds /catering self-provision as a `requester` and
 * file real requests. The allowlist narrows that to named people so the module
 * can run against production data with a known, small set of users.
 *
 * Empty (the default) means no restriction beyond the flag and normal roles.
 * That is the end state once the pilot opens up; during the pilot it is set.
 *
 * This is a build-time convenience for the UI only. The enforceable boundary is
 * `cateringAllowed()` in firestore.rules — a client cannot be trusted to gate
 * its own access, and the two lists must be kept in step.
 */
export const CATERING_ALLOWLIST = parseAllowlist(import.meta.env.VITE_CATERING_ALLOWLIST);

/**
 * True when `email` may use the Catering Companion.
 *
 * An empty allowlist permits everyone — the flag and the role checks still
 * apply. A non-empty allowlist permits only the addresses on it.
 */
export function isCateringAllowed(email) {
  return isAllowed(email, CATERING_ALLOWLIST);
}

/**
 * True when the Firebase SDK is pointed at the local Emulator Suite rather than
 * a live Firebase project. Drives the sandbox banner in the UI so nobody
 * mistakes emulator data for production data.
 */
export const SANDBOX_MODE = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

/**
 * Human-readable label for the current data target, for banners and debug UI.
 */
export const DATA_TARGET_LABEL = SANDBOX_MODE
  ? "Firebase Emulator Suite (local sandbox)"
  : import.meta.env.VITE_FIREBASE_PROJECT_ID || "unknown project";
