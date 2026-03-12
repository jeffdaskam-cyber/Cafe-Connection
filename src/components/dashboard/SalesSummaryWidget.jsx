/**
 * SalesSummaryWidget — dashboard mini-widget
 *
 * Shows the most recent net revenue, total checks, and avg lunch check
 * for the configured campus. Uses a real-time Firestore subscription.
 *
 * Props:
 *   config  { campus: string }
 */

import Widget from "../Widget.jsx";
import { CAMPUS_COLOR } from "../CampusSelector.jsx";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { subscribeToCampus } from "../../firebase.js";
import { COLORS } from "../../theme.js";

function fmt$  (n) { return n != null ? `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"; }
function fmtInt(n) { return n != null ? Number(n).toLocaleString("en-US") : "—"; }

function KpiRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "9px 0", borderBottom: `1px solid ${COLORS.BORDER}` }}>
      <span style={{ fontSize: 11, color: COLORS.TEXT_MUTED, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: color ?? COLORS.TEXT_PRIMARY, letterSpacing: "-0.01em" }}>{value}</span>
    </div>
  );
}

export default function SalesSummaryWidget({ config = {} }) {
  const campus = config.campus ?? "Mesa Lab";
  const accentColor = CAMPUS_COLOR[campus] ?? COLORS.AQUA;

  const { data: docs, loading, error } = useWidgetSubscription(
    (cb) => subscribeToCampus(campus, cb),
    [campus]
  );

  // Find the most recent daily doc
  const latest = docs
    ? [...docs].filter(d => d.report_type === "daily" || !d.report_type)
        .sort((a, b) => {
          const ta = a.date?.toDate?.() ?? new Date(0);
          const tb = b.date?.toDate?.() ?? new Date(0);
          return tb - ta;
        })[0]
    : null;

  const dateLabel = latest?.date
    ? (() => {
        const d = latest.date.toDate ? latest.date.toDate() : new Date(latest.date);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      })()
    : null;

  return (
    <Widget
      title="Sales Summary"
      subtitle={campus}
      icon="📊"
      accentColor={accentColor}
      loading={loading}
      error={error}
      empty={!loading && !error && !latest}
      emptyIcon="📭"
      emptyMessage="No recent sales data for this campus."
    >
      {latest && (
        <div>
          {dateLabel && (
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 4, paddingTop: 2 }}>
              Most recent: {dateLabel}
            </div>
          )}
          <KpiRow label="Net Revenue"     value={fmt$(latest.net_revenue)}     color={accentColor} />
          <KpiRow label="Total Checks"    value={fmtInt(latest.total_checks)}  />
          <KpiRow label="Avg Lunch Check" value={fmt$(latest.lunch_avg_check)} />
          <div style={{ fontSize: 10, color: COLORS.TEXT_DISABLED, marginTop: 8, textAlign: "right" }}>
            Live · updated automatically
          </div>
        </div>
      )}
    </Widget>
  );
}
