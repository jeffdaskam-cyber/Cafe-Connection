/**
 * WeeklyOps — weekly operational hub.
 *
 * Phase 6 rewrite: full widget layout with week + campus navigation.
 *
 * Layout:
 *   Top bar  — WeekSelector (left) + CampusSelector (right)
 *   Row 1    — Staff Schedule (full width, Widget, expandable)
 *   Row 2    — Schedule Notes + Cafe Specials (2 col)
 *   Row 3    — Cash Drop + Sales Report DropBox (1:2 split)
 *   Row 4    — Event Orders (upload + library)
 */

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  fetchSchedule,
  uploadEventOrder,
  subscribeEventOrders,
} from "./firebase.js";
import { useWidget, useWidgetSubscription } from "./hooks/useWidget.js";

import Widget          from "./components/Widget.jsx";
import WeekSelector,   { getCurrentMonday } from "./components/WeekSelector.jsx";
import CampusSelector, { CAMPUSES }         from "./components/CampusSelector.jsx";
import ScheduleTable   from "./components/ScheduleTable.jsx";
import ScheduleNoteWidget from "./components/dashboard/ScheduleNoteWidget.jsx";
import CafeSpecials    from "./components/CafeSpecials.jsx";
import CashDrop        from "./components/CashDrop.jsx";
import DropBox         from "./components/DropBox.jsx";
import { COLORS, SHADOWS, RADIUS } from "./theme.js";

