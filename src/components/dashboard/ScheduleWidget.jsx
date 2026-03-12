/**
 * ScheduleWidget — dashboard mini-widget
 *
 * Shows the current week label and a compact staff listing
 * parsed from the Google Drive schedule.
 *
 * Props:
 *   config  {} (no campus filter — schedule is org-wide)
 */

import Widget from "../Widget.jsx";
import { useWidget } from "../../hooks/useWidget.js";
import { fetchSchedule } from "../../firebase.js";
import { useCallback } from "react";
import { COLORS } from "../../theme.js";

// Derive the current week's Monday as "YYYY-MM-DD"
function currentMonday() {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekOf) {
  const d = new Date(weekOf + "T12:00:00");
  return `Week of ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

export default function ScheduleWidget({ config = {} }) {
  const weekOf = currentMonday();
  const fetcher = useCallback(() => fetchSchedule(weekOf), [weekOf]);
  const { data, loading, error, reload } = useWidget(fetcher, [weekOf]);

  const rows     = data?.rows ?? [];
  const colorMap = data?.colorMap ?? {};

  // Collect non-empty, non-header text cells from the first 10 data rows
  // (skip the day-of-week header row and date row)
  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(cell))
  );
  const dataRows = dayHeaderIdx >= 0 ? rows.slice(dayHeaderIdx + 2, dayHeaderIdx + 12) : rows.slice(0, 10);

  // Grab first-column names only (role / employee name column)
  const nameLines = dataRows
    .map(r => r[0])
    .filter(v => v && v.trim().length > 0)
    .slice(0, 7);

  return (
    <Widget
      title="Staff Schedule"
      subtitle={weekLabel(weekOf)}
      icon="📋"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={!loading && !error && rows.length === 0}
      emptyIcon="📅"
      emptyMessage="No schedule found for this week."
    >
      {nameLines.length > 0 && (
        <div>
          {nameLines.map((name, i) => (
            <div key={i} style={{
              fontSize: 12,
              color: i === 0 ? COLORS.TEXT_PRIMARY : COLORS.TEXT_SECONDARY,
              fontWeight: i === 0 ? 600 : 400,
              padding: "4px 0",
              borderBottom: i < nameLines.length - 1 ? `1px solid ${COLORS.BORDER}` : "none",
            }}>{name}</div>
          ))}
          {dataRows.length > 7 && (
            <div style={{ fontSize: 10, color: COLORS.TEXT_DISABLED, marginTop: 8 }}>
              + {dataRows.length - 7} more — see Weekly Ops for full schedule
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}
