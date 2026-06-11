/**
 * EventReportWidget — Event Report widget (Weekly Ops + Dashboard).
 *
 * Renders event entries from the `event_report_entries` Firestore collection,
 * grouped by campus → day, with prev/next week navigation. Managers and above
 * can add, edit, and delete entries via EventReportEntryModal.
 */

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import Widget from "./Widget.jsx";
import EventReportEntryModal from "./EventReportEntryModal.jsx";
import { useRole } from "../hooks/useRole.js";
import { roleAtLeast } from "../utils/permissions.js";
import { COLORS, RADIUS } from "../theme.js";
import { launchEmailComposer } from "../utils/emailLauncher.js";

// Sunday 00:00:00 local of the week containing the given date / ISO string.
// UCAR weeks run Sunday–Saturday; weekOf arrives as the Monday ISO string.
function getWeekSunday(dateOrIso) {
  const d = dateOrIso instanceof Date
    ? new Date(dateOrIso)
    : dateOrIso ? new Date(dateOrIso + "T12:00:00") : new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

const CAMPUS_ORDER = ["mesa", "foothills", "center_green"];
const CAMPUS_LABELS = {
  mesa:         "Mesa Lab",
  foothills:    "Foothills Lab",
  center_green: "Center Green",
};
// Report accent colors per campus (Claude Design event-card layout)
const CAMPUS_ACCENTS = {
  mesa:         "#00A2B4",
  foothills:    "#0057C2",
  center_green: "#FAA119",
};

// Older entries stored access info as `securityPostHours`.
function entryAccess(entry) {
  return entry.access ?? entry.securityPostHours ?? null;
}

function isMultiDay(entry) {
  const start = entry.date?.toDate?.();
  const end = entry.endDate?.toDate?.();
  return !!(start && end && end.toDateString() !== start.toDateString());
}

// Pill colors for the event-type chip; eventType is free text.
function eventTypeChipColors(eventType) {
  const t = (eventType || "").toLowerCase();
  if (t.includes("meeting"))   return { background: "rgba(0,162,180,0.12)",  color: "#00818F" };
  if (t.includes("gathering")) return { background: "rgba(250,161,25,0.16)", color: "#B5710A" };
  return { background: "rgba(1,24,55,0.06)", color: "#4A5870" };
}

// ["Monday, June 8"] for single-day entries, ["Monday, June 8", "– Wednesday, June 10"]
// for multi-day entries. Entries created before multi-day support have no endDate.
function entryDateLines(entry) {
  const fmt = { weekday: "long", month: "long", day: "numeric" };
  const start = entry.date?.toDate?.();
  if (!start) return ["—"];
  const startLabel = start.toLocaleDateString("en-US", fmt);
  const end = entry.endDate?.toDate?.();
  if (!end || end.toDateString() === start.toDateString()) return [startLabel];
  return [startLabel, `– ${end.toLocaleDateString("en-US", fmt)}`];
}

// Single-line variant, e.g. "Monday, June 8 – Wednesday, June 10"
function formatEntryDateLabel(entry) {
  return entryDateLines(entry).join(" ");
}

// "13:30" → "1:30 PM"
function formatTime12(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default function EventReportWidget({ weekOf = null, campus = "", weekLabel: parentWeekLabel = "", readOnly = false }) {
  // Entry authoring (manager and above)
  const { role } = useRole();
  const canEdit = roleAtLeast(role, "manager");
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // null = create mode

  const [currentWeekSunday, setCurrentWeekSunday] = useState(() => getWeekSunday(weekOf));
  const [firestoreEntries, setFirestoreEntries] = useState([]);
  const [firestoreLoading, setFirestoreLoading] = useState(false);
  const [firestoreError, setFirestoreError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Campus sections collapsed in the widget list (keyed by campus, true = collapsed)
  const [collapsedCampuses, setCollapsedCampuses] = useState({});

  const toggleCampusCollapsed = (campusKey) =>
    setCollapsedCampuses((prev) => ({ ...prev, [campusKey]: !prev[campusKey] }));

  // Close preview on Escape
  useEffect(() => {
    if (!previewOpen) return;
    const handler = (e) => { if (e.key === "Escape") setPreviewOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewOpen]);

  // Follow the page-level week selector when it changes
  useEffect(() => {
    setCurrentWeekSunday(getWeekSunday(weekOf));
  }, [weekOf]);

  const fetchEntriesFromFirestore = useCallback(async (weekSunday) => {
    setFirestoreLoading(true);
    setFirestoreError(null);
    try {
      const weekTimestamp = Timestamp.fromDate(weekSunday);
      const q = query(
        collection(db, "event_report_entries"),
        where("weekOf", "==", weekTimestamp),
        orderBy("date"),
        orderBy("startTime")
      );
      const snapshot = await getDocs(q);
      setFirestoreEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching event report entries:", err);
      setFirestoreError(err.message);
    } finally {
      setFirestoreLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntriesFromFirestore(currentWeekSunday);
  }, [currentWeekSunday, fetchEntriesFromFirestore]);

  const isViewingCurrentWeek =
    currentWeekSunday.getTime() === getWeekSunday(new Date()).getTime();

  const firestoreWeekLabel = `Week of ${currentWeekSunday.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })}`;

  // Group entries by campus → date (entries arrive sorted by date, startTime)
  const groupedEntries = {};
  for (const entry of firestoreEntries) {
    const entryCampus = entry.campus || "mesa";
    const dateKey = formatEntryDateLabel(entry);
    (groupedEntries[entryCampus] ??= new Map());
    const byDate = groupedEntries[entryCampus];
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(entry);
  }

  const reportLink = weekOf
    ? `${window.location.origin}?tab=weekly-ops&week=${encodeURIComponent(weekOf)}`
    : `${window.location.origin}?tab=weekly-ops`;

  // Capture the preview content and save it as a letter-landscape PDF,
  // ready to attach to an email.
  const handleDownloadPdf = async () => {
    const el = document.getElementById("event-report-preview-content");
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

      pdf.save(`Event Report — ${firestoreWeekLabel}.pdf`);
    } catch (err) {
      console.error("Error generating event report PDF:", err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Print the preview content in a clean window (inline styles carry over)
  const handlePrint = () => {
    const el = document.getElementById("event-report-preview-content");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!doctype html><html><head><title>Event Report — ${firestoreWeekLabel}</title></head>` +
      `<body style="margin:24px">${el.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <>
      <Widget
        title="Event Report"
        icon="📋"
        accentColor={COLORS.AQUA}
        stackActions
        actions={[
          {
            icon: "👁",
            label: "Preview",
            onClick: () => setPreviewOpen(true),
          },
          ...(canEdit ? [{
            icon: "＋",
            label: "Add Event",
            onClick: () => {
              setEditingEntry(null);
              setEntryModalOpen(true);
            },
          }] : []),
          ...(readOnly ? [] : [{
            icon: "📧",
            label: "Email",
            onClick: () => launchEmailComposer(
              "Event Report",
              campus,
              parentWeekLabel || firestoreWeekLabel,
              reportLink
            ),
          }]),
        ]}
      >
        <div style={{ padding: "8px 0 4px" }}>
          {/* ── Week navigation ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            flexWrap: "wrap", marginBottom: 14,
          }}>
            <button
              onClick={() => {
                const prev = new Date(currentWeekSunday);
                prev.setDate(prev.getDate() - 7);
                setCurrentWeekSunday(prev);
              }}
              style={{
                background: "transparent", border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                color: COLORS.TEXT_MUTED, fontSize: 11, fontWeight: 600,
                fontFamily: "'Poppins',sans-serif",
              }}>← Prev Week</button>
            <span style={{
              fontSize: 11, fontWeight: 700, color: COLORS.TEXT_SECONDARY,
              fontFamily: "'Poppins',sans-serif", flex: 1, textAlign: "center",
              minWidth: 120,
            }}>
              {firestoreWeekLabel}
            </span>
            <button
              onClick={() => {
                const next = new Date(currentWeekSunday);
                next.setDate(next.getDate() + 7);
                setCurrentWeekSunday(next);
              }}
              style={{
                background: "transparent", border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                color: COLORS.TEXT_MUTED, fontSize: 11, fontWeight: 600,
                fontFamily: "'Poppins',sans-serif",
              }}>Next Week →</button>
            {!isViewingCurrentWeek && (
              <button
                onClick={() => setCurrentWeekSunday(getWeekSunday(new Date()))}
                style={{
                  background: "transparent", border: "none",
                  padding: "4px 6px", cursor: "pointer",
                  color: COLORS.AQUA, fontSize: 11, fontWeight: 600,
                  fontFamily: "'Poppins',sans-serif",
                  textDecoration: "underline", textUnderlineOffset: 2,
                }}>This Week</button>
            )}
          </div>

          {/* ── Loading / error / empty / rows ── */}
          {firestoreLoading ? (
            <div style={{ padding: "4px 0 8px" }}>
              {["72%", "90%", "55%"].map((w, i) => (
                <div key={i} style={{
                  width: w, height: 11, marginBottom: 9, borderRadius: 6,
                  background: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
                  backgroundSize: "200% 100%",
                  animation: "ucar-shimmer 1.6s ease-in-out infinite",
                }} />
              ))}
            </div>
          ) : firestoreError ? (
            <div style={{
              padding: "16px 0", textAlign: "center",
              fontSize: 12, color: COLORS.ERROR,
              fontFamily: "'Poppins',sans-serif",
            }}>
              Could not load events. Please refresh.
            </div>
          ) : firestoreEntries.length === 0 ? (
            <div style={{
              padding: "16px 0", textAlign: "center",
              fontSize: 12, color: COLORS.TEXT_MUTED,
              fontFamily: "'Poppins',sans-serif",
            }}>
              No events scheduled for this week.
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 6 }}>
            {CAMPUS_ORDER.filter(c => groupedEntries[c]?.size).map(campusKey => {
              const isCollapsed = !!collapsedCampuses[campusKey];
              const eventCount = [...groupedEntries[campusKey].values()]
                .reduce((sum, dayEntries) => sum + dayEntries.length, 0);
              return (
              <div key={campusKey} style={{ marginBottom: isCollapsed ? 10 : 18 }}>
                {/* Campus section header — click to expand / collapse */}
                <button
                  onClick={() => toggleCampusCollapsed(campusKey)}
                  aria-expanded={!isCollapsed}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    width: "100%", background: "transparent", border: "none",
                    padding: "0 0 4px", marginBottom: isCollapsed ? 0 : 8,
                    cursor: "pointer", textAlign: "left",
                    fontSize: 12, fontWeight: 700, color: COLORS.AQUA_DARK,
                    fontFamily: "'Poppins',sans-serif",
                    letterSpacing: "0.04em", textTransform: "uppercase",
                    borderBottom: `2px solid ${COLORS.AQUA_BORDER}`,
                  }}>
                  <span style={{ fontSize: 9 }}>{isCollapsed ? "▶" : "▼"}</span>
                  <span style={{ flex: 1 }}>{CAMPUS_LABELS[campusKey]}</span>
                  <span style={{
                    fontWeight: 600, color: COLORS.TEXT_MUTED,
                    textTransform: "none", letterSpacing: 0,
                  }}>
                    {eventCount} event{eventCount === 1 ? "" : "s"}
                  </span>
                </button>
                {!isCollapsed && [...groupedEntries[campusKey].entries()].map(([dateLabel, dayEntries]) => (
                  <div key={dateLabel} style={{ marginBottom: 10 }}>
                    {/* Day sub-header */}
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: COLORS.TEXT_SECONDARY,
                      fontFamily: "'Poppins',sans-serif", marginBottom: 6,
                    }}>
                      {dateLabel}
                    </div>
                    {dayEntries.map(entry => (
                      <div key={entry.id} style={{
                        padding: "8px 12px", marginBottom: 6,
                        background: COLORS.BG_SURFACE_ALT,
                        border: `1px solid ${COLORS.BORDER}`,
                        borderRadius: RADIUS.MD,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                              fontFamily: "'Poppins',sans-serif",
                            }}>
                              {entry.eventName}
                            </div>
                            <div style={{
                              fontSize: 11, color: COLORS.TEXT_MUTED,
                              fontFamily: "'Poppins',sans-serif", marginTop: 2,
                            }}>
                              {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
                              {" · "}{entry.location || "—"}
                              {" · "}{entry.eventType || "—"}
                            </div>
                            <div style={{
                              fontSize: 10.5, color: COLORS.TEXT_MUTED,
                              fontFamily: "'Poppins',sans-serif", marginTop: 2,
                            }}>
                              Attendees: {entry.attendeeCount ?? "—"}
                              {" · "}Catering: {entry.catering ? "Yes" : "No"}
                              {entry.security ? ` · Security: ${entry.security}` : ""}
                              {entry.wasteNeeds ? ` · Waste: ${entry.wasteNeeds}` : ""}
                              {entryAccess(entry) ? ` · Access: ${entryAccess(entry)}` : ""}
                            </div>
                            {(entry.notes || entry.contactName || entry.contactPhone) && (
                              <div style={{
                                fontSize: 10.5, color: COLORS.TEXT_MUTED,
                                fontFamily: "'Poppins',sans-serif", marginTop: 2,
                                fontStyle: "italic",
                              }}>
                                {entry.notes || ""}
                                {entry.notes && (entry.contactName || entry.contactPhone) ? " · " : ""}
                                {[entry.contactName, entry.contactPhone].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingEntry(entry);
                                setEntryModalOpen(true);
                              }}
                              title="Edit event"
                              style={{
                                background: "transparent",
                                border: `1px solid ${COLORS.BORDER}`,
                                borderRadius: 6, padding: "3px 7px",
                                cursor: "pointer", fontSize: 11,
                                color: COLORS.TEXT_MUTED, flexShrink: 0,
                                lineHeight: 1.4,
                              }}>✏️</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              );
            })}
            </div>
          )}
        </div>
      </Widget>

      {/* ── Preview modal (full-screen report view) ── */}
      {previewOpen && (
        <div
          onClick={() => setPreviewOpen(false)}
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
                    color: COLORS.TEXT_PRIMARY,
                    fontFamily: "'Poppins',sans-serif",
                  }}>Event Report</div>
                  <div style={{
                    fontSize: 11, color: COLORS.TEXT_MUTED,
                    fontFamily: "'Poppins',sans-serif",
                  }}>{firestoreWeekLabel}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={handleDownloadPdf}
                  disabled={firestoreEntries.length === 0 || downloadingPdf}
                  style={{
                    background: "transparent",
                    border: `1px solid ${firestoreEntries.length ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
                    borderRadius: 8, padding: "6px 16px",
                    color: firestoreEntries.length ? COLORS.AQUA_DARK : COLORS.TEXT_DISABLED,
                    fontSize: 12,
                    cursor: firestoreEntries.length && !downloadingPdf ? "pointer" : "not-allowed",
                    fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                    opacity: downloadingPdf ? 0.6 : 1,
                  }}>{downloadingPdf ? "Generating…" : "Download PDF"}</button>
                <button
                  onClick={handlePrint}
                  disabled={firestoreEntries.length === 0}
                  style={{
                    background: firestoreEntries.length ? COLORS.AQUA : "transparent",
                    border: firestoreEntries.length ? "none" : `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "6px 16px",
                    color: firestoreEntries.length ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_DISABLED,
                    fontSize: 12, cursor: firestoreEntries.length ? "pointer" : "not-allowed",
                    fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  }}>Print</button>
                <button
                  onClick={() => setPreviewOpen(false)}
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
              <div id="event-report-preview-content" style={{
                fontFamily: "'Poppins',Helvetica,sans-serif",
                color: COLORS.TEXT_PRIMARY,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>
                  Event Report
                </div>
                <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 18 }}>
                  {firestoreWeekLabel}
                </div>

                {firestoreEntries.length === 0 ? (
                  <div style={{
                    padding: "32px 0", textAlign: "center",
                    fontSize: 13, color: COLORS.TEXT_MUTED,
                  }}>
                    No events scheduled for this week.
                  </div>
                ) : (
                  CAMPUS_ORDER.filter(c => groupedEntries[c]?.size).map(campusKey => {
                    const accent = CAMPUS_ACCENTS[campusKey];
                    const cardLabelStyle = {
                      fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "#8693A8", fontWeight: 700, marginBottom: 5,
                    };
                    const chipStyle = {
                      display: "inline-block", padding: "4px 11px", borderRadius: 999,
                      fontSize: 11.5, fontWeight: 600,
                    };
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
                        {[...groupedEntries[campusKey].values()].flat().map(entry => (
                          <div key={entry.id} style={{
                            border: "1px solid rgba(1,24,55,0.10)",
                            borderLeft: `5px solid ${accent}`,
                            borderRadius: 14, padding: "20px 24px",
                            background: "#FFFFFF",
                          }}>
                            {/* Card header: name + location, type chips on the right */}
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              alignItems: "flex-start", gap: 16,
                            }}>
                              <div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.TEXT_PRIMARY }}>
                                  {entry.eventName}
                                </div>
                                <div style={{ fontSize: 13, color: "#4A5870", marginTop: 4 }}>
                                  {entry.location || "—"}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                {isMultiDay(entry) && (
                                  <span style={{
                                    ...chipStyle,
                                    background: "rgba(1,24,55,0.06)", color: "#4A5870",
                                  }}>Multi-day</span>
                                )}
                                {entry.eventType && (
                                  <span style={{ ...chipStyle, ...eventTypeChipColors(entry.eventType) }}>
                                    {entry.eventType}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Key facts grid */}
                            <div style={{
                              marginTop: 18, display: "grid",
                              gridTemplateColumns: "1.6fr 1fr 1fr 1.4fr", gap: 18,
                            }}>
                              <div>
                                <div style={cardLabelStyle}>When</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                  {formatEntryDateLabel(entry)}
                                </div>
                                <div style={{ fontSize: 13, color: "#4A5870", marginTop: 2 }}>
                                  {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
                                </div>
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Attendance</div>
                                {entry.attendeeCount != null ? (
                                  <>
                                    <div style={{
                                      fontSize: 20, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                                      fontVariantNumeric: "tabular-nums", lineHeight: 1,
                                    }}>{entry.attendeeCount}</div>
                                    <div style={{ fontSize: 12, color: "#8693A8", marginTop: 3 }}>expected</div>
                                  </>
                                ) : (
                                  <div style={{ fontSize: 14, color: "#B3BCC9" }}>—</div>
                                )}
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Catering</div>
                                {entry.catering ? (
                                  <div style={{
                                    display: "inline-flex", alignItems: "center", gap: 7,
                                    fontSize: 14, fontWeight: 600, color: "#00818F",
                                  }}>
                                    <span style={{
                                      width: 9, height: 9, borderRadius: 999, background: "#00A2B4",
                                    }} />
                                    Yes
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 14, color: "#B3BCC9" }}>—</div>
                                )}
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Contact</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.TEXT_PRIMARY }}>
                                  {entry.contactName || "—"}
                                </div>
                                {entry.contactPhone && (
                                  <div style={{
                                    fontSize: 13, color: "#4A5870", marginTop: 2,
                                    fontVariantNumeric: "tabular-nums",
                                  }}>{entry.contactPhone}</div>
                                )}
                              </div>
                            </div>

                            {/* Logistics row: Security / Waste / Access */}
                            <div style={{
                              marginTop: 18, paddingTop: 16,
                              borderTop: "1px solid rgba(1,24,55,0.08)",
                              display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18,
                            }}>
                              <div>
                                <div style={cardLabelStyle}>Security</div>
                                <div style={{ fontSize: 14, color: COLORS.TEXT_PRIMARY, fontWeight: 500, lineHeight: 1.45 }}>
                                  {entry.security || "—"}
                                </div>
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Waste</div>
                                <div style={{ fontSize: 14, color: COLORS.TEXT_PRIMARY, fontWeight: 500, lineHeight: 1.45 }}>
                                  {entry.wasteNeeds || "—"}
                                </div>
                              </div>
                              <div>
                                <div style={cardLabelStyle}>Access</div>
                                <div style={{ fontSize: 14, color: COLORS.TEXT_PRIMARY, fontWeight: 500, lineHeight: 1.45 }}>
                                  {entryAccess(entry) || "—"}
                                </div>
                              </div>
                            </div>

                            {/* Additional Details */}
                            <div style={{
                              marginTop: 16, paddingTop: 16,
                              borderTop: "1px solid rgba(1,24,55,0.08)",
                            }}>
                              <div style={cardLabelStyle}>Additional Details</div>
                              <div style={{ fontSize: 14, color: "#4A5870", lineHeight: 1.55 }}>
                                {entry.notes || "—"}
                              </div>
                            </div>
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
      )}

      {/* ── Entry modal (create / edit) ── */}
      {entryModalOpen && (
        <EventReportEntryModal
          isOpen={entryModalOpen}
          onClose={() => setEntryModalOpen(false)}
          weekOf={currentWeekSunday}
          existingEntry={editingEntry}
          onSaved={() => {
            setEntryModalOpen(false);
            fetchEntriesFromFirestore(currentWeekSunday); // refresh
          }}
          onDeleted={() => {
            setEntryModalOpen(false);
            fetchEntriesFromFirestore(currentWeekSunday); // refresh
          }}
        />
      )}
    </>
  );
}
