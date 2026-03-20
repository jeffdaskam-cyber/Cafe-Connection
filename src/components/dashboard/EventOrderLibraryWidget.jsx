import Widget from "../Widget.jsx";
import { subscribeEventOrders } from "../../firebase.js";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { COLORS, RADIUS } from "../../theme.js";

function formatUploadDate(ts) {
  if (!ts) return "Just now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncateFileName(name, max = 40) {
  if (!name || name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

/** Parse a date from BEO filenames like "BEOs- March 23rd - 27th" */
function parseTitleDate(fileName) {
  if (!fileName) return 0;
  const months = { january:0, february:1, march:2, april:3, may:4, june:5,
    july:6, august:7, september:8, october:9, november:10, december:11 };
  const m = fileName.match(/([A-Za-z]+)\s+(\d+)/);
  if (!m) return 0;
  const mon = months[m[1].toLowerCase()];
  if (mon === undefined) return 0;
  const day = parseInt(m[2], 10);
  const now = new Date();
  return new Date(now.getFullYear(), mon, day).getTime();
}

function sortByTitleDate(orders) {
  return [...orders].sort((a, b) => parseTitleDate(b.fileName) - parseTitleDate(a.fileName));
}

export default function EventOrderLibraryWidget() {
  const { data: orders, loading, error } = useWidgetSubscription(
    (cb) => subscribeEventOrders(cb),
    []
  );

  const safeOrders = sortByTitleDate(orders ?? []).slice(0, 3);

  return (
    <Widget
      title="Event Order Library"
      subtitle="Most recent first"
      icon="📄"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      empty={!loading && !error && safeOrders.length === 0}
      emptyIcon="📄"
      emptyMessage="No event orders uploaded yet."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {safeOrders.map(order => (
          <div
            key={order.id}
            style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 14px",
              borderRadius: RADIUS.MD,
              background: COLORS.BG_SURFACE_ALT,
              border: `1px solid ${COLORS.BORDER}`,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.AQUA_BORDER}
            onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.BORDER}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                background: `${COLORS.ORANGE}15`,
                border: `1px solid ${COLORS.ORANGE}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13,
              }}>📄</div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  color: COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: 600,
                  fontFamily: "'Poppins',sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {truncateFileName(order.fileName)}
                </div>
                <div style={{
                  color: COLORS.TEXT_MUTED, fontSize: 10,
                  fontFamily: "'Poppins',sans-serif",
                }}>
                  {formatUploadDate(order.uploadedAt)}
                </div>
              </div>
            </div>
            <a
              href={order.downloadURL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: COLORS.AQUA, fontSize: 11, fontWeight: 600,
                fontFamily: "'Poppins',sans-serif", whiteSpace: "nowrap",
                textDecoration: "none", flexShrink: 0, marginLeft: 12,
              }}
            >
              Open →
            </a>
          </div>
        ))}
      </div>
    </Widget>
  );
}
