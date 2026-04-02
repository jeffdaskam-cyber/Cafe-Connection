/**
 * CampusSelector — reusable campus button group.
 *
 * Extracted from FinancialsPage so it can be shared across all tabs
 * that need campus filtering (Financials, Weekly Ops, Reports).
 *
 * Props:
 *   value     {string}    — currently selected campus name
 *   onChange  {function}  — called with new campus name on click
 *   campuses  {string[]}  — optional override list (defaults to all three UCAR campuses)
 *   size      {"sm"|"md"} — "sm" for compact inline use, "md" (default) for top-of-page use
 *   disabled  {boolean}   — disables all buttons
 *
 * Exported constants:
 *   CAMPUSES       — ["Mesa Lab", "Foothills", "Center Green"]
 *   CAMPUS_COLOR   — { "Mesa Lab": "#00A2B4", ... }
 */

import { useState } from "react";
import { COLORS } from "../theme.js";

// ── Campus constants (exported for use in other modules) ──────────────────────
export const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
export const CAMPUS_COLOR = {
  "Mesa Lab":       "#00A2B4",
  "Foothills":      "#34E1F4",
  "Center Green":   "#00818F",
  "All Campuses":   "#8B5CF6",
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CampusSelector({
  value,
  onChange,
  campuses = CAMPUSES,
  size = "md",
  disabled = false,
}) {
  const [hovered, setHovered] = useState(null);

  const pad   = size === "sm" ? "6px 14px" : "9px 22px";
  const fsize = size === "sm" ? 11 : 12;

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {campuses.map(campus => {
        const active = campus === value;
        const cc     = CAMPUS_COLOR[campus] ?? COLORS.AQUA;
        const isHov  = hovered === campus && !disabled;

        return (
          <button
            key={campus}
            onClick={() => !disabled && onChange(campus)}
            onMouseEnter={() => setHovered(campus)}
            onMouseLeave={() => setHovered(null)}
            disabled={disabled}
            style={{
              padding: pad,
              borderRadius: 6,
              border: active
                ? `1.5px solid ${cc}`
                : `1.5px solid ${isHov ? cc + "88" : COLORS.BORDER}`,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 600,
              fontSize: fsize,
              letterSpacing: "0.03em",
              background: active
                ? `${cc}18`
                : isHov ? `${cc}0f` : "transparent",
              color: active ? cc : isHov ? cc : COLORS.TEXT_SECONDARY,
              boxShadow: active ? `0 0 12px ${cc}22` : "none",
              transition: "all .2s ease",
              opacity: disabled ? 0.5 : 1,
            }}>
            {campus}
          </button>
        );
      })}
    </div>
  );
}
