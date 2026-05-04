/**
 * SalesSummaryWidget — dashboard mini-widget
 *
 * Shows month-to-date net revenue, total checks, and avg lunch check
 * for the selected campus. Includes an inline campus switcher.
 * "All Campuses" sums MTD net revenue and total checks across all three
 * campuses for a combined operation total.
 *
 * Props:
 *   config  { campus: string }
 */

import { useState } from "react";
import Widget from "../Widget.jsx";
import { CAMPUSES } from "../CampusSelector.jsx";
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
        const color  = COLORS.AQUA;
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

function getMtdStart() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function SalesSummaryWidget({ config = {} }) {
  const [activeCampus, setActiveCampus] = useState(config.campus ?? "Mesa Lab");
  const isAll       = activeCampus === ALL_CAMPUSES;
  const accentColor = COLORS.AQUA;

  const mtdStart = getMtdStart();

  const { data: docs, loading, error } = useWidgetSubscription(
    (cb) => subscribeToCampus(activeCampus, cb, mtdStart),
    [activeCampus]
  );

  // Derive MTD display data
  const { mtd, dayCount } = (() => {
    if (!docs) return { mtd: null, dayCount: 0 };
    const daily = docs.filter(d => d.report_type === "daily" || !d.report_type);

    if (isAll) {
      const perCampus = CAMPUSES.map(c => {
        const campusDocs = daily.filter(d => d.campus === c);
        return {
          net_revenue:  campusDocs.reduce((s, d) => s + (d.net_revenue  ?? 0), 0),
          total_checks: campusDocs.reduce((s, d) => s + (d.total_checks ?? 0), 0),
        };
      });

      if (!perCampus.length) return { mtd: null, dayCount: 0 };

      return {
        mtd: {
          net_revenue:  perCampus.reduce((s, c) => s + c.net_revenue,  0),
          total_checks: perCampus.reduce((s, c) => s + c.total_checks, 0),
        },
        dayCount: new Set(daily.map(d => d.date)).size,
      };
    }

    // Single campus
    if (!daily.length) return { mtd: null, dayCount: 0 };

    const lunchDocs = daily.filter(d => d.lunch_avg_check != null);
    const lunchAvg  = lunchDocs.length
      ? lunchDocs.reduce((s, d) => s + d.lunch_avg_check, 0) / lunchDocs.length
      : null;

    return {
      mtd: {
        net_revenue:     daily.reduce((s, d) => s + (d.net_revenue  ?? 0), 0),
        total_checks:    daily.reduce((s, d) => s + (d.total_checks ?? 0), 0),
        lunch_avg_check: lunchAvg,
      },
      dayCount: daily.length,
    };
  })();

  return (
    <Widget
      title="Cafe Sales Summary"
      subtitle={activeCampus}
      icon="📊"
      accentColor={accentColor}
      loading={loading}
      error={error}
    >
      <CampusPills value={activeCampus} onChange={setActiveCampus} />
      {!mtd ? (
        <div style={{ textAlign: "center", padding: "20px 0 8px",
          fontSize: 12, color: COLORS.TEXT_MUTED }}>
          No sales data this month.
        </div>
      ) : (
        <div>
          <KpiRow label={isAll ? "Total Net Revenue" : "Net Revenue"}
                  value={fmt$(mtd.net_revenue)} color={accentColor} />
          <KpiRow label="Total Checks" value={fmtInt(mtd.total_checks)} />
          {!isAll && (
            <KpiRow label="Avg Lunch Check" value={fmt$(mtd.lunch_avg_check)} />
          )}
          <div style={{ fontSize: 10, color: COLORS.TEXT_DISABLED, marginTop: 8, textAlign: "right" }}>
            Live · updated automatically
          </div>
        </div>
      )}
    </Widget>
  );
}
