/**
 * EventReportWidget — Weekly Ops widget for the Event Report PDF.
 *
 * Shows a "View Event Report > Week of ..." link. Clicking opens a
 * full-screen modal with a landscape PDF preview, Print, and Open in Drive.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { useWidget } from "../hooks/useWidget.js";
import { fetchEventReport, db } from "../firebase.js";
import Widget from "./Widget.jsx";
import EventReportEntryModal from "./EventReportEntryModal.jsx";
import { useRole } from "../hooks/useRole.js";
import { roleAtLeast } from "../utils/permissions.js";
import { COLORS, RADIUS } from "../theme.js";
import { launchEmailComposer } from "../utils/emailLauncher.js";

// CUTOVER FLAG — set to true only when Jeff gives the go-ahead.
// false = display reads from Google Sheets (Drive PDF), exactly as before.
// true  = display reads from the event_report_entries Firestore collection.
const USE_FIRESTORE_EVENT_REPORT = false;

function base64ToBlobUrl(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

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

// "13:30" → "1:30 PM"
function formatTime12(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default function EventReportWidget({ weekOf = null, campus = "", weekLabel: parentWeekLabel = "", readOnly = false }) {
  const { data: report, loading, error, reload } = useWidget(
    () => fetchEventReport(weekOf), [weekOf]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const blobRef = useRef(null);

  // Native entry authoring (manager and above)
  const { role } = useRole();
  const canEdit = roleAtLeast(role, "manager");
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // null = create mode

  // ── Firestore data source (parallel run — active when cutover flag is true) ──
  const [currentWeekSunday, setCurrentWeekSunday] = useState(() => getWeekSunday(weekOf));
  const [firestoreEntries, setFirestoreEntries] = useState([]);
  const [firestoreLoading, setFirestoreLoading] = useState(false);
  const [firestoreError, setFirestoreError] = useState(null);

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
    if (!USE_FIRESTORE_EVENT_REPORT) return;
    fetchEntriesFromFirestore(currentWeekSunday);
  }, [currentWeekSunday, fetchEntriesFromFirestore]);

  const isViewingCurrentWeek =
    currentWeekSunday.getTime() === getWeekSunday(new Date()).getTime();

  useEffect(() => {
    if (report?.pdf) {
      const url = base64ToBlobUrl(report.pdf);
      blobRef.current = url;
      setBlobUrl(url);
    } else {
      setBlobUrl(null);
    }
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [report?.pdf]);

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e) => { if (e.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen]);

  const notFound = !loading && !error && !report;
  const label = report?.weekLabel ?? "Weekly event report";

  const firestoreWeekLabel = `Week of ${currentWeekSunday.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })}`;

  // Group Firestore entries by campus → date (entries arrive sorted by date, startTime)
  const groupedEntries = {};
  if (USE_FIRESTORE_EVENT_REPORT) {
    for (const entry of firestoreEntries) {
      const campus = entry.campus || "mesa";
      const dateKey = entry.date?.toDate
        ? entry.date.toDate().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "—";
      (groupedEntries[campus] ??= new Map());
      const byDate = groupedEntries[campus];
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(entry);
    }
  }

  const handlePrint = () => {
    const iframe = document.getElementById("event-report-preview");
    if (!iframe) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(blobUrl || report?.viewUrl, "_blank");
    }
  };

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
                  }}>{label}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={handlePrint}
                  disabled={!blobUrl}
                  style={{
                    background: blobUrl ? COLORS.AQUA : "transparent",
                    border: blobUrl ? "none" : `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "6px 16px",
                    color: blobUrl ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_DISABLED,
                    fontSize: 12, cursor: blobUrl ? "pointer" : "not-allowed",
                    fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  }}>Print</button>
                {report?.viewUrl && (
                  <a
                    href={report.viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "transparent",
                      border: `1px solid ${COLORS.BORDER}`,
                      borderRadius: 8, padding: "5px 12px",
                      color: COLORS.TEXT_MUTED, fontSize: 11,
                      fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                      textDecoration: "none",
                    }}>Open in Drive</a>
                )}
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "5px 14px",
                    color: COLORS.TEXT_MUTED, fontSize: 16,
                    cursor: "pointer", lineHeight: 1,
                  }}>&#10005;</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: 24 }}>
              {blobUrl ? (
                <iframe
                  id="event-report-preview"
                  src={blobUrl}
                  title="Event Report PDF"
                  style={{
                    width: "100%", height: "75vh",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: RADIUS.MD,
                    background: COLORS.BG_SURFACE_ALT,
                  }}
                />
              ) : (
                <div style={{
                  width: "100%", height: 200,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: COLORS.BG_SURFACE_ALT,
                  border: `1px solid ${COLORS.BORDER}`,
                  borderRadius: RADIUS.MD,
                  color: COLORS.TEXT_MUTED, fontSize: 13,
                  fontFamily: "'Poppins',sans-serif",
                }}>
                  PDF preview not available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Widget tile ── */}
      <Widget
        title="Event Report"
        subtitle={USE_FIRESTORE_EVENT_REPORT ? firestoreWeekLabel : label}
        icon="📋"
        accentColor={COLORS.AQUA}
        loading={USE_FIRESTORE_EVENT_REPORT ? false : loading}
        error={USE_FIRESTORE_EVENT_REPORT ? null : error}
        onRetry={reload}
        empty={USE_FIRESTORE_EVENT_REPORT ? false : notFound}
        emptyIcon="📋"
        emptyMessage="No event report found for this week."
        actions={[
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
              parentWeekLabel || label,
              report?.viewUrl || `${window.location.origin}?tab=weekly-ops&week=${encodeURIComponent(weekOf)}`
            ),
          }]),
          { label: "↻ Refresh", onClick: reload },
        ]}
      >
        {USE_FIRESTORE_EVENT_REPORT ? (
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
        ) : (
          report && (
            <div style={{ padding: "16px 4px" }}>
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
                View Event Report &rsaquo; {label}
              </button>
            </div>
          )
        )}
      </Widget>

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
