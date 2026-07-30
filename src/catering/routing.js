/**
 * Catering Companion — route helpers.
 *
 * The Cafe Connection shell has no router dependency (App.jsx switches tabs by
 * state), so the catering companion is mounted as a second entry point chosen
 * from `window.location.pathname` in main.jsx.
 *
 * Everything here is intentionally pure — no `import.meta.env`, no browser
 * globals — so it can be unit tested under `node --test`.
 */

export const CATERING_BASE_PATH = "/catering";

/**
 * True when the given pathname belongs to the catering companion app.
 * Matches "/catering", "/catering/", and any nested path beneath it.
 * Does not match sibling paths such as "/cateringfoo".
 */
export function isCateringPath(pathname) {
  if (typeof pathname !== "string" || pathname === "") return false;
  const clean = stripTrailingSlash(pathname.split("?")[0].split("#")[0]);
  return clean === CATERING_BASE_PATH || clean.startsWith(`${CATERING_BASE_PATH}/`);
}

/**
 * The catering-relative sub-route for a pathname, always leading-slashed.
 * "/catering" -> "/", "/catering/new" -> "/new". Non-catering paths -> "/".
 */
export function cateringSubPath(pathname) {
  if (!isCateringPath(pathname)) return "/";
  const clean = stripTrailingSlash(pathname.split("?")[0].split("#")[0]);
  const rest = clean.slice(CATERING_BASE_PATH.length);
  return rest === "" ? "/" : rest;
}

function stripTrailingSlash(value) {
  return value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;
}
