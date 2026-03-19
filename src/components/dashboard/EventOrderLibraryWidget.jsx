import { subscribeEventOrders } from "../../firebase.js";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { COLORS, SHADOWS, RADIUS } from "../../theme.js";

function formatUploadDate(ts) {
  if (!ts) return "Just now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncateFileName(name, max = 40) {
  if (!name || name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

export default function EventOrderLibraryWidget() {
  const { data: orders, loading } = useWidgetSubscription(
    (cb) => subscribeEventOrders(cb),
    []
  );

  const safeOrders = orders ?? [];

  return (
    <div style={{
      background: COLORS.BG_SURFACE,
      borderRadius: RADIUS.LG,
      border: `1px solid ${COLORS.BORDER}`,
      boxShadow: SHADOWS.SM,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px 14px",
        borderBottom: `1px solid ${COLORS.BORDER}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            color: COLORS.TEXT_PRIMARY,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "'Poppins',sans-serif",
            letterSpacing: "0.01em",
          }}>
            Event Order Library
          </div>
          <div style={{
            color: COLORS.TEXT_MUTED,
            fontSize: 10,
            fontFamily: "'Poppins',sans-serif",
            marginTop: 2,
          }}>
            {loading
              ? "Loading…"
              : `${safeOrders.length} file${safeOrders.length !== 1 ? "s" : ""} · most recent first`}
          </div>
        </div>
        <div style={{
          width: 28, height: 28,
          borderRadius: RADIUS.SM,
          background: `${COLORS.AQUA}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14,
        }}>
          📄
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px" }}>
        {loading ? (
          <div style={{
            textAlign: "center", padding: "28px 0",
            color: COLORS.TEXT_MUTED, fontSize: 12,
            fontFamily: "'Poppins',sans-serif",
          }}>
            Loading event orders…
          </div>
        ) : safeOrders.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "28px 0",
            color: COLORS.TEXT_MUTED, fontSize: 12,
            fontFamily: "'Poppins',sans-serif",
          }}>
            No event orders uploaded yet.
          </div>
        ) : (
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
                  View →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
