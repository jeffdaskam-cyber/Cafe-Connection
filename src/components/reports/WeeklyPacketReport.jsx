/**
 * WeeklyPacketReport — Assembles Staff Schedule, Event Report, Set Up Report,
 * and all BEOs for a selected week into a single printable packet.
 *
 * Uses CSS @page rules to control orientation per section.
 * No server-side PDF merge — all assembly is client-side via print CSS.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { fetchEventReport, fetchSetupReport, fetchSchedulePdf, getEventOrdersByWeek } from "../../firebase.js";
import { getNextMonday, addWeeks, formatWeekLabel } from "../WeekSelector.jsx";
import Widget from "../Widget.jsx";
import { COLORS, RADIUS } from "../../theme.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function base64ToBlobUrl(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

// Status icon per section
function StatusIcon({ ok, loading, error }) {
  if (loading) return <span style={{ color: COLORS.TEXT_MUTED }}>...</span>;
  if (error)   return <span title={error}>&#9888;</span>;
  if (ok)      return <span style={{ color: COLORS.SUCCESS }}>&#10003;</span>;
  return <span style={{ color: COLORS.TEXT_DISABLED }}>—</span>;
}

// ── Print stylesheet (injected once) ─────────────────────────────────────────

const PRINT_STYLE_ID = "weekly-packet-print-style";

function ensurePrintStyle() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body > *:not(#weekly-packet-print) { display: none !important; }
      #weekly-packet-print {
        display: block !important;
        position: static !important;
        left: auto !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        pointer-events: auto !important;
      }
      .packet-section { page-break-after: always; }
      .packet-section:last-child { page-break-after: avoid; }
      .packet-section iframe {
        width: 100%;
        height: 100vh;
        border: none;
      }
    }
    @page portrait-page { size: portrait; }
    @page landscape-page { size: landscape; }
    .packet-section.portrait { page: portrait-page; }
    .packet-section.landscape { page: landscape-page; }
  `;
  document.head.appendChild(style);
}

// ── Week Selector (compact, for Reports page) ───────────────────────────────

function PacketWeekSelector({ value, onChange }) {
  const [hovPrev, setHovPrev] = useState(false);
  const [hovNext, setHovNext] = useState(false);

  const btnStyle = (hovered) => ({
    background: hovered ? COLORS.AQUA_LIGHT : "transparent",
    border: `1px solid ${hovered ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontFamily: "'Poppins',sans-serif",
    fontWeight: 700, fontSize: 13,
    color: hovered ? COLORS.AQUA : COLORS.TEXT_SECONDARY,
    transition: "all .18s",
    lineHeight: 1,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <button
        onClick={() => onChange(addWeeks(value, -1))}
        onMouseEnter={() => setHovPrev(true)}
        onMouseLeave={() => setHovPrev(false)}
        style={btnStyle(hovPrev)}
      >
        &#8249; Prev
      </button>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: COLORS.BG_SURFACE_ALT,
        border: `1px solid ${COLORS.BORDER}`,
        borderRadius: 8,
        padding: "6px 14px",
        minWidth: 200, justifyContent: "center",
      }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: COLORS.TEXT_PRIMARY,
          fontFamily: "'Poppins',sans-serif", whiteSpace: "nowrap",
        }}>
          Week of {formatWeekLabel(value)}
        </span>
      </div>
      <button
        onClick={() => onChange(addWeeks(value, 1))}
        onMouseEnter={() => setHovNext(true)}
        onMouseLeave={() => setHovNext(false)}
        style={btnStyle(hovNext)}
      >
        Next &#8250;
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function WeeklyPacketReport() {
  const [selectedWeek, setSelectedWeek] = useState(getNextMonday);

  const [schedule,    setSchedule]    = useState({ data: null, loading: false, error: null });
  const [eventReport, setEventReport] = useState({ data: null, loading: false, error: null });
  const [setupReport, setSetupReport] = useState({ data: null, loading: false, error: null });
  const [beos,        setBeos]        = useState({ data: [],   loading: false, error: null });

  // Track blob URLs for cleanup
  const blobUrls = useRef([]);

  const cleanupBlobs = useCallback(() => {
    blobUrls.current.forEach(url => URL.revokeObjectURL(url));
    blobUrls.current = [];
  }, []);

  const makeBlobUrl = useCallback((base64) => {
    const url = base64ToBlobUrl(base64);
    blobUrls.current.push(url);
    return url;
  }, []);

  // Fetch all sections when week changes
  useEffect(() => {
    cleanupBlobs();
    let cancelled = false;

    async function fetchAll() {
      // Schedule PDF
      setSchedule(s => ({ ...s, loading: true, error: null }));
      setEventReport(s => ({ ...s, loading: true, error: null }));
      setSetupReport(s => ({ ...s, loading: true, error: null }));
      setBeos(s => ({ ...s, loading: true, error: null }));

      // Fetch all four in parallel
      const [schedRes, eventRes, setupRes, beoRes] = await Promise.allSettled([
        fetchSchedulePdf(selectedWeek),
        fetchEventReport(selectedWeek),
        fetchSetupReport(selectedWeek),
        getEventOrdersByWeek(selectedWeek),
      ]);

      if (cancelled) return;

      // Schedule
      if (schedRes.status === "fulfilled" && schedRes.value?.pdf) {
        setSchedule({ data: { blobUrl: makeBlobUrl(schedRes.value.pdf), weekLabel: schedRes.value.weekLabel }, loading: false, error: null });
      } else {
        setSchedule({ data: null, loading: false, error: schedRes.status === "rejected" ? schedRes.reason?.message : "Not found" });
      }

      // Event Report
      if (eventRes.status === "fulfilled" && eventRes.value?.pdf) {
        setEventReport({ data: { blobUrl: makeBlobUrl(eventRes.value.pdf), weekLabel: eventRes.value.weekLabel }, loading: false, error: null });
      } else {
        setEventReport({ data: null, loading: false, error: eventRes.status === "rejected" ? eventRes.reason?.message : "Not found" });
      }

      // Setup Report
      if (setupRes.status === "fulfilled" && setupRes.value?.pdf) {
        setSetupReport({ data: { blobUrl: makeBlobUrl(setupRes.value.pdf), weekLabel: setupRes.value.weekLabel }, loading: false, error: null });
      } else {
        setSetupReport({ data: null, loading: false, error: setupRes.status === "rejected" ? setupRes.reason?.message : "Not found" });
      }

      // BEOs
      if (beoRes.status === "fulfilled" && beoRes.value) {
        setBeos({ data: beoRes.value, loading: false, error: null });
      } else {
        setBeos({ data: [], loading: false, error: beoRes.status === "rejected" ? beoRes.reason?.message : null });
      }
    }

    fetchAll();
    return () => { cancelled = true; cleanupBlobs(); };
  }, [selectedWeek, cleanupBlobs, makeBlobUrl]);

  // Print handler
  const handlePrint = () => {
    ensurePrintStyle();
    // Small delay to let the style inject
    requestAnimationFrame(() => window.print());
  };

  const anyLoading = schedule.loading || eventReport.loading || setupReport.loading || beos.loading;
  const sectionsLoaded = [schedule.data, eventReport.data, setupReport.data].filter(Boolean).length + (beos.data.length > 0 ? 1 : 0);

  return (
    <>
    <Widget
      title="Weekly Packet"
      subtitle={`Week of ${formatWeekLabel(selectedWeek)}`}
      icon="📦"
      accentColor={COLORS.AQUA}
      loading={false}
    >
      <div style={{ paddingTop: 4 }}>
        <PacketWeekSelector value={selectedWeek} onChange={setSelectedWeek} />

        {/* Section checklist */}
        <div style={{
          background: COLORS.BG_SURFACE_ALT,
          border: `1px solid ${COLORS.BORDER}`,
          borderRadius: RADIUS.MD,
          padding: "14px 16px",
          marginBottom: 16,
        }}>
          {anyLoading && (
            <div style={{
              fontSize: 11, color: COLORS.TEXT_MUTED,
              fontFamily: "'Poppins',sans-serif",
              marginBottom: 10,
            }}>
              Loading sections...
            </div>
          )}

          {[
            { label: "Staff Schedule", state: schedule, suffix: schedule.data?.weekLabel },
            { label: "Event Report",   state: eventReport, suffix: eventReport.data?.weekLabel },
            { label: "Set Up Report",  state: setupReport, suffix: setupReport.data?.weekLabel },
            { label: `BEOs (${beos.data.length} file${beos.data.length !== 1 ? "s" : ""})`, state: beos, suffix: null },
          ].map(({ label, state, suffix }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 0",
              fontSize: 12,
              fontFamily: "'Poppins',sans-serif",
              color: state.error && !state.data ? COLORS.WARNING : COLORS.TEXT_PRIMARY,
            }}>
              <StatusIcon
                ok={label.startsWith("BEOs") ? beos.data.length > 0 : !!state.data}
                loading={state.loading}
                error={state.error}
              />
              <span style={{ fontWeight: 600 }}>{label}</span>
              {suffix && (
                <span style={{ fontSize: 10, color: COLORS.TEXT_MUTED }}>
                  — {suffix}
                </span>
              )}
              {state.error && !state.data && (
                <span style={{ fontSize: 10, color: COLORS.WARNING, marginLeft: "auto" }}>
                  {state.error}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Print button */}
        <button
          onClick={handlePrint}
          disabled={anyLoading || sectionsLoaded === 0}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: RADIUS.SM,
            border: "none",
            background: (!anyLoading && sectionsLoaded > 0) ? COLORS.AQUA : COLORS.BG_SURFACE_HOVER,
            color: (!anyLoading && sectionsLoaded > 0) ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_DISABLED,
            fontFamily: "'Poppins',sans-serif",
            fontWeight: 700, fontSize: 13,
            cursor: (!anyLoading && sectionsLoaded > 0) ? "pointer" : "not-allowed",
            boxShadow: (!anyLoading && sectionsLoaded > 0) ? `0 4px 16px ${COLORS.AQUA}33` : "none",
            transition: "all .18s",
          }}
        >
          {anyLoading ? "Loading..." : `Print Packet (${sectionsLoaded} section${sectionsLoaded !== 1 ? "s" : ""})`}
        </button>

      </div>
    </Widget>
    {/* Print container — portaled to body, offscreen but rendered so iframes load */}
    {createPortal(
      <div id="weekly-packet-print" style={{
        position: "fixed", left: "-9999px", top: 0,
        width: "100vw", height: 0, overflow: "hidden",
        pointerEvents: "none",
      }}>
        {schedule.data?.blobUrl && (
          <div className="packet-section portrait">
            <iframe src={schedule.data.blobUrl} title="Staff Schedule" />
          </div>
        )}
        {eventReport.data?.blobUrl && (
          <div className="packet-section landscape">
            <iframe src={eventReport.data.blobUrl} title="Event Report" />
          </div>
        )}
        {setupReport.data?.blobUrl && (
          <div className="packet-section landscape">
            <iframe src={setupReport.data.blobUrl} title="Set Up Report" />
          </div>
        )}
        {beos.data.map((beo, i) => (
          <div key={beo.id || i} className="packet-section">
            <iframe src={beo.downloadURL} title={`BEO ${i + 1} — ${beo.fileName}`} />
          </div>
        ))}
      </div>,
      document.body
    )}
    </>
  );
}