// ── Event Order Upload Zone ────────────────────────────────────────────────────
function EventOrderUpload({ onUpload, uploadState }) {
  const isProcessing = uploadState === "UPLOADING";
  const onDrop = useCallback((files) => files[0] && onUpload(files[0]), [onUpload]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [] },
    multiple: false,
  });

  const icon = isProcessing          ? "⏳"
    : uploadState === "SUCCESS"      ? "✓"
    : uploadState === "ERROR"        ? "✕" : "↑";

  const sub = isProcessing           ? "Uploading…"
    : uploadState === "SUCCESS"      ? "Uploaded! Drop another."
    : uploadState === "ERROR"        ? "Error — try again"
    : isDragActive                   ? "Release to upload"
    : "Drop Event Order PDF here";

  return (
    <div {...getRootProps()} style={{
      border: `1.5px dashed ${isDragActive ? COLORS.AQUA : COLORS.BORDER}`,
      borderRadius: 12, padding: "20px 16px", cursor: "pointer",
      background: isDragActive ? COLORS.AQUA_LIGHT : COLORS.BG_SURFACE_ALT,
      transition: "all 0.25s", textAlign: "center",
      position: "relative", overflow: "hidden",
    }}>
      <input {...getInputProps()} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: COLORS.AQUA, borderRadius: "12px 12px 0 0" }} />
      <div style={{ width: 36, height: 36, borderRadius: "50%",
        background: `${COLORS.AQUA}14`, border: `1px solid ${COLORS.AQUA_BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 8px", fontSize: 16, color: COLORS.AQUA, fontWeight: 700 }}>{icon}</div>
      <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins',sans-serif",
        fontWeight: 500 }}>{sub}</div>
      {isProcessing && (
        <div style={{ marginTop: 10, height: 2, background: COLORS.BORDER, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "55%", background: COLORS.AQUA,
            borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function WeeklyOps() {
  const [weekOf,        setWeekOf]        = useState(getCurrentMonday);
  const [campus,        setCampus]        = useState(CAMPUSES[0]);
  const [uploadState,   setUploadState]   = useState("IDLE");
  const [scheduleOpen,  setScheduleOpen]  = useState(false);

  const {
    data:    scheduleData,
    loading: scheduleLoading,
    error:   scheduleError,
    reload:  reloadSchedule,
  } = useWidget(() => fetchSchedule(weekOf), [weekOf]);

  const { data: eventOrders } = useWidgetSubscription(
    (cb) => subscribeEventOrders(cb),
    []
  );

  // Close modal on Escape
  useEffect(() => {
    if (!scheduleOpen) return;
    const handler = (e) => { if (e.key === "Escape") setScheduleOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [scheduleOpen]);

  const handleEventOrderUpload = useCallback(async (file) => {
    setUploadState("UPLOADING");
    try {
      await uploadEventOrder(file, () => {});
      setUploadState("SUCCESS");
      setTimeout(() => setUploadState("IDLE"), 3000);
    } catch (err) {
      console.error("[WeeklyOps] Event order upload failed:", err);
      setUploadState("ERROR");
      setTimeout(() => setUploadState("IDLE"), 3000);
    }
  }, []);

  function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatUploadDate(ts) {
    if (!ts) return "Just now";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const weekLabel = scheduleData?.weekLabel ?? `Week of ${weekOf}`;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Schedule Modal ── */}
      {scheduleOpen && (
        <div
          onClick={() => setScheduleOpen(false)}
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
                  }}>{weekLabel}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={reloadSchedule}
                  style={{
                    background: "transparent",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "5px 12px",
                    color: COLORS.TEXT_MUTED, fontSize: 11,
                    cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                    fontWeight: 600,
                  }}>↻ Refresh</button>
                <button
                  onClick={() => setScheduleOpen(false)}
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
              {scheduleLoading && (
                <div style={{ textAlign: "center", padding: "48px 0",
                  color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
                  Loading schedule…
                </div>
              )}
              {scheduleError && (
                <div style={{ textAlign: "center", padding: "48px 0",
                  color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
                  Failed to load schedule.{" "}
                  <span onClick={reloadSchedule}
                    style={{ color: COLORS.AQUA, cursor: "pointer", fontWeight: 600 }}>
                    Retry
                  </span>
                </div>
              )}
              {!scheduleLoading && !scheduleError && !scheduleData?.rows?.length && (
                <div style={{ textAlign: "center", padding: "48px 0",
                  color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
                  📭 No schedule found for this week.
                </div>
              )}
              {scheduleData && (
                <ScheduleTable rows={scheduleData.rows} colorMap={scheduleData.colorMap} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar: WeekSelector + CampusSelector ── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 28, flexWrap: "wrap", gap: 12,
      }}>
        <WeekSelector weekOf={weekOf} onChange={setWeekOf} disabled={scheduleLoading} />
        <CampusSelector value={campus} onChange={setCampus} size="sm" />
      </div>

      {/* ── Row 1: Staff Schedule (compact trigger) ── */}
      <div style={{ marginBottom: 20, animation: "ucar-fadein .5s ease both" }}>
        <Widget
          title="Staff Schedule"
          subtitle={weekLabel}
          icon="📅"
          accentColor={COLORS.AQUA}
          loading={scheduleLoading}
          error={scheduleError}
          onRetry={reloadSchedule}
          actions={[{
            label: "↻ Refresh",
            onClick: reloadSchedule,
          }]}
        >
          <div style={{
            padding: "16px 4px",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ fontFamily: "'Poppins',sans-serif" }}>
              {scheduleLoading ? (
                <span style={{ color: COLORS.TEXT_MUTED, fontSize: 12 }}>
                  Loading schedule…
                </span>
              ) : scheduleError ? (
                <span style={{ color: COLORS.TEXT_MUTED, fontSize: 12 }}>
                  Could not load schedule.
                </span>
              ) : scheduleData?.rows?.length ? (
                <button
                  onClick={() => setScheduleOpen(true)}
                  style={{
                    background: "transparent", border: "none",
                    padding: 0, cursor: "pointer",
                    color: COLORS.AQUA, fontSize: 13,
                    fontWeight: 700, fontFamily: "'Poppins',sans-serif",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  View schedule → {weekLabel}
                </button>
              ) : (
                <span style={{ color: COLORS.TEXT_MUTED, fontSize: 12 }}>
                  No schedule found for this week.
                </span>
              )}
            </div>
          </div>
        </Widget>
      </div>

      {/* ── Row 2: Schedule Notes + Cafe Specials ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 20, marginBottom: 20,
        animation: "ucar-fadein .55s ease both",
      }}>
        <ScheduleNoteWidget />
        <CafeSpecials  weekOf={weekOf} campus={campus} />
      </div>

      {/* ── Row 3: Cash Drop + DropBox ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 2fr",
        gap: 20, marginBottom: 28,
        animation: "ucar-fadein .6s ease both",
      }}>
        <CashDrop campus={campus} />
        <DropBox />
      </div>

      {/* —— Row 4: Event Orders —— */}
      <div style={{ marginBottom: 28, animation: "ucar-fadein .65s ease both" }}>
        <Widget
          title="Event Orders"
          subtitle="Most recent first · click to open"
          icon="📁"
          accentColor={COLORS.AQUA}
        >
          {/* Upload zone */}
          <div style={{ marginBottom: 16 }}>
            <EventOrderUpload onUpload={handleEventOrderUpload} uploadState={uploadState} />
          </div>

          {/* Library list */}
          {!eventOrders || eventOrders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0",
              color: COLORS.TEXT_MUTED, fontSize: 12, fontFamily: "'Poppins',sans-serif" }}>
              No event orders uploaded yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {eventOrders.map(order => (
                <a
                  key={order.id}
                  href={order.downloadURL}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px", borderRadius: RADIUS.MD,
                    background: COLORS.BG_SURFACE_ALT,
                    border: `1px solid ${COLORS.BORDER}`,
                    textDecoration: "none", transition: "all .2s", cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.AQUA_BORDER}
                  onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.BORDER}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8,
                      background: `${COLORS.ORANGE}15`, border: `1px solid ${COLORS.ORANGE}33`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15 }}>
                      📄
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600,
                        color: COLORS.TEXT_PRIMARY, fontFamily: "'Poppins',sans-serif",
                        marginBottom: 2 }}>
                        {order.fileName}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED,
                        fontFamily: "'Poppins',sans-serif" }}>
                        {formatUploadDate(order.uploadedAt)} · {formatFileSize(order.size)}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.AQUA,
                    fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>
                    Open →
                  </div>
                </a>
              ))}
            </div>
          )}
        </Widget>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 40, textAlign: "center", fontSize: 10,
        color: COLORS.TEXT_DISABLED, fontWeight: 500, letterSpacing: "0.08em",
        textTransform: "uppercase", fontFamily: "'Poppins',sans-serif" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
