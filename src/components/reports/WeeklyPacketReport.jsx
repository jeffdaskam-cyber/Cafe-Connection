/**
 * WeeklyPacketReport — Assembles Staff Schedule, Event Report, Set Up Report,
 * and all BEOs for a selected week into a single printable packet.
 *
 * Uses PDF.js to render each PDF page to canvas, then prints the resulting
 * images. This avoids the iframe/PDF-viewer-chrome print bug entirely.
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { fetchEventReport, fetchSetupReport, fetchSchedulePdf, getEventOrdersByWeek } from "../../firebase.js";
import { useRole } from "../../hooks/useRole.js";
import { getNextSunday, addWeeks, formatWeekLabel } from "../WeekSelector.jsx";
import Widget from "../Widget.jsx";
import { COLORS, RADIUS } from "../../theme.js";
import { renderPdfToImages, trimImageBottom } from "../../utils/pdfRenderer.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ ok, loading, error }) {
  if (loading) return <span style={{ color: COLORS.TEXT_MUTED }}>...</span>;
  if (error)   return <span title={error}>&#9888;</span>;
  if (ok)      return <span style={{ color: COLORS.SUCCESS }}>&#10003;</span>;
  return <span style={{ color: COLORS.TEXT_DISABLED }}>&mdash;</span>;
}

function PreviewCard({ title, status, firstImage, pageCount }) {
  const cardStyle = {
    background: COLORS.BG_SURFACE_ALT,
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: RADIUS.MD,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    minHeight: 120,
  };
  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'Poppins',sans-serif",
    color: COLORS.TEXT_PRIMARY,
    textAlign: "center",
  };

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{title}</div>
      {status === "loading" && (
        <span style={{ fontSize: 11, color: COLORS.TEXT_MUTED }}>Rendering...</span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 11, color: COLORS.WARNING }}>Failed to load</span>
      )}
      {status === "ready" && firstImage && (
        <>
          <img
            src={firstImage}
            alt={`${title} preview`}
            style={{
              width: "100%",
              maxHeight: 140,
              objectFit: "contain",
              borderRadius: 4,
              border: `1px solid ${COLORS.BORDER}`,
            }}
          />
          <span style={{ fontSize: 10, color: COLORS.TEXT_MUTED }}>
            {pageCount} page{pageCount !== 1 ? "s" : ""}
          </span>
        </>
      )}
      {status === "idle" && (
        <span style={{ fontSize: 11, color: COLORS.TEXT_DISABLED }}>Not loaded</span>
      )}
    </div>
  );
}

// ── Print stylesheet (injected once) ─────────────────────────────────────────

const PRINT_STYLE_ID = "weekly-packet-print-style";

function ensurePrintStyle() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      /* Hide the React app — the portal container is a sibling of #root on document.body, so it is NOT affected by this rule */
      #root {
        display: none !important;
      }

      /* Show and reset the portal container for print layout */
      #weekly-packet-print-container {
        display: block !important;
        position: static !important;
        visibility: visible !important;
        left: auto !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
      }

      /* Base page class */
      .packet-page {
        display: block;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }

      /* Page breaks between pages — adjacent sibling selector avoids trailing blank page */
      .packet-page + .packet-page {
        page-break-before: always;
      }

      /* Portrait pages (schedule) */
      @page portrait-page {
        size: letter portrait;
        margin: 0;
      }
      .portrait-page {
        page: portrait-page;
        width: 8.5in;
        height: 11in;
      }
      .portrait-page img {
        display: block;
        width: 8.5in;
        height: 11in;
        object-fit: fill;
      }

      /* Landscape pages (event report, set up report) */
      @page landscape-page {
        size: letter landscape;
        margin: 0;
      }
      .landscape-page {
        page: landscape-page;
        width: 11in;
        height: 8.5in;
      }
      .landscape-page img {
        display: block;
        width: 11in;
        height: 8.5in;
        object-fit: contain;
        object-position: top left;
      }

      /* BEO pages — portrait, natural sizing */
      @page beo-page {
        size: letter portrait;
        margin: 0.5in;
      }
      .beo-page {
        page: beo-page;
      }
      .beo-page img {
        display: block;
        width: 100%;
        height: auto;
        max-height: 9in;
      }

      /* Setup report — all sheets stacked on one landscape page */
      @page setup-stack-page {
        size: letter landscape;
        margin: 0.25in;
      }
      .setup-stack-page {
        page: setup-stack-page;
        width: 10.5in;
        height: 8in;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 0;
      }
      .setup-stack-page img {
        display: block;
        width: 100%;
        height: auto;
      }

      /* Hide the preview grid when printing */
      .packet-preview-grid {
        display: none !important;
      }
    }
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

