import { useEffect, useState } from "react";
import { COLORS } from "../theme.js";

const FONT_FAMILY = "'Poppins',sans-serif";

const CAMPUS_ORDER = ["mesa", "foothills", "center_green"];
const CAMPUS_LABELS = {
  mesa:         "Mesa Lab",
  foothills:    "Foothills Lab",
  center_green: "Center Green",
};
const CAMPUS_ACCENTS = {
  mesa:         "#00A2B4",
  foothills:    "#0057C2",
  center_green: "#FAA119",
};

function formatTime12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function formatDateTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDateLong(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function buildEventStart(entry) {
  if (!entry.eventDate && !entry.eventStartTime) return "—";
  const datePart = entry.eventDate ? formatDateLong(entry.eventDate) : "";
  const timePart = entry.eventStartTime ? formatTime12(entry.eventStartTime) : "";
  if (datePart && timePart) return `${datePart} · ${timePart}`;
  return datePart || timePart;
}

function setupLocationLabel(entry) {
  const parts = [];
  if (entry.action === "setup" || entry.action === "both") {
    parts.push(entry.setupLocation || "—");
  }
  if (entry.action === "reset" || entry.action === "both") {
    const prefix = parts.length ? "Reset: " : "";
    parts.push(`${prefix}${entry.resetLocation || "—"}`);
  }
  return parts.join(" · ") || "—";
}

function descriptionLines(entry) {
  const text = entry.description || "";
  return text.split(/\n/).map(l => l.trim()).filter(Boolean);
}

const FIELD_LABEL = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
  textTransform: "uppercase", color: "#8693a8", marginBottom: 4,
};

const PRINT_STYLES = `
@page { size: portrait; margin: 0.4in; }
@media print {
  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .setup-report-modal-backdrop { position: static !important; background: none !important; padding: 0 !important; overflow: visible !important; }
  .setup-report-modal-chrome { box-shadow: none !important; border: none !important; max-width: none !important; }
  .setup-report-toolbar { display: none !important; }
  .setup-report-body { padding: 0 !important; overflow: visible !important; }
  .setup-report-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
  .setup-report-card { box-shadow: none !important; border-color: #d4d2cc !important; overflow: visible !important; break-inside: avoid !important; }
  .campus-section { break-inside: avoid-page !important; }
}
`;

