/**
 * WeeklyOps.jsx — Weekly operational hub (Weekly Ops tab).
 *
 * Renders the full weekly ops workspace: Staff Schedule, Weekly Exceptions,
 * Cafe Specials, Cash Drop, DropBox, Event Orders, Set-Up Report, and
 * Event Report widgets. Week and campus selectors at the top drive all widgets.
 * Role-based visibility: manager+ sees upload zones and DropBox.
 */

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  auth,
  fetchSchedule,
  uploadEventOrder,
  subscribeEventOrders,
  subscribeEventOrdersForWeek,
} from "./firebase.js";
import { useWidget, useWidgetSubscription } from "./hooks/useWidget.js";
import { useRole } from "./hooks/useRole.js";

import Widget          from "./components/Widget.jsx";
import WeekSelector,   { getCurrentMonday } from "./components/WeekSelector.jsx";
import CampusSelector, { CAMPUSES }         from "./components/CampusSelector.jsx";
import ScheduleTable   from "./components/ScheduleTable.jsx";
import WeeklyExceptions from "./components/WeeklyExceptions.jsx";
import CafeSpecials    from "./components/CafeSpecials.jsx";
import CashDrop        from "./components/CashDrop.jsx";
import DropBox         from "./components/DropBox.jsx";
import EventReportWidget from "./components/EventReportWidget.jsx";
import SetUpReportDrive from "./components/SetUpReportDrive.jsx";
import VendorPortal from "./components/VendorPortal.jsx";
import { COLORS, SHADOWS, RADIUS } from "./theme.js";
import { launchEmailComposer } from "./utils/emailLauncher.js";

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
  const { isAdministrator, isManager } = useRole();
  const [weekOf,        setWeekOf]        = useState(getCurrentMonday);
  const [campus,        setCampus]        = useState(CAMPUSES[0]);
  const [uploadState,   setUploadState]   = useState("IDLE");
  const [scheduleOpen,  setScheduleOpen]  = useState(false);
  const [emailCheckState, setEmailCheckState] = useState("idle");
  const [emailCheckMessage, setEmailCheckMessage] = useState("");

  const {
    data:    scheduleData,
    loading: scheduleLoading,
    error:   scheduleError,
    reload:  reloadSchedule,
  } = useWidget(() => fetchSchedule(weekOf), [weekOf]);

 const { data: eventOrders } = useWidgetSubscription(
    (cb) => subscribeEventOrdersForWeek(weekOf, cb),
    [weekOf]
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

  async function handleCheckEmailOrders() {
    setEmailCheckState("loading");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/ingest-email-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");

      const count = data.processed ?? 0;
      setEmailCheckMessage(count > 0 ? `\u2713 ${count} new order${count === 1 ? "" : "s"}` : "\u2713 No new orders");
      setEmailCheckState("success");
    } catch (err) {
      console.error("[WeeklyOps] Email check failed:", err);
      setEmailCheckMessage("\u2717 Error");
      setEmailCheckState("error");
    } finally {
      setTimeout(() => {
        setEmailCheckState("idle");
        setEmailCheckMessage("");
      }, 3000);
    }
  }

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

  /** Parse a date from BEO filenames like "BEOs - Mar 9th - 13th" */
  function parseTitleDate(fileName) {
    if (!fileName) return 0;
    const months = {
      jan:0, january:0, feb:1, february:1, mar:2, march:2,
      apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6,
      aug:7, august:7, sep:8, sept:8, september:8, oct:9, october:9,
      nov:10, november:10, dec:11, december:11,
    };
    // Match month name followed by a day number (e.g. "Mar 9th", "March 23rd")
    const m = fileName.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(\d+)/i);
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

      {/* ── 3-column widget layout ── */}
      <div style={{
        columnCount: 3,
        columnGap: 16,
        padding: "16px",
      }}>

        {/* Staff Schedule */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <Widget
            title="Staff Schedule"
            subtitle={weekLabel}
            icon="📅"
            accentColor={COLORS.AQUA}
            loading={scheduleLoading}
            error={scheduleError}
            onRetry={reloadSchedule}
            actions={[
              {
                icon: "📧",
                label: "Email",
                onClick: () => launchEmailComposer(
                  "Staff Schedule",
                  campus,
                  weekLabel,
                  `https://cafe-connection-eosin.vercel.app?tab=weekly-ops&week=${encodeURIComponent(weekOf)}`
                ),
              },
              {
                label: "↻ Refresh",
                onClick: reloadSchedule,
              },
            ]}
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

        {/* Weekly Exceptions */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <WeeklyExceptions />
        </div>

        {/* Cafe Specials */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <CafeSpecials weekOf={weekOf} campus={campus} />
        </div>

        {/* Cash Drop */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <CashDrop campus={campus} />
        </div>

        {/* DropBox — manager+ only */}
        {isManager && (
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <DropBox />
        </div>
        )}


        {/* Event Orders */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <Widget
            title="Event Orders"
            subtitle="Most recent first · click to open"
            icon="📁"
            accentColor={COLORS.AQUA}
            actions={isAdministrator ? [{
              label: emailCheckState === "loading"
                ? "Checking\u2026"
                : emailCheckState !== "idle"
                ? emailCheckMessage
                : "Check for new orders",
              onClick: handleCheckEmailOrders,
              disabled: emailCheckState === "loading",
            }] : []}
          >
            {/* Upload zone — manager+ only */}
            {isManager && (
            <div style={{ marginBottom: 16 }}>
              <EventOrderUpload onUpload={handleEventOrderUpload} uploadState={uploadState} />
            </div>
            )}

            {/* Library list */}
            {!eventOrders || eventOrders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0",
                color: COLORS.TEXT_MUTED, fontSize: 12, fontFamily: "'Poppins',sans-serif" }}>
                No event orders uploaded yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortByTitleDate(eventOrders).slice(0, 3).map(order => (
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

        {/* Set Up Report (Google Drive PDF) */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <SetUpReportDrive weekOf={weekOf} campus={campus} weekLabel={weekLabel} />
        </div>

        {/* Event Report */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <EventReportWidget weekOf={weekOf} campus={campus} weekLabel={weekLabel} />
        </div>

        {/* Vendor Portal */}
        <div style={{ breakInside: "avoid", marginBottom: 16 }}>
          <VendorPortal />
        </div>

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
