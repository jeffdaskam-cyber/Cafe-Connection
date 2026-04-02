/**
 * SalesSummaryWidget — dashboard mini-widget
 *
 * Shows the most recent net revenue, total checks, and avg lunch check
 * for the selected campus. Includes an inline campus switcher.
 * "All Campuses" sums the most recent net revenue and total checks across
 * all three campuses for a combined operation total.
 *
 * Props:
 *   config  { campus: string }
 */

import { useState } from "react";
import Widget from "../Widget.jsx";
import { CAMPUS_COLOR, CAMPUSES } from "../CampusSelector.jsx";
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

const ALL_CAMPUSES      = "All Campuses";
const SELECTOR_CAMPUSES = [ALL_CAMPUSES, ...CAMPUSES];

function CampusPills({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
      {SELECTOR_CAMPUSES.map(c => {
        const active = c === value;
        const color  = c === ALL_CAMPUSES ? COLORS.AQUA : (CAMPUS_COLOR[c] ?? COLORS.AQUA);
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              padding: "3px 9px",
              borderRadius: 4,
              border: `1px solid ${active ? color : COLORS.BORDER}`,
              background: active ? `${color}18` : "transparent",
              color: active ? color : COLORS.TEXT_MUTED,
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: "0.03em",
              cursor: "pointer",
              transition: "all .15s",
            }}>
            {c}
          </button>
        );
      })}
    </div>
  );
}

export default function SalesSummaryWidget({ config = {} }) {
  const [activeCampus, setActiveCampus] = useState(config.campus ?? "Mesa Lab");
  const isAll       = activeCampus === ALL_CAMPUSES;
  const accentColor = COLORS.AQUA;

  const { data: docs, loading, error } = useWidgetSubscription(
    (cb) => subscribeToCampus(activeCampus, cb),
    [activeCampus]
  );

  // Derive display data
  const { latest, dateLabel } = (() => {
    if (!docs) return { latest: null, dateLabel: null };
    const daily = docs.filter(d => d.report_type === "daily" || !d.report_type);

    if (isAll) {
      // Sum the most recent doc per campus
      const latestPerCampus = CAMPUSES
        .map(c =>
          daily
            .filter(d => d.campus === c)
            .sort((a, b) => {
              const ta = a.date?.toDate?.() ?? new Date(0);
              const tb = b.date?.toDate?.() ?? new Date(0);
              return tb - ta;
            })[0] ?? null
        )
        .filter(Boolean);

      if (!latestPerCampus.length) return { latest: null, dateLabel: null };

      return {
        latest: {
          net_revenue:  latestPerCampus.reduce((s, d) => s + (d.net_revenue  ?? 0), 0),
          total_checks: latestPerCampus.reduce((s, d) => s + (d.total_checks ?? 0), 0),
        },
        dateLabel: null, // dates may differ per campus
      };
    }

    const doc = daily.sort((a, b) => {
      const ta = a.date?.toDate?.() ?? new Date(0);
      const tb = b.date?.toDate?.() ?? new Date(0);
      return tb - ta;
    })[0] ?? null;

    const dateLabel = doc?.date
      ? (() => {
          const d = doc.date.toDate ? doc.date.toDate() : new Date(doc.date);
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        })()
      : null;

    return { latest: doc, dateLabel };
  })();

  return (
    <Widget
      title="Sales Summary"
      subtitle={activeCampus}
      icon="📊"
      accentColor={accentColor}
      loading={loading}
      error={error}
    >
      <CampusPills value={activeCampus} onChange={setActiveCampus} />
      {!latest ? (
        <div style={{ textAlign: "center", padding: "20px 0 8px",
          fontSize: 12, color: COLORS.TEXT_MUTED }}>
          No recent sales data.
        </div>
      ) : (
        <div>
          {dateLabel && (
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 4 }}>
              Most recent: {dateLabel}
            </div>
          )}
          <KpiRow label={isAll ? "Total Net Revenue" : "Net Revenue"}
                  value={fmt$(latest.net_revenue)} color={accentColor} />
          <KpiRow label="Total Checks" value={fmtInt(latest.total_checks)} />
          {!isAll && (
            <KpiRow label="Avg Lunch Check" value={fmt$(latest.lunch_avg_check)} />
          )}
          <div style={{ fontSize: 10, color: COLORS.TEXT_DISABLED, marginTop: 8, textAlign: "right" }}>
            Live · updated automatically
          </div>
        </div>
      )}
    </Widget>
  );
}
