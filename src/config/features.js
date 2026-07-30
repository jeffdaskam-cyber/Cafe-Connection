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
