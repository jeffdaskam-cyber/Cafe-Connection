/**
 * Catering Companion — pilot allowlist matching.
 *
 * Pure module: no `import.meta.env`, no browser globals, so it can be unit
 * tested under `node --test`. src/config/features.js reads the environment
 * variable and delegates the logic here.
 *
 * This gates the UI only. The enforceable boundary is `cateringAllowed()` in
 * firestore.rules — a client cannot be trusted to gate its own access. The two
 * must be kept in step: an address here that is missing there gets a UI that
 * offers actions the database then refuses.
 */

/**
 * Parse a comma-separated allowlist into normalized addresses.
 *
 * Tolerant of the ways a value gets pasted into an environment variable:
 * stray whitespace, mixed case, a trailing comma, or empty entries.
 */
export function parseAllowlist(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True when `email` may use the Catering Companion.
 *
 * An EMPTY list means no restriction — the feature flag and the normal role
 * checks still apply. That is the end state once the pilot opens up, so the
 * absence of configuration is deliberately permissive rather than a lockout.
 */
export function isAllowed(email, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (normalized === "") return false;
  return allowlist.includes(normalized);
}
