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

// "Monday, June 8" for single-day entries, "Monday, June 8 – Wednesday, June 10"
// for multi-day entries. Entries created before multi-day support have no endDate.
function formatEntryDateLabel(entry) {
  const fmt = { weekday: "long", month: "long", day: "numeric" };
  const start = entry.date?.toDate?.();
  if (!start) return "—";
  const startLabel = start.toLocaleDateString("en-US", fmt);
  const end = entry.endDate?.toDate?.();
  if (!end || end.toDateString() === start.toDateString()) return startLabel;
  return `${startLabel} – ${end.toLocaleDateString("en-US", fmt)}`;
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
          { label: "↻ Refresh", onClick: () => fetchEntriesFromFirestore(currentWeekSunday) },
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
            CAMPUS_ORDER.filter(c => groupedEntries[c]?.size).map(campusKey => (
              <div key={campusKey} style={{ marginBottom: 18 }}>
                {/* Campus section header */}
                <div style={{
                  fontSize: 12, fontWeight: 700, color: COLORS.AQUA_DARK,
                  fontFamily: "'Poppins',sans-serif",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  paddingBottom: 4, marginBottom: 8,
                  borderBottom: `2px solid ${COLORS.AQUA_BORDER}`,
                }}>
                  {CAMPUS_LABELS[campusKey]}
                </div>
                {[...groupedEntries[campusKey].entries()].map(([dateLabel, dayEntries]) => (
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
                              {entry.wasteNeeds ? ` · Waste: ${entry.wasteNeeds}` : ""}
                              {entry.security ? ` · Security: ${entry.security}` : ""}
                              {entry.securityPostHours ? ` (${entry.securityPostHours})` : ""}
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
            ))
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
                  CAMPUS_ORDER.filter(c => groupedEntries[c]?.size).map(campusKey => (
                    <div key={campusKey} style={{ marginBottom: 24 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: COLORS.AQUA_DARK,
                        letterSpacing: "0.04em", textTransform: "uppercase",
                        paddingBottom: 4, marginBottom: 8,
                        borderBottom: `2px solid ${COLORS.AQUA_BORDER}`,
                      }}>
                        {CAMPUS_LABELS[campusKey]}
                      </div>
                      <table style={{
                        width: "100%", borderCollapse: "collapse", fontSize: 11,
                      }}>
                        <thead>
                          <tr>
                            {["Date(s)", "Time", "Event", "Location", "Type", "# Att.", "Catering", "Details", "Contact"].map(h => (
                              <th key={h} style={{
                                border: `1px solid ${COLORS.BORDER}`,
                                background: COLORS.BG_SURFACE_ALT,
                                padding: "5px 8px", textAlign: "left",
                                fontWeight: 700, whiteSpace: "nowrap",
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...groupedEntries[campusKey].entries()].flatMap(([dateLabel, dayEntries]) =>
                            dayEntries.map(entry => (
                              <tr key={entry.id}>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px", whiteSpace: "nowrap" }}>
                                  {dateLabel}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px", whiteSpace: "nowrap" }}>
                                  {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px", fontWeight: 600 }}>
                                  {entry.eventName}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px" }}>
                                  {entry.location || "—"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px" }}>
                                  {entry.eventType || "—"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px", textAlign: "right" }}>
                                  {entry.attendeeCount ?? "—"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px" }}>
                                  {entry.catering ? "Yes" : "No"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px" }}>
                                  {[
                                    entry.wasteNeeds ? `Waste: ${entry.wasteNeeds}` : null,
                                    entry.security ? `Security: ${entry.security}` : null,
                                    entry.securityPostHours ? `Post hours: ${entry.securityPostHours}` : null,
                                    entry.notes || null,
                                  ].filter(Boolean).join(" · ") || "—"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.BORDER}`, padding: "5px 8px" }}>
                                  {[entry.contactName, entry.contactPhone].filter(Boolean).join(" · ") || "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))
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