export default function SetupReportPreviewModal({ isOpen, onClose, entries = [], weekLabel = "" }) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const grouped = {};
  for (const entry of entries) {
    const campusKey = entry.campus || "mesa";
    (grouped[campusKey] ??= []).push(entry);
  }

  const totalSetups = entries.length;

  const handleDownloadPdf = async () => {
    const el = document.getElementById("setup-report-preview-content");
    if (!el || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#FFFFFF" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
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

  const handlePrint = () => {
    window.print();
  };

  const hasEntries = entries.length > 0;

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div
        className="setup-report-modal-backdrop"
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
          className="setup-report-modal-chrome"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: COLORS.BG_SURFACE,
            borderRadius: 16,
            border: `1px solid ${COLORS.BORDER}`,
            width: "100%", maxWidth: 960,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Toolbar */}
          <div className="setup-report-toolbar" style={{
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

          {/* Report body */}
          <div className="setup-report-body" style={{ padding: 24, overflowY: "auto" }}>
            <div
              id="setup-report-preview-content"
              className="setup-report-page"
              style={{
                maxWidth: 840, margin: "0 auto",
                fontFamily: FONT_FAMILY, color: "#011837",
                background: "#fff", borderRadius: 6,
                boxShadow: "0 2px 16px rgba(1,24,55,0.10)",
                padding: "56px 60px 64px",
              }}
            >
              {/* Report Header */}
              <header style={{
                display: "flex", alignItems: "flex-end",
                justifyContent: "space-between", gap: 24,
                paddingBottom: 10,
                borderBottom: "2px solid #011837",
              }}>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: "#00818F", marginBottom: 5,
                  }}>Cafe Connection &middot; Events Setup</div>
                  <h1 style={{
                    margin: 0, fontSize: 26, fontWeight: 800,
                    letterSpacing: "-0.01em", lineHeight: 1,
                  }}>Set Up Report</h1>
                  <div style={{
                    marginTop: 4, fontSize: 14, fontWeight: 500, color: "#4a5870",
                  }}>{weekLabel}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{
                    fontSize: 32, fontWeight: 800, lineHeight: 1, color: "#011837",
                  }}>{totalSetups}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "#8693a8", marginTop: 3,
                  }}>Setups</div>
                </div>
              </header>

              {/* Legend */}
              <div style={{
                display: "flex", gap: 16, flexWrap: "wrap",
                marginTop: 6, marginBottom: 0,
                fontSize: 11, color: "#4a5870",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 14, height: 14, border: "2px solid rgba(1,24,55,0.18)",
                    borderRadius: 3, display: "inline-block", flexShrink: 0,
                  }} />
                  Check off each line as you complete it
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 14, height: 14, borderRadius: 3,
                    background: "#FAA119", color: "#fff",
                    fontSize: 10, fontWeight: 800, flexShrink: 0,
                  }}>!</span>
                  Diagram attached — collect before setup
                </div>
              </div>

              {!hasEntries ? (
                <div style={{
                  padding: "32px 0", textAlign: "center",
                  fontSize: 13, color: "#8693a8",
                }}>
                  No setup tasks for this week.
                </div>
              ) : (
                CAMPUS_ORDER.filter((c) => grouped[c]?.length).map((campusKey) => {
                  const accent = CAMPUS_ACCENTS[campusKey];
                  const campusEntries = grouped[campusKey];
                  const countLabel = campusEntries.length + (campusEntries.length === 1 ? " setup" : " setups");
                  return (
                    <section key={campusKey} className="campus-section" style={{ marginTop: 14 }}>
                      {/* Campus header */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        marginBottom: 8,
                      }}>
                        <span style={{
                          width: 13, height: 13, borderRadius: 3,
                          flexShrink: 0, background: accent,
                        }} />
                        <h2 style={{
                          margin: 0, fontSize: 13, fontWeight: 800,
                          letterSpacing: "0.16em", textTransform: "uppercase",
                          color: "#011837",
                        }}>{CAMPUS_LABELS[campusKey]}</h2>
                        <span style={{ flex: 1, height: 1, background: "rgba(1,24,55,0.10)" }} />
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: "#8693a8",
                          letterSpacing: "0.04em", whiteSpace: "nowrap",
                        }}>{countLabel}</span>
                      </div>

                      {/* Event cards */}
                      {campusEntries.map((entry) => {
                        const lines = descriptionLines(entry);
                        const hasDiagram = !!entry.diagram;
                        const diagramLabel = hasDiagram ? "Attached" : "None";
                        const diagramBg = hasDiagram ? "rgba(250,161,25,0.16)" : "#F1F0EE";
                        const diagramFg = hasDiagram ? "#A35E00" : "#8693a8";

                        return (
                          <article
                            key={entry.id}
                            className="setup-report-card"
                            style={{
                              marginBottom: 8,
                              background: "#fff",
                              border: "1px solid rgba(1,24,55,0.10)",
                              borderRadius: 10,
                              boxShadow: "0 1px 2px rgba(1,24,55,0.06), 0 1px 0 rgba(1,24,55,0.03)",
                              overflow: "hidden",
                            }}
                          >
                            {/* Setup Location — Hero */}
                            <div style={{
                              padding: "10px 20px 8px",
                              borderBottom: "1px solid rgba(1,24,55,0.10)",
                            }}>
                              <div style={{ ...FIELD_LABEL, marginBottom: 3 }}>Setup Location</div>
                              <div style={{
                                fontSize: 20, fontWeight: 800, lineHeight: 1.15,
                                color: "#0057C2",
                              }}>{setupLocationLabel(entry)}</div>
                            </div>

                            {/* Event / Attendance / Event Start */}
                            <div style={{
                              display: "grid",
                              gridTemplateColumns: "1.7fr 0.8fr 1.3fr",
                              gap: 16, padding: "8px 20px 8px",
                              borderBottom: "1px solid rgba(1,24,55,0.10)",
                            }}>
                              <div>
                                <div style={{ ...FIELD_LABEL }}>Event</div>
                                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.15 }}>
                                  {entry.eventName || "—"}
                                </div>
                              </div>
                              <div>
                                <div style={{ ...FIELD_LABEL }}>Attendance</div>
                                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.15 }}>
                                  {entry.attendeeCount ?? "—"}
                                </div>
                              </div>
                              <div>
                                <div style={{ ...FIELD_LABEL }}>Event Start</div>
                                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
                                  {buildEventStart(entry)}
                                </div>
                              </div>
                            </div>

                            {/* Setup Notes (checklist) */}
                            <div style={{ padding: "8px 20px 10px" }}>
                              <div style={{ ...FIELD_LABEL }}>Setup Notes</div>
                              <div style={{ marginBottom: 8 }}>
                                {lines.length > 0 ? lines.map((line, i) => (
                                  <div key={i} style={{
                                    display: "flex", alignItems: "flex-start", gap: 8,
                                    padding: "3px 0",
                                    borderBottom: "1px solid rgba(1,24,55,0.10)",
                                  }}>
                                    <span style={{
                                      width: 18, height: 18, flexShrink: 0,
                                      border: "2px solid rgba(1,24,55,0.18)",
                                      borderRadius: 4,
                                      display: "flex", alignItems: "center",
                                      justifyContent: "center", marginTop: 1,
                                    }} />
                                    <span style={{
                                      fontSize: 14, fontWeight: 500, lineHeight: 1.35,
                                    }}>{line}</span>
                                  </div>
                                )) : (
                                  <div style={{
                                    fontSize: 13, color: "#8693a8", padding: "3px 0",
                                  }}>No notes</div>
                                )}
                              </div>

                              {/* Available / Deadline / Diagram */}
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr auto",
                                gap: 12, alignItems: "end",
                              }}>
                                <div>
                                  <div style={{ ...FIELD_LABEL }}>Available</div>
                                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
                                    {formatDateTime(entry.availableAt)}
                                  </div>
                                </div>
                                <div style={{
                                  borderLeft: "3px solid #FAA119",
                                  paddingLeft: 10,
                                }}>
                                  <div style={{
                                    ...FIELD_LABEL, color: "#FAA119",
                                  }}>Deadline</div>
                                  <div style={{
                                    fontSize: 14, fontWeight: 800, lineHeight: 1.2,
                                  }}>{formatDateTime(entry.deadlineAt)}</div>
                                </div>
                                <div>
                                  <div style={{ ...FIELD_LABEL }}>Diagram</div>
                                  <span style={{
                                    display: "inline-flex", alignItems: "center",
                                    padding: "3px 10px", borderRadius: 999,
                                    fontSize: 12, fontWeight: 700,
                                    background: diagramBg, color: diagramFg,
                                  }}>{diagramLabel}</span>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  );
                })
              )}

              {/* Footer */}
              <footer style={{
                marginTop: 10, paddingTop: 8,
                borderTop: "1px solid rgba(1,24,55,0.10)",
                display: "flex", justifyContent: "space-between",
                fontSize: 10.5, color: "#8693a8",
              }}>
                <span>Cafe Connection &mdash; Events Setup Crew</span>
                <span>Questions on a setup? Contact the events desk before the deadline.</span>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
