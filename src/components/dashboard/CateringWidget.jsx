/**
 * CateringWidget — dashboard mini-widget
 *
 * Live catering metrics read straight from `catering_events` and computed
 * client-side — the same pattern as the other dashboard widgets, and what the
 * build plan's §5.1 calls the "live widget read". It does NOT read
 * event_revenue; the server-side rollup there is the reporting feed, this is
 * the operational one.
 *
 * Props:
 *   config  { campus?: string }  — omit or "All" for every campus
 */

import Widget from "../Widget.jsx";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { subscribeAllCateringEvents } from "../../catering/staffData.js";
import { COLORS, FONT } from "../../theme.js";
import { LIFECYCLE_STATUS, REQUEST_STATUS } from "../../catering/schema.js";

function money(n) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Upcoming = confirmed, still open, and starting today or later. */
function isUpcoming(event, todayIso) {
  return (
    event.requestStatus === REQUEST_STATUS.CONFIRMED &&
    event.lifecycleStatus === LIFECYCLE_STATUS.OPEN &&
    (event.startDate || "") >= todayIso
  );
}

export default function CateringWidget({ config = {} }) {
  const campus = config.campus && config.campus !== "All" ? config.campus : null;

  const { data: events, loading, error } = useWidgetSubscription(
    (cb) => subscribeAllCateringEvents(cb),
    []
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const scoped = (events ?? []).filter((e) => !campus || e.campus === campus);

  const awaiting = scoped.filter((e) => e.requestStatus === REQUEST_STATUS.SUBMITTED);
  const upcoming = scoped
    .filter((e) => isUpcoming(e, todayIso))
    .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));

  const guests = upcoming.reduce((sum, e) => sum + (Number(e.expectedAttendance) || 0), 0);
  const revenue = upcoming.reduce(
    (sum, e) => sum + (Number(e.actualRevenue ?? e.estimatedRevenue) || 0),
    0
  );

  return (
    <Widget
      title="Catering"
      subtitle={campus ?? "All campuses"}
      icon="🍽️"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
    >
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
        <Stat label="Awaiting decision" value={awaiting.length}
          tone={awaiting.length > 0 ? COLORS.WARNING : COLORS.TEXT_MUTED} />
        <Stat label="Upcoming" value={upcoming.length} tone={COLORS.AQUA} />
        <Stat label="Guests" value={guests.toLocaleString("en-US")} tone={COLORS.TEXT_PRIMARY} />
        <Stat label="Revenue" value={money(revenue)} tone={COLORS.TEXT_PRIMARY} />
      </div>

      {upcoming.length === 0 ? (
        <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>
          No upcoming confirmed events.
        </div>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {upcoming.slice(0, 4).map((event) => (
            <li key={event.id} style={{
              display: "flex", justifyContent: "space-between", gap: 12,
              padding: "7px 0", borderTop: `1px solid ${COLORS.BORDER}`, fontSize: 12,
            }}>
              <span style={{
                color: COLORS.TEXT_PRIMARY, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {event.eventName || "Untitled event"}
              </span>
              <span style={{ color: COLORS.TEXT_MUTED, whiteSpace: "nowrap" }}>
                {event.startDate}
                {event.expectedAttendance ? ` · ${event.expectedAttendance}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: FONT.WEIGHT_BOLD, color: tone, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, textTransform: "uppercase",
        letterSpacing: "0.05em", fontWeight: 500, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
