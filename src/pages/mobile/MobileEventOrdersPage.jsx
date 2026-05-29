import { useState, useEffect } from "react";
import { subscribeEventOrders } from "../../firebase.js";
import { COLORS } from "../../theme.js";

function formatUploadDate(ts) {
  if (!ts) return "Just now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseTitleDate(fileName) {
  if (!fileName) return 0;
  const months = {
    jan:0, january:0, feb:1, february:1, mar:2, march:2,
    apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6,
    aug:7, august:7, sep:8, sept:8, september:8, oct:9, october:9,
    nov:10, november:10, dec:11, december:11,
  };
  const m = fileName.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(\d+)/i);
  if (!m) return 0;
  const mon = months[m[1].toLowerCase()];
  if (mon === undefined) return 0;
  const day = parseInt(m[2], 10);
  return new Date(new Date().getFullYear(), mon, day).getTime();
}

function sortByTitleDate(orders) {
  return [...orders].sort((a, b) => parseTitleDate(b.fileName) - parseTitleDate(a.fileName));
}

export default function MobileEventOrdersPage() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeEventOrders((data) => {
      setOrders(sortByTitleDate(data ?? []));
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={headingStyle}>Event Order Library</h2>

      {loading && <p style={mutedStyle}>Loading...</p>}

      {!loading && orders.length === 0 && (
        <p style={mutedStyle}>No event orders uploaded yet.</p>
      )}

      {!loading && orders.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {orders.map((order) => (
            <div
              key={order.id}
              style={{
                background:   COLORS.BG_SURFACE,
                borderRadius: 10,
                border:       `1px solid ${COLORS.BORDER}`,
                padding:      "12px 14px",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "space-between",
                gap:          10,
                boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: `${COLORS.ORANGE}20`,
                  border: `1px solid ${COLORS.ORANGE}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                }}>📄</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    color:      COLORS.TEXT_PRIMARY,
                    fontSize:   13,
                    fontWeight: 600,
                    overflow:   "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {order.fileName}
                  </div>
                  <div style={{ color: COLORS.TEXT_MUTED, fontSize: 11, marginTop: 2 }}>
                    {formatUploadDate(order.uploadedAt)}
                  </div>
                </div>
              </div>
              <a
                href={order.downloadURL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color:          COLORS.AQUA,
                  fontSize:       12,
                  fontWeight:     700,
                  whiteSpace:     "nowrap",
                  textDecoration: "none",
                  flexShrink:     0,
                }}
              >
                Open →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const headingStyle = { fontSize: 16, fontWeight: 700, color: COLORS._DARKBLUE, marginBottom: 12 };
const mutedStyle   = { color: COLORS.TEXT_MUTED, fontSize: 13 };
