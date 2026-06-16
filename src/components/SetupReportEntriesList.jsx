/**
 * SetupReportEntriesList — presentational list of setup/reset entries.
 *
 * Renders entries from the `setup_report_entries` Firestore collection
 * (Phase 1 schema), grouped by campus → date. Pure display: the parent owns
 * fetching, week navigation, and entry authoring. Used by both Setup Report
 * widgets (Weekly Ops + Dashboard) when the Firestore cutover flag is on.
 */

import { COLORS, RADIUS } from "../theme.js";

const FONT_FAMILY = "'Poppins',sans-serif";

const CAMPUS_ORDER = ["mesa", "foothills", "center_green"];
const CAMPUS_LABELS = {
  mesa:         "Mesa Lab",
  foothills:    "Foothills Lab",
  center_green: "Center Green",
};
const ACTION_LABELS = {
  setup: "Setup",
  reset: "Reset",
  both:  "Setup + Reset",
};

// "18:00" → "6:00 PM"
function formatTime12(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Firestore Timestamp → "Mon, Jun 8, 2:30 PM" (readable local datetime)
function formatDateTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Firestore Timestamp → "Monday, June 8" (day grouping header / event date)
function formatDateLong(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const labelStyle = {
  fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
  color: COLORS.TEXT_MUTED, fontWeight: 700, fontFamily: FONT_FAMILY,
};

function Detail({ label, value }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{
        fontSize: 12, color: COLORS.TEXT_PRIMARY, fontFamily: FONT_FAMILY,
        fontWeight: 500, marginTop: 2, lineHeight: 1.4,
      }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function SetupReportEntriesList({
  entries = [],
  loading = false,
  error = null,
  canEdit = false,
  onEditEntry,
}) {
  if (loading) {
    return (
      <div style={{ padding: "4px 0 8px" }}>
        {["72%", "90%", "55%"].map((w, i) => (
          <div key={i} style={{
            width: w, height: 11, marginBottom: 9, borderRadius: 6,
            background: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
            backgroundSize: "200% 100%",
            animation: "ucar-shimmer 1.6s ease-in-out infinite",
          }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "16px 0", textAlign: "center",
        fontSize: 12, color: COLORS.ERROR, fontFamily: FONT_FAMILY,
      }}>
        Could not load tasks. Please refresh.
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div style={{
        padding: "16px 0", textAlign: "center",
        fontSize: 12, color: COLORS.TEXT_MUTED, fontFamily: FONT_FAMILY,
      }}>
        No setup tasks for this week.
      </div>
    );
  }

  // Group by campus → date. Entries arrive ordered by date; sort within campus
  // in JS to keep day grouping stable regardless of fetch order.
  const grouped = {};
  for (const entry of entries) {
    const campusKey = entry.campus || "mesa";
    (grouped[campusKey] ??= []).push(entry);
  }
  for (const campusKey of Object.keys(grouped)) {
    grouped[campusKey].sort((a, b) => {
      const da = a.date?.toDate?.()?.getTime() ?? 0;
      const dbt = b.date?.toDate?.()?.getTime() ?? 0;
      return da - dbt;
    });
  }

  return (
    <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 6 }}>
      {CAMPUS_ORDER.filter((c) => grouped[c]?.length).map((campusKey) => {
        // Sub-group this campus's entries by date label
        const byDate = new Map();
        for (const entry of grouped[campusKey]) {
          const dateKey = formatDateLong(entry.date);
          if (!byDate.has(dateKey)) byDate.set(dateKey, []);
          byDate.get(dateKey).push(entry);
        }
        return (
          <div key={campusKey} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: COLORS.AQUA_DARK,
              fontFamily: FONT_FAMILY, letterSpacing: "0.04em",
              textTransform: "uppercase", paddingBottom: 4, marginBottom: 8,
              borderBottom: `2px solid ${COLORS.AQUA_BORDER}`,
            }}>
              {CAMPUS_LABELS[campusKey]}
            </div>

            {[...byDate.entries()].map(([dateLabel, dayEntries]) => (
              <div key={dateLabel} style={{ marginBottom: 10 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: COLORS.TEXT_SECONDARY,
                  fontFamily: FONT_FAMILY, marginBottom: 6,
                }}>
                  {dateLabel}
                </div>

                {dayEntries.map((entry) => (
                  <div key={entry.id} style={{
                    padding: "10px 12px", marginBottom: 6,
                    background: COLORS.BG_SURFACE_ALT,
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: RADIUS.MD,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Action + description headline */}
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                        }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: COLORS.TEXT_ON_ACCENT,
                            background: COLORS.AQUA, borderRadius: 999,
                            padding: "2px 9px", fontFamily: FONT_FAMILY,
                          }}>
                            {ACTION_LABELS[entry.action] || entry.action || "—"}
                          </span>
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                            fontFamily: FONT_FAMILY,
                          }}>
                            {entry.description || "—"}
                          </span>
                        </div>

                        {/* Locations */}
                        <div style={{
                          fontSize: 11, color: COLORS.TEXT_MUTED,
                          fontFamily: FONT_FAMILY, marginTop: 4,
                        }}>
                          {(entry.action === "setup" || entry.action === "both") &&
                            `Setup: ${entry.setupLocation || "—"}`}
                          {entry.action === "both" ? "  ·  " : ""}
                          {(entry.action === "reset" || entry.action === "both") &&
                            `Reset: ${entry.resetLocation || "—"}`}
                        </div>

                        {/* Timing + diagram grid */}
                        <div style={{
                          marginTop: 8, display: "grid",
                          gridTemplateColumns: "1fr 1fr auto", gap: 12,
                        }}>
                          <Detail label="Available" value={formatDateTime(entry.availableAt)} />
                          <Detail label="Deadline" value={formatDateTime(entry.deadlineAt)} />
                          <Detail label="Diagram" value={entry.diagram ? "Yes" : "No"} />
                        </div>

                        {/* Event details (only when present) */}
                        {(entry.eventName || entry.attendeeCount != null ||
                          entry.eventDate || entry.eventStartTime) && (
                          <div style={{
                            marginTop: 8, paddingTop: 8,
                            borderTop: `1px solid ${COLORS.BORDER}`,
                            display: "grid",
                            gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12,
                          }}>
                            <Detail label="Event" value={entry.eventName || "—"} />
                            <Detail label="Attendees" value={entry.attendeeCount ?? "—"} />
                            <Detail
                              label="Event Start"
                              value={
                                entry.eventDate || entry.eventStartTime
                                  ? `${entry.eventDate ? formatDateLong(entry.eventDate) : "—"}${
                                      entry.eventStartTime ? ` · ${formatTime12(entry.eventStartTime)}` : ""
                                    }`
                                  : "—"
                              }
                            />
                          </div>
                        )}
                      </div>

                      {canEdit && onEditEntry && (
                        <button
                          onClick={() => onEditEntry(entry)}
                          title="Edit task"
                          style={{
                            background: "transparent",
                            border: `1px solid ${COLORS.BORDER}`,
                            borderRadius: 6, padding: "3px 7px",
                            cursor: "pointer", fontSize: 11,
                            color: COLORS.TEXT_MUTED, flexShrink: 0, lineHeight: 1.4,
                          }}>✏️</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
