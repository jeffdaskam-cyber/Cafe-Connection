/**
 * DailySchedule.jsx — cross-event catering schedule, by day.
 *
 * Powered by the collection-group query on catering_schedule_days, using the
 * collection-group index added in Phase 1. This is the kitchen's view: what is
 * happening on each day, across every event.
 */
import { useEffect, useMemo, useState } from "react";

import { COLORS, FONT, RADIUS } from "../../theme.js";
import { fetchScheduleDaysInRange } from "../staffData.js";
import { groupScheduleByDate, isoDateOffset, mealTotalsForDay } from "../staffFilters.js";
import { Banner, Card, EmptyState, Field, Input, SectionTitle, StatusBadge } from "../ui.jsx";

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

export default function DailySchedule({ events }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => isoDateOffset(today, 14));
  const [days, setDays] = useState(null);
  const [error, setError] = useState("");

  const eventsById = useMemo(
    () => Object.fromEntries((events || []).map((e) => [e.id, e])),
    [events]
  );

  useEffect(() => {
    let live = true;
    setDays(null);
    setError("");
    fetchScheduleDaysInRange(from, to)
      .then((rows) => { if (live) setDays(rows); })
      .catch((err) => {
        console.error("[catering/staff] schedule query failed:", err);
        if (!live) return;
        setDays([]);
        setError(
          err?.code === "failed-precondition"
            ? "This view needs the collection-group index on catering_schedule_days. Deploy firestore.indexes.json, then reload."
            : "Couldn't load the schedule for this range."
        );
      });
    return () => { live = false; };
  }, [from, to]);

  const grouped = useMemo(() => groupScheduleByDate(days || [], eventsById), [days, eventsById]);

  return (
    <>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      {error && <Banner tone="error" title="Couldn't load the schedule">{error}</Banner>}

      {days === null ? (
        <Card><div style={{ fontSize: 13, color: COLORS.TEXT_MUTED }}>Loading schedule…</div></Card>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState title="Nothing scheduled in this range">
            Widen the date range to see more.
          </EmptyState>
        </Card>
      ) : (
        grouped.map(({ date, entries }) => {
          const totals = mealTotalsForDay(entries);
          return (
            <Card key={date} style={{ marginBottom: 16 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 14,
              }}>
                <SectionTitle style={{ marginBottom: 0 }}>{formatDate(date)}</SectionTitle>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {totals.map((t) => (
                    <span key={t.period} style={{
                      background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
                      borderRadius: RADIUS.PILL, padding: "3px 10px",
                      fontSize: 11, color: COLORS.TEXT_SECONDARY,
                    }}>
                      {MEAL_PERIOD_LABELS[t.period] || t.period}: {t.events} event{t.events === 1 ? "" : "s"}
                      {t.headcount > 0 ? ` · ~${t.headcount}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
                  <thead>
                    <tr>
                      {["Time", "Event", "Room", "Services", "Guests", "Status"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "8px 12px",
                          fontSize: 10, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_MUTED,
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: `1px solid ${COLORS.BORDER_STRONG}`, whiteSpace: "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={`${entry.eventId}-${entry.id}`} style={{ borderBottom: `1px solid ${COLORS.BORDER}` }}>
                        <td style={cell}>{[entry.startTime, entry.endTime].filter(Boolean).join("–") || "—"}</td>
                        <td style={{ ...cell, color: COLORS.TEXT_PRIMARY, fontWeight: FONT.WEIGHT_BOLD }}>
                          {entry.eventName}
                          {entry.plannerName && (
                            <div style={{ fontWeight: 400, fontSize: 11, color: COLORS.TEXT_MUTED }}>
                              {entry.plannerName}
                            </div>
                          )}
                        </td>
                        <td style={cell}>{entry.primaryRoomId || entry.buildingId || "—"}</td>
                        <td style={cell}>
                          {(entry.cateringServicesNeeded || [])
                            .map((p) => MEAL_PERIOD_LABELS[p] || p).join(", ") || "—"}
                        </td>
                        <td style={cell}>{entry.expectedAttendance ?? "—"}</td>
                        <td style={cell}>
                          <StatusBadge requestStatus={entry.requestStatus} lifecycleStatus={entry.lifecycleStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}

const cell = { padding: "8px 12px", color: COLORS.TEXT_SECONDARY, verticalAlign: "top" };

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${weekday} ${mo}/${dy}/${d.getUTCFullYear()}`;
}
