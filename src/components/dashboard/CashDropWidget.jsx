/**
 * CashDropWidget — dashboard mini-widget
 *
 * Shows the last 3 cash drop submissions for the configured campus.
 *
 * Props:
 *   config  { campus: string }
 */

import Widget from "../Widget.jsx";
import { CAMPUS_COLOR } from "../CampusSelector.jsx";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { subscribeRecentCashDrops } from "../../firebase.js";

const AQUA = "#00A2B4";
const TSEC = "#7aaec8";
const TPRI = "#FFFFFF";

function fmt$(n) {
  return n != null
    ? `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CashDropWidget({ config = {} }) {
  const campus      = config.campus ?? "Mesa Lab";
  const accentColor = CAMPUS_COLOR[campus] ?? AQUA;

  const { data: drops, loading, error } = useWidgetSubscription(
    (cb) => subscribeRecentCashDrops(campus, cb),
    [campus]
  );

  const recent = (drops ?? []).slice(0, 3);

  return (
    <Widget
      title="Cash Drops"
      subtitle={campus}
      icon="💧"
      accentColor={accentColor}
      loading={loading}
      error={error}
      empty={!loading && !error && recent.length === 0}
      emptyIcon="💧"
      emptyMessage="No cash drops recorded for this campus."
    >
      {recent.length > 0 && (
        <div>
          {recent.map((drop, i) => (
            <div key={drop.id ?? i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "8px 0",
              borderBottom: i < recent.length - 1 ? "1px solid #00307044" : "none",
            }}>
              <div>
                <div style={{ fontSize: 12, color: TPRI, fontWeight: 600 }}>{fmt$(drop.amount)}</div>
                {drop.notes && (
                  <div style={{ fontSize: 10, color: TSEC, marginTop: 2,
                    maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {drop.notes}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: TSEC }}>{fmtDate(drop.created_at)}</div>
            </div>
          ))}
          {(drops?.length ?? 0) > 3 && (
            <div style={{ fontSize: 10, color: `${TSEC}88`, marginTop: 8 }}>
              + {drops.length - 3} more — see Weekly Ops
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}
