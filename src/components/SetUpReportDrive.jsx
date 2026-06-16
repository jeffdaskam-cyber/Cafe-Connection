/**
 * SetUpReportDrive — Weekly Ops widget for the Set Up Report.
 *
 * Reads setup/reset tasks from the `setup_report_entries` Firestore collection
 * for the viewed week, grouped by campus → date, with prev/next week
 * navigation. Managers and above can add, edit, and delete entries via
 * SetupReportEntryModal.
 *
 * (Phase 3 cutover complete: the legacy Google Sheets PDF path has been
 * removed here. The Sheets setup-report PDF still backs WeeklyPacketReport,
 * so api/get-setup-report.mjs and fetchSetupReport remain in use elsewhere.)
 */

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import Widget from "./Widget.jsx";
import SetupReportEntryModal from "./SetupReportEntryModal.jsx";
import SetupReportEntriesList from "./SetupReportEntriesList.jsx";
import SetupReportPreviewModal from "./SetupReportPreviewModal.jsx";
import { useRole } from "../hooks/useRole.js";
import { roleAtLeast } from "../utils/permissions.js";
import { COLORS } from "../theme.js";
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

export default function SetUpReportDrive({ weekOf = null, campus = "", weekLabel: parentWeekLabel = "", readOnly = false }) {
  const { role } = useRole();
  const canEdit = roleAtLeast(role, "manager");

  // Native entry authoring (manager and above)
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // null = create mode
  const [previewOpen, setPreviewOpen] = useState(false);

  // Firestore-backed display
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
    fetchEntriesFromFirestore(currentWeekSunday);
  }, [currentWeekSunday, fetchEntriesFromFirestore]);

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

  return (
    <>
      <Widget
        title="Set Up Report"
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
            label: "Add Task",
            onClick: () => {
              setEditingEntry(null);
              setEntryModalOpen(true);
            },
          }] : []),
          ...(readOnly ? [] : [{
            icon: "📧",
            label: "Email",
            // Email links to the app's weekly-ops view of the week (Firestore
            // data); no Google Sheets dependency.
            onClick: () => launchEmailComposer(
              "Set Up Report",
              campus,
              parentWeekLabel || firestoreWeekLabel,
              `${window.location.origin}?tab=weekly-ops&week=${encodeURIComponent(weekOf)}`
            ),
          }]),
          { label: "↻ Refresh", onClick: () => fetchEntriesFromFirestore(currentWeekSunday) },
        ]}
      >
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
      </Widget>

      {/* ── Preview modal (full-screen printable report) ── */}
      <SetupReportPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        entries={firestoreEntries}
        weekLabel={firestoreWeekLabel}
      />

      {/* ── Entry modal (create / edit / delete) ── */}
      {entryModalOpen && (
        <SetupReportEntryModal
          isOpen={entryModalOpen}
          onClose={() => setEntryModalOpen(false)}
          weekOf={currentWeekSunday}
          existingEntry={editingEntry}
          onSaved={() => {
            setEntryModalOpen(false);
            fetchEntriesFromFirestore(currentWeekSunday);
          }}
          onDeleted={() => {
            setEntryModalOpen(false);
            fetchEntriesFromFirestore(currentWeekSunday);
          }}
        />
      )}
    </>
  );
}
