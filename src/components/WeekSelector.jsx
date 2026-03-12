/**
 * WeekSelector — shared week navigation control.
 *
 * Props:
 *   weekOf    {string}   — ISO date "YYYY-MM-DD" of the Monday for the selected week
 *   onChange  {function} — called with new ISO Monday string when user navigates
 *   disabled  {boolean}  — disables navigation buttons
 *
 * Usage:
 *   <WeekSelector weekOf={weekOf} onChange={setWeekOf} />
 *
 * Exported helpers:
 *   getCurrentMonday()  → ISO string of this week's Monday
 *   addWeeks(iso, n)    → ISO string of Monday n weeks from iso
 */

import { useState } from "react";
import { COLORS } from "../theme.js";

// ── Date helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the ISO "YYYY-MM-DD" string of the Monday of the given date.
 * Uses noon time to avoid DST boundary issues.
 */
export function getMondayOf(dateOrIso) {
  const d = typeof dateOrIso === "string"
    ? new Date(dateOrIso + "T12:00:00")
    : new Date(dateOrIso);
  const day = d.getDay(); // 0 = Sun, 1 = Mon …
  const diff = day === 0 ? -6 : 1 - day; // roll back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the ISO Monday string n weeks before or after the given ISO Monday.
 */
export function addWeeks(isoMonday, n) {
  const d = new Date(isoMonday + "T12:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

/** Returns the ISO Monday of the current week. */
export function getCurrentMonday() {
  return getMondayOf(new Date());
}

function formatWeekLabel(isoMonday) {
  const d = new Date(isoMonday + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function isCurrentWeek(isoMonday) {
  return isoMonday === getCurrentMonday();
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function WeekSelector({ weekOf, onChange, disabled = false }) {
  const [hoveredPrev, setHoveredPrev] = useState(false);
  const [hoveredNext, setHoveredNext] = useState(false);
  const [hoveredCur,  setHoveredCur]  = useState(false);

  const isCurrent = isCurrentWeek(weekOf);

  const navBtnBase = {
    background: "transparent",
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: 6,
    padding: "6px 10px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'Poppins',sans-serif",
    fontWeight: 700, fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    transition: "all .18s",
    opacity: disabled ? 0.4 : 1,
    lineHeight: 1,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Previous week */}
      <button
        onClick={() => !disabled && onChange(addWeeks(weekOf, -1))}
        onMouseEnter={() => setHoveredPrev(true)}
        onMouseLeave={() => setHoveredPrev(false)}
        title="Previous week"
        style={{
          ...navBtnBase,
          background: hoveredPrev && !disabled ? COLORS.AQUA_LIGHT : "transparent",
          border: `1px solid ${hoveredPrev && !disabled ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
          color: hoveredPrev && !disabled ? COLORS.AQUA : COLORS.TEXT_SECONDARY,
        }}>
        ←
      </button>

      {/* Week label */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: COLORS.BG_SURFACE_ALT,
        border: `1px solid ${COLORS.BORDER}`,
        borderRadius: 8,
        padding: "6px 14px",
        minWidth: 200, justifyContent: "center",
      }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: COLORS.TEXT_PRIMARY,
          fontFamily: "'Poppins',sans-serif",
          whiteSpace: "nowrap",
        }}>
          Week of {formatWeekLabel(weekOf)}
        </span>
        {isCurrent && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: COLORS.AQUA,
            background: COLORS.AQUA_LIGHT,
            border: `1px solid ${COLORS.AQUA_BORDER}`,
            borderRadius: 20, padding: "2px 7px",
            letterSpacing: "0.06em", textTransform: "uppercase",
            flexShrink: 0,
          }}>
            Current
          </span>
        )}
      </div>

      {/* Next week */}
      <button
        onClick={() => !disabled && onChange(addWeeks(weekOf, 1))}
        onMouseEnter={() => setHoveredNext(true)}
        onMouseLeave={() => setHoveredNext(false)}
        title="Next week"
        style={{
          ...navBtnBase,
          background: hoveredNext && !disabled ? COLORS.AQUA_LIGHT : "transparent",
          border: `1px solid ${hoveredNext && !disabled ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
          color: hoveredNext && !disabled ? COLORS.AQUA : COLORS.TEXT_SECONDARY,
        }}>
        →
      </button>

      {/* Jump to current week — only shown when not on current week */}
      {!isCurrent && (
        <button
          onClick={() => !disabled && onChange(getCurrentMonday())}
          onMouseEnter={() => setHoveredCur(true)}
          onMouseLeave={() => setHoveredCur(false)}
          title="Jump to current week"
          style={{
            ...navBtnBase,
            fontSize: 10, padding: "6px 10px",
            background: hoveredCur && !disabled ? COLORS.AQUA_LIGHT : "transparent",
            border: `1px solid ${hoveredCur && !disabled ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
            color: hoveredCur && !disabled ? COLORS.AQUA : COLORS.TEXT_SECONDARY,
            letterSpacing: "0.03em",
          }}>
          Today
        </button>
      )}
    </div>
  );
}