const INITIAL_SECTION = { status: "idle", images: [], error: null };

export default function WeeklyPacketReport() {
  const { isManager } = useRole();
  const [selectedWeek, setSelectedWeek] = useState(getNextSunday);

  const [schedule, setSchedule]       = useState(INITIAL_SECTION);
  const [eventReport, setEventReport] = useState(INITIAL_SECTION);
  const [setupReport, setSetupReport] = useState(INITIAL_SECTION);
  const [beos, setBeos]               = useState([]);
  const [beosLoading, setBeosLoading] = useState(false);

  // Labels from the API response (for display)
  const [scheduleLabel, setScheduleLabel] = useState(null);
  const [eventLabel, setEventLabel]       = useState(null);
  const [setupLabel, setSetupLabel]       = useState(null);

  const loadSection = useCallback(async (key, fetchFn, setSectionState, setLabel) => {
    setSectionState({ status: "loading", images: [], error: null });
    if (setLabel) setLabel(null);
    try {
      const result = await fetchFn();
      if (!result?.pdf && !result?._preRenderedImages) {
        setSectionState({ status: "error", images: [], error: "Not found" });
        return;
      }
      if (setLabel && result.weekLabel) setLabel(result.weekLabel);
      // Use pre-rendered images if available (e.g. trimmed setup report), otherwise render normally
      const images = result._preRenderedImages || await renderPdfToImages(result.pdf);
      setSectionState({ status: "ready", images, error: null });
    } catch (err) {
      setSectionState({ status: "error", images: [], error: err.message });
    }
  }, []);

  // Fetch all sections when week changes
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      // selectedWeek is a Sunday (UCAR weeks run Sun–Sat).
      // Schedule and Setup Report APIs expect a Monday, so shift +1 day.
      // Event Report API and BEO query use Sunday dates natively.
      const mondayDate = new Date(selectedWeek + "T12:00:00");
      mondayDate.setDate(mondayDate.getDate() + 1);
      const mondayIso = mondayDate.toISOString().slice(0, 10);

      // Load sections sequentially to avoid UI freeze from concurrent canvas rendering
      await loadSection("schedule", () => fetchSchedulePdf(mondayIso), (v) => !cancelled && setSchedule(v), (v) => !cancelled && setScheduleLabel(v));
      if (cancelled) return;
      await loadSection("eventReport", () => fetchEventReport(selectedWeek), (v) => !cancelled && setEventReport(v), (v) => !cancelled && setEventLabel(v));
      if (cancelled) return;
      // Load setup report and trim whitespace from images for stacking
      await loadSection("setupReport", async () => {
        const result = await fetchSetupReport(mondayIso);
        if (result?.pdf) {
          const images = await renderPdfToImages(result.pdf);
          const trimmedImages = await Promise.all(images.map(img => trimImageBottom(img)));
          return { ...result, _preRenderedImages: trimmedImages };
        }
        return result;
      }, (v) => !cancelled && setSetupReport(v), (v) => !cancelled && setSetupLabel(v));
      if (cancelled) return;

      // BEOs
      setBeosLoading(true);
      try {
        const docs = await getEventOrdersByWeek(selectedWeek);
        if (cancelled) return;
        if (!docs || docs.length === 0) {
          setBeos([]);
          setBeosLoading(false);
          return;
        }

        const rendered = [];
        for (const doc of docs) {
          if (cancelled) return;
          try {
            const res = await fetch(doc.downloadURL);
            const buffer = await res.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);
            const images = await renderPdfToImages(base64);
            rendered.push({ name: doc.fileName, status: "ready", images, error: null });
          } catch (err) {
            rendered.push({ name: doc.fileName, status: "error", images: [], error: err.message });
          }
        }
        if (!cancelled) setBeos(rendered);
      } catch {
        if (!cancelled) setBeos([]);
      }
      if (!cancelled) setBeosLoading(false);
    }

    // Reset all sections
    setSchedule(INITIAL_SECTION);
    setEventReport(INITIAL_SECTION);
    setSetupReport(INITIAL_SECTION);
    setBeos([]);
    setScheduleLabel(null);
    setEventLabel(null);
    setSetupLabel(null);

    fetchAll();
    return () => { cancelled = true; };
  }, [selectedWeek, loadSection]);

  // Print handler
  const handlePrint = () => {
    ensurePrintStyle();
    const container = document.getElementById("weekly-packet-print-container");
    if (!container) {
      console.error("[WeeklyPacket] Print container not found in DOM");
      return;
    }
    requestAnimationFrame(() => window.print());
  };

  const anyLoading = schedule.status === "loading" || eventReport.status === "loading" || setupReport.status === "loading" || beosLoading;
  const sectionsLoaded =
    [schedule, eventReport, setupReport].filter(s => s.status === "ready").length +
    (beos.filter(b => b.status === "ready").length > 0 ? 1 : 0);

  const beoReadyCount = beos.filter(b => b.status === "ready").length;
  const beoTotalPages = beos.reduce((sum, b) => sum + b.images.length, 0);

  return (
    <>
    <Widget
      title="Weekly Packet"
      subtitle={`Week of ${formatWeekLabel(selectedWeek)}`}
      icon="&#x1F4E6;"
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
              Loading &amp; rendering sections...
            </div>
          )}

          {[
            { label: "Staff Schedule", state: schedule, suffix: scheduleLabel },
            { label: "Event Report",   state: eventReport, suffix: eventLabel },
            { label: "Set Up Report",  state: setupReport, suffix: setupLabel },
            { label: `BEOs (${beos.length} file${beos.length !== 1 ? "s" : ""})`, state: { status: beosLoading ? "loading" : (beos.length > 0 ? "ready" : "idle"), error: null }, suffix: null },
          ].map(({ label, state, suffix }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 0",
              fontSize: 12,
              fontFamily: "'Poppins',sans-serif",
              color: state.error && state.status === "error" ? COLORS.WARNING : COLORS.TEXT_PRIMARY,
            }}>
              <StatusIcon
                ok={state.status === "ready"}
                loading={state.status === "loading"}
                error={state.error}
              />
              <span style={{ fontWeight: 600 }}>{label}</span>
              {suffix && (
                <span style={{ fontSize: 10, color: COLORS.TEXT_MUTED }}>
                  &mdash; {suffix}
                </span>
              )}
              {state.error && state.status === "error" && (
                <span style={{ fontSize: 10, color: COLORS.WARNING, marginLeft: "auto" }}>
                  {state.error}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Preview grid */}
        <div className="packet-preview-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}>
          <PreviewCard
            title="Staff Schedule"
            status={schedule.status}
            firstImage={schedule.images[0]}
            pageCount={schedule.images.length}
          />
          <PreviewCard
            title="Event Report"
            status={eventReport.status}
            firstImage={eventReport.images[0]}
            pageCount={eventReport.images.length}
          />
          <PreviewCard
            title="Set Up Report"
            status={setupReport.status}
            firstImage={setupReport.images[0]}
            pageCount={setupReport.images.length}
          />
          <PreviewCard
            title={`BEOs (${beoReadyCount} file${beoReadyCount !== 1 ? "s" : ""})`}
            status={beosLoading ? "loading" : (beoReadyCount > 0 ? "ready" : "idle")}
            firstImage={beos[0]?.images[0]}
            pageCount={beoTotalPages}
          />
        </div>

        {/* Print button — manager+ only */}
        {isManager && (
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
        )}

      </div>
    </Widget>

    {/* Print container — portaled to document.body, hidden on screen, shown by print CSS */}
    {createPortal(
      <div
        id="weekly-packet-print-container"
        style={{
          position: "absolute",
          left: "-9999px",
          visibility: "hidden",
        }}
      >
        {/* Staff Schedule — portrait, fill page */}
        {schedule.images.map((img, i) => (
          <div key={`sched-${i}`} className="packet-page portrait-page">
            <img src={img} alt={`Schedule page ${i + 1}`} />
          </div>
        ))}

        {/* Event Report — landscape */}
        {eventReport.images.map((img, i) => (
          <div key={`event-${i}`} className="packet-page landscape-page">
            <img src={img} alt={`Event Report page ${i + 1}`} />
          </div>
        ))}

        {/* Set Up Report — all sheets stacked on one portrait page */}
        {setupReport.images.length > 0 && (
          <div key="setup-stack" className="packet-page setup-stack-page">
            {setupReport.images.map((img, i) => (
              <img key={`setup-${i}`} src={img} alt={`Set Up Report page ${i + 1}`} />
            ))}
          </div>
        )}

        {/* BEOs — portrait, natural sizing */}
        {beos.flatMap((beo, beoIdx) =>
          beo.images.map((img, pageIdx) => (
            <div key={`beo-${beoIdx}-${pageIdx}`} className="packet-page beo-page">
              <img src={img} alt={`BEO ${beoIdx + 1} page ${pageIdx + 1}`} />
            </div>
          ))
        )}
      </div>,
      document.body
    )}
    </>
  );
}
