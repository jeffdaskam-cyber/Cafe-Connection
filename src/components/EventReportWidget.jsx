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
    const dateKey = entry.date?.toDate
      ? entry.date.toDate().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : "—";
    (groupedEntries[entryCampus] ??= new Map());
    const byDate = groupedEntries[entryCampus];
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(entry);
  }

  const reportLink = weekOf
    ? `${window.location.origin}?tab=weekly-ops&week=${encodeURIComponent(weekOf)}`
    : `${window.location.origin}?tab=weekly-ops`;

  return (
    <>
      <Widget
        title="Event Report"
        subtitle={firestoreWeekLabel}
        icon="📋"
        accentColor={COLORS.AQUA}
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
