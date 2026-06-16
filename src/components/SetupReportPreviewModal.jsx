/**
 * SetupReportPreviewModal — full-screen printable view of the Set Up Report.
 *
 * Mirrors the Event Report preview (EventReportWidget): a campus-grouped card
 * layout with Download PDF (letter-landscape) and Print actions. Shared by both
 * Set Up Report widgets (Weekly Ops + Dashboard); the parent owns fetching and
 * passes the already-loaded entries + week label.
 */

import { useEffect, useState } from "react";
import { COLORS } from "../theme.js";

const FONT_FAMILY = "'Poppins',sans-serif";

const CAMPUS_ORDER = ["mesa", "foothills", "center_green"];
const CAMPUS_LABELS = {
  mesa:         "Mesa Lab",
  foothills:    "Foothills Lab",
  center_green: "Center Green",
};
// Report accent colors per campus (matches the Event Report preview)
const CAMPUS_ACCENTS = {
  mesa:         "#00A2B4",
  foothills:    "#0057C2",
  center_green: "#FAA119",
};
const ACTION_LABELS = {
  setup: "Setup",
  reset: "Reset",
  both:  "Setup + Reset",
};

// "18:00" → "6:00 PM"
function formatTime12(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Firestore Timestamp → "Mon, Jun 8, 2:30 PM"
function formatDateTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Firestore Timestamp → "Monday, June 8"
function formatDateLong(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function locationLine(entry) {
  const parts = [];
  if (entry.action === "setup" || entry.action === "both") {
    parts.push(`Setup: ${entry.setupLocation || "—"}`);
  }
  if (entry.action === "reset" || entry.action === "both") {
    parts.push(`Reset: ${entry.resetLocation || "—"}`);
  }
  return parts.join("  ·  ");
}

function hasEventDetails(entry) {
  return !!(entry.eventName || entry.attendeeCount != null ||
            entry.eventDate || entry.eventStartTime);
}

export default function SetupReportPreviewModal({ isOpen, onClose, entries = [], weekLabel = "" }) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group entries by campus (entries arrive ordered by date)
  const grouped = {};
  for (const entry of entries) {
    const campusKey = entry.campus || "mesa";
    (grouped[campusKey] ??= []).push(entry);
  }

  // Capture the preview content and save it as a letter-landscape PDF,
  // ready to attach to an email.
  const handleDownloadPdf = async () => {
    const el = document.getElementById("setup-report-preview-content");
    if (!el || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      // Loaded on demand so the PDF libraries stay out of the initial bundle
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#FFFFFF" });
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const margin = 36;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      let heightLeft = imgH;
      let position = margin;
      pdf.addImage(imgData, "PNG", margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgH - heightLeft);
        pdf.addImage(imgData, "PNG", margin, position, imgW, imgH);
        heightLeft -= pageH - margin * 2;
      }

      pdf.save(`Set Up Report — ${weekLabel}.pdf`);
    } catch (err) {
      console.error("Error generating setup report PDF:", err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Print the preview content in a clean window (inline styles carry over)
  const handlePrint = () => {
    const el = document.getElementById("setup-report-preview-content");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!doctype html><html><head><title>Set Up Report — ${weekLabel}</title></head>` +
      `<body style="margin:24px">${el.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  };

  const hasEntries = entries.length > 0;

  const cardLabelStyle = {
    fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "#8693A8", fontWeight: 700, marginBottom: 5,
  };
  const chipStyle = {
    display: "inline-block", padding: "4px 11px", borderRadius: 999,
    fontSize: 11.5, fontWeight: 600,
  };

  return (
    <div
      onClick={onClose}
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
            <span style={{ fontSize: 18 }}>📋</span>
            <div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: COLORS.TEXT_PRIMARY, fontFamily: FONT_FAMILY,
              }}>Set Up Report</div>
              <div style={{
                fontSize: 11, color: COLORS.TEXT_MUTED, fontFamily: FONT_FAMILY,
              }}>{weekLabel}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={handleDownloadPdf}
              disabled={!hasEntries || downloadingPdf}
              style={{
                background: "transparent",
                border: `1px solid ${hasEntries ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
                borderRadius: 8, padding: "6px 16px",
                color: hasEntries ? COLORS.AQUA_DARK : COLORS.TEXT_DISABLED,
                fontSize: 12,
                cursor: hasEntries && !downloadingPdf ? "pointer" : "not-allowed",
                fontFamily: FONT_FAMILY, fontWeight: 700,
                opacity: downloadingPdf ? 0.6 : 1,
              }}>{downloadingPdf ? "Generating…" : "Download PDF"}</button>
            <button
              onClick={handlePrint}
              disabled={!hasEntries}
              style={{
                background: hasEntries ? COLORS.AQUA : "transparent",
                border: hasEntries ? "none" : `1px solid ${COLORS.BORDER}`,
                borderRadius: 8, padding: "6px 16px",
                color: hasEntries ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_DISABLED,
                fontSize: 12, cursor: hasEntries ? "pointer" : "not-allowed",
                fontFamily: FONT_FAMILY, fontWeight: 700,
              }}>Print</button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 8, padding: "5px 14px",
                color: COLORS.TEXT_MUTED, fontSize: 16,
                cursor: "pointer", lineHeight: 1,
              }}>&#10005;</button>
          </div>
        </div>

        {/* Modal body — printable report */}
        <div style={{ padding: 24, overflowY: "auto" }}>
          <div id="setup-report-preview-content" style={{
            fontFamily: "'Poppins',Helvetica,sans-serif",
            color: COLORS.TEXT_PRIMARY,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>
              Set Up Report
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 18 }}>
              {weekLabel}
            </div>

            {!hasEntries ? (
              <div style={{
                padding: "32px 0", textAlign: "center",
                fontSize: 13, color: COLORS.TEXT_MUTED,
              }}>
                No setup tasks for this week.
              </div>
            ) : (
              CAMPUS_ORDER.filter((c) => grouped[c]?.length).map((campusKey) => {
                const accent = CAMPUS_ACCENTS[campusKey];
                return (
                  <div key={campusKey} style={{ marginBottom: 30 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
                    }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: 4,
                        background: accent, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                        letterSpacing: "0.16em", textTransform: "uppercase",
                      }}>
                        {CAMPUS_LABELS[campusKey]}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {grouped[campusKey].map((entry) => (
                        <div key={entry.id} style={{
                          border: "1px solid rgba(1,24,55,0.10)",
                          borderLeft: `5px solid ${accent}`,
                          borderRadius: 14, padding: "20px 24px",
                          background: "#FFFFFF",
                        }}>
                          {/* Card header: description + locations, chips on the right */}
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "flex-start", gap: 16,
                          }}>
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT_PRIMARY }}>
                                {entry.description || "—"}
                              </div>
                              <div style={{ fontSize: 13, color: "#4A5870", marginTop: 4 }}>
                                {locationLine(entry) || "—"}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                              {entry.diagram && (
                                <span style={{
                                  ...chipStyle,
                                  background: "rgba(1,24,55,0.06)", color: "#4A5870",
                                }}>Diagram</span>
                              )}
                              <span style={{
                                ...chipStyle,
                                background: "rgba(0,162,180,0.12)", color: "#00818F",
                              }}>
                                {ACTION_LABELS[entry.action] || entry.action || "—"}
                              </span>
                            </div>
                          </div>

                          {/* Key facts grid */}
                          <div style={{
                            marginTop: 18, display: "grid",
                            gridTemplateColumns: "1.4fr 1.3fr 1.3fr 0.8fr", gap: 18,
                          }}>
                            <div>
                              <div style={cardLabelStyle}>When</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                {formatDateLong(entry.date)}
                              </div>
                            </div>
                            <div>
                              <div style={cardLabelStyle}>Available</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                {formatDateTime(entry.availableAt)}
                              </div>
                            </div>
                            <div>
                              <div style={cardLabelStyle}>Deadline</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                {formatDateTime(entry.deadlineAt)}
                              </div>
                            </div>
                            <div>
                              <div style={cardLabelStyle}>Diagram</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                {entry.diagram ? "Yes" : "No"}
                              </div>
                            </div>
                          </div>

                          {/* Event details (only when present) */}
                          {hasEventDetails(entry) && (
                            <div style={{
                              marginTop: 18, paddingTop: 16,
                              borderTop: "1px solid rgba(1,24,55,0.08)",
                              display: "grid", gridTemplateColumns: "1.6fr 1fr 1.4fr", gap: 18,
                            }}>
                              <div>
                                <div style={cardLabelStyle}>Event</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                  {entry.eventName || "—"}
                                </div>
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Attendees</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                  {entry.attendeeCount ?? "—"}
                                </div>
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Event Start</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                  {entry.eventDate || entry.eventStartTime
                                    ? `${entry.eventDate ? formatDateLong(entry.eventDate) : "—"}${
                                        entry.eventStartTime ? ` · ${formatTime12(entry.eventStartTime)}` : ""
                                      }`
                                    : "—"}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
