/**
 * ScheduleWidget — dashboard mini-widget
 *
 * Shows the current week label as a clickable link.
 * Clicking opens a full-screen modal with the complete ScheduleTable,
 * identical to the Weekly Ops schedule modal.
 *
 * Props:
 *   config  {} (no campus filter — schedule is org-wide)
 */

import { useState, useEffect, useCallback } from "react";
import Widget from "../Widget.jsx";
import ScheduleTable from "../ScheduleTable.jsx";
import { useWidget } from "../../hooks/useWidget.js";
import { fetchSchedule } from "../../firebase.js";
import { COLORS } from "../../theme.js";

function currentMonday() {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export default function ScheduleWidget({ config = {} }) {
  const weekOf  = currentMonday();
  const fetcher = useCallback(() => fetchSchedule(weekOf), [weekOf]);
  const { data, loading, error, reload } = useWidget(fetcher, [weekOf]);

  const [modalOpen, setModalOpen] = useState(false);

  const label = data?.weekLabel ?? `Week of ${weekOf}`;

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e) => { if (e.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen]);

  return (
    <>
      {/* ── Modal ── */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(1,24,55,0.82)",
            display: "flex", alignItems: "flex-start",
            justifyContent: "center",
            padding: "48px 24px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: COLORS.BG_SURFACE,
              borderRadius: 16,
              border: `1px solid ${COLORS.BORDER}`,
              width: "100%", maxWidth: 1100,
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 24px",
              borderBottom: `1px solid ${COLORS.BORDER}`,
              background: COLORS.BG_SURFACE_ALT,
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: COLORS.TEXT_PRIMARY,
                    fontFamily: "'Poppins',sans-serif",
                  }}>Staff Schedule</div>
                  <div style={{
                    fontSize: 11, color: COLORS.TEXT_MUTED,
                    fontFamily: "'Poppins',sans-serif",
                  }}>{label}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={reload}
                  style={{
                    background: "transparent",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "5px 12px",
                    color: COLORS.TEXT_MUTED, fontSize: 11,
                    cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                    fontWeight: 600,
                  }}>↻ Refresh</button>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "5px 14px",
                    color: COLORS.TEXT_MUTED, fontSize: 16,
                    cursor: "pointer", lineHeight: 1,
                  }}>✕</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: "24px", overflowY: "auto", maxHeight: "75vh" }}>
              {loading && (
                <div style={{ textAlign: "center", padding: "48px 0",
                  color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
                  Loading schedule…
                </div>
              )}
              {error && (
                <div style={{ textAlign: "center", padding: "48px 0",
                  color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
                  Failed to load schedule.{" "}
                  <span onClick={reload}
                    style={{ color: COLORS.AQUA, cursor: "pointer", fontWeight: 600 }}>
                    Retry
                  </span>
                </div>
              )}
              {!loading && !error && !data?.rows?.length && (
                <div style={{ textAlign: "center", padding: "48px 0",
                  color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
                  📭 No schedule found for this week.
                </div>
              )}
              {data && (
                <ScheduleTable rows={data.rows} colorMap={data.colorMap} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Widget tile ── */}
      <Widget
        title="Staff Schedule"
        subtitle={label}
        icon="📅"
        accentColor={COLORS.AQUA}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!loading && !error && !data?.rows?.length}
        emptyIcon="📅"
        emptyMessage="No schedule found for this week."
        actions={[{ label: "↻ Refresh", onClick: reload }]}
      >
        <div style={{ padding: "16px 4px" }}>
          {data?.rows?.length ? (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                background: "transparent", border: "none",
                padding: 0, cursor: "pointer",
                color: COLORS.AQUA, fontSize: 13,
                fontWeight: 700, fontFamily: "'Poppins',sans-serif",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              View schedule → {label}
            </button>
          ) : null}
        </div>
      </Widget>
    </>
  );
}
