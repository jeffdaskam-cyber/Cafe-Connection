/**
 * SetUpReportDrive — Weekly Ops widget for the Set Up Report PDF.
 *
 * Shows a "View Set Up Report > Week of ..." link. Clicking opens a
 * full-screen modal with a landscape PDF preview, Print, and Open in Drive.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { useWidget } from "../hooks/useWidget.js";
import { fetchSetupReport } from "../firebase.js";
import { db } from "../firebase.js";
import Widget from "./Widget.jsx";
import SetupReportEntryModal from "./SetupReportEntryModal.jsx";
import SetupReportEntriesList from "./SetupReportEntriesList.jsx";
import { useRole } from "../hooks/useRole.js";
import { roleAtLeast } from "../utils/permissions.js";
import { COLORS, RADIUS } from "../theme.js";
import { launchEmailComposer } from "../utils/emailLauncher.js";

// CUTOVER FLAG — set to true only when Jeff gives the go-ahead.
// false  → display reads the Google Sheets PDF (unchanged behavior)
// true   → display reads setup_report_entries from Firestore
const USE_FIRESTORE_SETUP_REPORT = false;

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

export default function SetUpReportDrive({ weekOf = null, campus = "", weekLabel: parentWeekLabel = "", readOnly = false }) {
  const { data: report, loading, error, reload } = useWidget(
    () => fetchSetupReport(weekOf), [weekOf]
  );

  const { role } = useRole();
  const canEdit = roleAtLeast(role, "manager");

  const [modalOpen, setModalOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const blobRef = useRef(null);

  // Native entry authoring (manager and above). Phase 2: create/edit/delete
  // write to Firestore. Phase 3: when the cutover flag is on, the display
  // reads those entries instead of the Google Sheets PDF.
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // null = create mode

  // Firestore-backed display (active only when USE_FIRESTORE_SETUP_REPORT)
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
        collection(db, "setup_report_entries"),
        where("weekOf", "==", weekTimestamp),
        orderBy("date")
      );
      const snapshot = await getDocs(q);
      setFirestoreEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching setup report entries:", err);
      setFirestoreError(err.message);
    } finally {
      setFirestoreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (USE_FIRESTORE_SETUP_REPORT) fetchEntriesFromFirestore(currentWeekSunday);
  }, [currentWeekSunday, fetchEntriesFromFirestore]);

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
  const label = report?.weekLabel ?? "Weekly set up report";

  // Firestore-mode week label / navigation state
  const isViewingCurrentWeek =
    currentWeekSunday.getTime() === getWeekSunday(new Date()).getTime();
  const firestoreWeekLabel = `Week of ${currentWeekSunday.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })}`;
  const goToWeek = (deltaDays) => {
    const next = new Date(currentWeekSunday);
    next.setDate(next.getDate() + deltaDays);
    setCurrentWeekSunday(next);
  };

  const handlePrint = () => {
    const iframe = document.getElementById("setup-report-preview");
    if (!iframe) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(blobUrl || report?.downloadUrl, "_blank");
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
                  }}>Set Up Report</div>
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
                {report?.downloadUrl && (
                  <a
                    href={report.downloadUrl}
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
                  id="setup-report-preview"
                  src={blobUrl}
                  title="Set Up Report PDF"
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
        title="Set Up Report"
        subtitle={label}
        icon="📋"
        accentColor={COLORS.AQUA}
        loading={USE_FIRESTORE_SETUP_REPORT ? false : loading}
        error={USE_FIRESTORE_SETUP_REPORT ? null : error}
        onRetry={reload}
        empty={USE_FIRESTORE_SETUP_REPORT ? false : notFound}
        emptyIcon="📋"
        emptyMessage="No Set Up Report found for this week."
        actions={[
          ...(canEdit ? [{
            icon: "＋",
            label: "Add Task",
            onClick: () => {
              setEditingEntry(null);
              setEntryModalOpen(true);
            },
          }] : []),
          ...(readOnly ? [] : [{
            icon: "📧",
            label: "Email",
            // Phase 4: email is decoupled from Google Sheets — it links to the
            // app's weekly-ops view of the week rather than the Sheets PDF, and
            // no longer reads the Sheets `report` object.
            onClick: () => launchEmailComposer(
              "Set Up Report",
              campus,
              parentWeekLabel || firestoreWeekLabel,
              `${window.location.origin}?tab=weekly-ops&week=${encodeURIComponent(weekOf)}`
            ),
          }]),
          {
            label: "↻ Refresh",
            onClick: USE_FIRESTORE_SETUP_REPORT
              ? () => fetchEntriesFromFirestore(currentWeekSunday)
              : reload,
          },
        ]}
      >
        {USE_FIRESTORE_SETUP_REPORT ? (
          <div style={{ padding: "8px 0 4px" }}>
            {/* Week navigation */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              flexWrap: "wrap", marginBottom: 14,
            }}>
              <button
                onClick={() => goToWeek(-7)}
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
              }}>{firestoreWeekLabel}</span>
              <button
                onClick={() => goToWeek(7)}
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

            <SetupReportEntriesList
              entries={firestoreEntries}
              loading={firestoreLoading}
              error={firestoreError}
              canEdit={canEdit}
              onEditEntry={(entry) => {
                setEditingEntry(entry);
                setEntryModalOpen(true);
              }}
            />
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
                View Set Up Report &rsaquo; {label}
              </button>
            </div>
          )
        )}
      </Widget>

      {/* ── Entry modal (create / edit / delete) ── */}
      {entryModalOpen && (
        <SetupReportEntryModal
          isOpen={entryModalOpen}
          onClose={() => setEntryModalOpen(false)}
          weekOf={currentWeekSunday}
          existingEntry={editingEntry}
          onSaved={() => {
            setEntryModalOpen(false);
            if (USE_FIRESTORE_SETUP_REPORT) fetchEntriesFromFirestore(currentWeekSunday);
          }}
          onDeleted={() => {
            setEntryModalOpen(false);
            if (USE_FIRESTORE_SETUP_REPORT) fetchEntriesFromFirestore(currentWeekSunday);
          }}
        />
      )}
    </>
  );
}
