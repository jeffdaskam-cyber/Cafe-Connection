/**
 * RecentReportsWidget — dashboard mini-widget
 *
 * Shows the last 3 event and setup reports submitted across all campuses.
 *
 * Props:
 *   config  {} (no campus filter)
 */

import Widget from "../Widget.jsx";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { subscribeEventReports, subscribeSetupReports } from "../../firebase.js";
import { COLORS } from "../../theme.js";

const CAMPUS_BADGE_STYLE = { bg: `${COLORS.AQUA}18`, color: COLORS.AQUA };

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Merge event and setup reports into a single sorted list
function mergeReports(events = [], setups = []) {
  const tagged = [
    ...events.map(r => ({ ...r, _type: "Event" })),
    ...setups.map(r =>  ({ ...r, _type: "Setup" })),
  ];
  tagged.sort((a, b) => {
    const ta = a.created_at?.toDate?.() ?? new Date(0);
    const tb = b.created_at?.toDate?.() ?? new Date(0);
    return tb - ta;
  });
  return tagged.slice(0, 3);
}

export default function RecentReportsWidget({ config: _config = {} }) {
  const { data: events, loading: el, error: ee } = useWidgetSubscription(
    (cb) => subscribeEventReports(cb), []
  );
  const { data: setups, loading: sl, error: se } = useWidgetSubscription(
    (cb) => subscribeSetupReports(cb), []
  );

  const loading = el || sl;
  const error   = ee || se;
  const reports = mergeReports(events ?? [], setups ?? []);

  return (
    <Widget
      title="Recent Reports"
      subtitle="All campuses"
      icon="📁"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      empty={!loading && !error && reports.length === 0}
      emptyIcon="📁"
      emptyMessage="No reports submitted yet."
    >
      {reports.length > 0 && (
        <div>
          {reports.map((r, i) => {
            const b = CAMPUS_BADGE_STYLE;
            return (
              <div key={r.id ?? i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                padding: "8px 0",
                borderBottom: i < reports.length - 1 ? `1px solid ${COLORS.BORDER}` : "none",
                gap: 8,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: COLORS.TEXT_PRIMARY, fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: 180 }}>
                    {r.title || "(untitled)"}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      background: b.bg, color: b.color, border: `1px solid ${b.color}44`,
                      borderRadius: 20, padding: "2px 8px" }}>
                      {r.campus}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                      color: COLORS.TEXT_SECONDARY }}>
                      {r._type}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, flexShrink: 0 }}>
                  {fmtDate(r.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}
