/**
 * dates.js — one date display format for the catering app.
 *
 * Every header, list summary, and review row renders dates as
 * "Weekday MM/DD/YYYY" (e.g. "Tuesday 09/01/2026"). Date *inputs* keep the
 * `YYYY-MM-DD` value the `<input type="date">` control requires — this module
 * is only for display.
 */

/**
 * "2026-09-01" → "Tuesday 09/01/2026". Parses the parts directly rather than
 * going through `new Date(str)` so the label can't drift a day across time zones.
 * Falsy input renders as an em dash; anything unparseable is passed through as-is.
 */
export function formatEventDate(dateStr) {
  if (!dateStr) return "—";
  const [y, mo, dy] = String(dateStr).split("-").map(Number);
  if (!y || !mo || !dy) return String(dateStr);
  const weekday = new Date(y, mo - 1, dy).toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${String(mo).padStart(2, "0")}/${String(dy).padStart(2, "0")}/${y}`;
}

/**
 * Formats a start/end pair as "start → end". Returns an em dash when neither
 * is set. A single-day event keeps both ends, matching how the range already
 * read before these dates were reformatted.
 */
export function formatEventDateRange(startDate, endDate) {
  const dates = [startDate, endDate].filter(Boolean);
  if (dates.length === 0) return "—";
  return dates.map(formatEventDate).join(" → ");
}
