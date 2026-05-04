/**
 * DashboardPage — Phase 8 personalized widget grid.
 *
 * Loads per-user prefs from Firestore (user_dashboard_prefs/{uid}).
 * Shows a first-run wizard if setupDone is false (brand-new user).
 * Renders the enabled widgets in position order on a 3-column grid.
 * An "Edit Dashboard" button re-opens the widget picker at any time.
 */

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, getDashboardNotes, addDashboardNote, deleteDashboardNote } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRole } from "../hooks/useRole.js";
import { useDashboardPrefs } from "../hooks/useDashboardPrefs.js";
import { widgetById, defaultPrefs } from "../registries/widgetRegistry.js";
import {
  canSeeWidget,
  hasFullAccess,
  DASHBOARD_WIDGET_KEY,
} from "../utils/permissions.js";
import FirstRunWizard from "../components/dashboard/FirstRunWizard.jsx";
import { COLORS, SHADOWS, RADIUS } from "../theme.js";

// ── Mini widget components ────────────────────────────────────────────────────
import SalesSummaryWidget  from "../components/dashboard/SalesSummaryWidget.jsx";
import ScheduleWidget      from "../components/dashboard/ScheduleWidget.jsx";
import CashDropWidget      from "../components/dashboard/CashDropWidget.jsx";
import CafeSpecialsWidget  from "../components/dashboard/CafeSpecialsWidget.jsx";
import RecentReportsWidget from "../components/dashboard/RecentReportsWidget.jsx";
import EventOrderLibraryWidget from "../components/dashboard/EventOrderLibraryWidget.jsx";
import EventReportDashWidget  from "../components/dashboard/EventReportDashWidget.jsx";
import SetUpReportWidget     from "../components/dashboard/SetUpReportWidget.jsx";
import WeeklyExceptions from "../components/WeeklyExceptions.jsx";
import VendorPortal from "../components/VendorPortal.jsx";

// ── Widget component map ──────────────────────────────────────────────────────
const WIDGET_COMPONENTS = {
  sales_summary:       SalesSummaryWidget,
  schedule:            ScheduleWidget,
  cash_drop:           CashDropWidget,
  cafe_specials:       CafeSpecialsWidget,
  recent_reports:      RecentReportsWidget,
  event_order_library: EventOrderLibraryWidget,
  event_report:        EventReportDashWidget,
  setup_report:        SetUpReportWidget,
  weekly_exceptions:   WeeklyExceptions,
  vendor_portal:       VendorPortal,
};


// ── Wave decoration ───────────────────────────────────────────────────────────
function WaveGraphic({ color = COLORS.AQUA, opacity = 0.18, width = 420, height = 80 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
      {[0, 14, 28, 42].map((offset, i) => (
        <path key={i}
          d={`M0,${30+offset} C80,${10+offset} 160,${50+offset} 240,${28+offset} S380,${8+offset} ${width},${30+offset}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={opacity - i * 0.02} />
      ))}
    </svg>
  );
}

// ── Loading skeleton for the whole page ───────────────────────────────────────
function PageSkeleton() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>
      <div style={{
        background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
        border: `1px solid ${COLORS.BORDER}`,
        height: 100, marginBottom: 32,
        animation: "ucar-shimmer 1.6s ease-in-out infinite",
        backgroundSize: "200% 100%",
        backgroundImage: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
      }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{
            background: COLORS.BG_SURFACE, borderRadius: RADIUS.MD,
            border: `1px solid ${COLORS.BORDER}`,
            height: 160,
            animation: "ucar-shimmer 1.6s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
            backgroundSize: "200% 100%",
            backgroundImage: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { role } = useRole();
  const { prefs, loading: prefsLoading, saveErr, savePrefs } = useDashboardPrefs();

  const [wizardOpen,    setWizardOpen]    = useState(false);
  const [editOpen,      setEditOpen]      = useState(false);
  const [notesOpen,     setNotesOpen]     = useState(false);
  const [seedAttempted, setSeedAttempted] = useState(false);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState(null);
  const [notes,        setNotes]        = useState([]);
  const [addNoteOpen,  setAddNoteOpen]  = useState(false);
  const [noteText,     setNoteText]     = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exitingNoteIds, setExitingNoteIds] = useState(new Set());

  // Read displayName from Firestore users doc (written by FirstRunWizard).
  // Falls back to email-derived name if not yet set.
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) setFirestoreDisplayName(snap.data().displayName || null);
    });
  }, [user?.uid]);

  const displayName = (() => {
    if (firestoreDisplayName) return firestoreDisplayName;
    const firstName = user?.email?.split("@")[0]?.split(".")[0] ?? "";
    return firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "there";
  })();

  useEffect(() => {
    if (!user?.uid) return;
    getDashboardNotes(user.uid).then(setNotes);
  }, [user?.uid]);

  // When prefs finish loading: if no doc exists, seed defaults and open wizard
  useEffect(() => {
    if (prefsLoading) return;
    if (prefs === null && !seedAttempted) {
      setSeedAttempted(true);
      setWizardOpen(true);
    } else if (prefs && !prefs.setupDone && !wizardOpen && !seedAttempted) {
      setSeedAttempted(true);
      setWizardOpen(true);
    }
  }, [prefsLoading, prefs, seedAttempted, wizardOpen]);

  // Sort and filter widgets from prefs.
  // Saved prefs for widgets the current role cannot see are silently hidden
  // without mutating the stored preferences.
  const enabledWidgets = (prefs?.widgets ?? [])
    .filter(w => w.enabled)
    .filter(w => {
      const key = DASHBOARD_WIDGET_KEY[w.widgetId];
      return key ? canSeeWidget(role, key) : false;
    })
    .sort((a, b) => a.position - b.position);

  const canSeeNotes = canSeeWidget(role, "dashboard_notes");

  async function handleAddNote() {
    await addDashboardNote(user.uid, noteText);
    const updated = await getDashboardNotes(user.uid);
    setNotes(updated);
    setNoteText('');
    setAddNoteOpen(false);
  }

  function handleDeleteNote() {
    setExitingNoteIds(prev => new Set(prev).add(deleteTarget.id));
    setDeleteTarget(null);
  }

  async function handleNoteAnimationEnd(noteId) {
    await deleteDashboardNote(user.uid, noteId);
    const updated = await getDashboardNotes(user.uid);
    setNotes(updated);
    setExitingNoteIds(prev => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
  }

  if (prefsLoading) return <PageSkeleton />;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      <style>{`
        @keyframes slideOffRight {
          0%   { transform: translateX(0);     opacity: 1; }
          100% { transform: translateX(120px); opacity: 0; }
        }
        .note-exiting {
          animation: slideOffRight 350ms ease-in forwards;
          pointer-events: none;
        }
      `}</style>

      {/* ── First-run wizard ── */}
      {wizardOpen && (
        <FirstRunWizard
          initialPrefs={prefs ?? defaultPrefs()}
          onSave={async (newPrefs) => {
            await savePrefs(newPrefs);
            setWizardOpen(false);
          }}
          allowClose={false}
          startAtStep={0}
        />
      )}

      {/* ── Edit Dashboard widget picker ── */}
      {editOpen && (
        <FirstRunWizard
          initialPrefs={prefs}
          onSave={async (newPrefs) => {
            await savePrefs(newPrefs);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
          allowClose={true}
          startAtStep={1}
        />
      )}

      {/* ── Welcome Banner ── */}
      <div style={{
        background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
        border: `1px solid ${COLORS.BORDER}`,
        boxShadow: SHADOWS.SM,
        padding: "28px 36px", marginBottom: 32,
        position: "relative", overflow: "hidden",
        animation: "ucar-fadein .5s ease both",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, opacity: 0.07 }}>
          <WaveGraphic color={COLORS.AQUA} opacity={1} width={600} height={100} />
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${COLORS.AQUA}, ${COLORS.LAQUA}, transparent)`,
          borderRadius: `${RADIUS.LG} ${RADIUS.LG} 0 0` }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 6 }}>
              Welcome back, <span style={{ color: COLORS.AQUA, fontStyle: "italic" }}>{displayName}</span>.
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, fontWeight: 500, lineHeight: 1.65 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </div>
            {saveErr && (
              <div style={{ fontSize: 11, color: COLORS.WARNING, marginTop: 8 }}>
                ⚠ {saveErr}
              </div>
            )}
          </div>

          {/* Right side button stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>

            {/* Existing Edit Dashboard button */}
            <button
              onClick={() => setEditOpen(true)}
              title="Edit your dashboard widgets"
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.SM, padding: "8px 18px",
                cursor: "pointer",
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 600, fontSize: 11,
                color: COLORS.TEXT_SECONDARY, letterSpacing: "0.03em",
                transition: "all .18s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              ✦ Edit Dashboard
            </button>

            {/* New Notes toggle button */}
            {canSeeNotes && (
              <button
                onClick={() => setNotesOpen(prev => !prev)}
                title="Open notes"
                style={{
                  background: notesOpen ? COLORS.AQUA : "transparent",
                  border: `1px solid ${notesOpen ? COLORS.AQUA : COLORS.BORDER}`,
                  borderRadius: RADIUS.SM, padding: "8px 18px",
                  cursor: "pointer",
                  fontFamily: "'Poppins',sans-serif",
                  fontWeight: 600, fontSize: 11,
                  color: notesOpen ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_SECONDARY,
                  letterSpacing: "0.03em",
                  transition: "all .18s",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                📝 Notes{notes.length > 0 ? ` (${notes.length})` : ""}
              </button>
            )}

          </div>
        </div>

        {/* ── Notes Sidebar — renders inside banner when open ── */}
        {notesOpen && canSeeNotes && (
          <div style={{
            marginTop: 20,
            borderTop: `1px solid ${COLORS.BORDER}`,
            paddingTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            animation: "ucar-fadein 0.2s ease both",
          }}>

            {/* Header row */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.TEXT_SECONDARY,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                My Notes
              </span>
              <button
                onClick={() => notes.length < 6 && setAddNoteOpen(true)}
                title="Add a sticky note"
                disabled={notes.length >= 6}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.BORDER}`,
                  borderRadius: RADIUS.SM, padding: "5px 14px",
                  cursor: notes.length >= 6 ? "not-allowed" : "pointer",
                  fontFamily: "'Poppins',sans-serif",
                  fontWeight: 600, fontSize: 11,
                  color: COLORS.TEXT_SECONDARY, letterSpacing: "0.03em",
                  transition: "all .18s",
                  opacity: notes.length >= 6 ? 0.4 : 1,
                }}>
                + Add Note
              </button>
            </div>

            {/* Notes grid — wrapping row of sticky notes */}
            {notes.length === 0 ? (
              <div style={{
                fontSize: 12,
                color: COLORS.TEXT_MUTED,
                fontStyle: "italic",
                paddingBottom: 4,
              }}>
                No notes yet. Click + Add Note to create one.
              </div>
            ) : (
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
              }}>
                {[...notes].sort((a, b) => a.createdAt - b.createdAt).map(note => {
                  const isExiting = exitingNoteIds.has(note.id);
                  return (
                    <div
                      key={note.id}
                      className={isExiting ? 'note-exiting' : undefined}
                      onAnimationEnd={isExiting ? () => handleNoteAnimationEnd(note.id) : undefined}
                      onClick={() => !isExiting && setDeleteTarget(note)}
                      style={{
                        width: '180px',
                        minHeight: '100px',
                        background: COLORS.NOTE_BG,
                        border: `1px solid ${COLORS.NOTE_BORDER}`,
                        borderRadius: '3px',
                        boxShadow: '2px 2px 5px rgba(0,0,0,0.15)',
                        padding: '10px',
                        fontSize: '13px',
                        lineHeight: '1.4',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      {note.text}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── Widget Grid ── */}
      {enabledWidgets.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "64px 32px",
              border: `1.5px dashed ${COLORS.BORDER}`, borderRadius: RADIUS.LG,
              animation: "ucar-fadein .6s ease both",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧩</div>
              <div style={{ fontSize: 14, color: COLORS.TEXT_SECONDARY, fontWeight: 600, marginBottom: 8 }}>
                No widgets enabled
              </div>
              <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 24 }}>
                Click <span style={{ color: COLORS.AQUA }}>Edit Dashboard</span> to add widgets to your home page.
              </div>
              <button onClick={() => setEditOpen(true)} style={{
                background: COLORS.AQUA,
                border: "none", borderRadius: RADIUS.MD,
                padding: "10px 24px", cursor: "pointer",
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 12, color: COLORS.TEXT_ON_ACCENT,
                boxShadow: `0 4px 16px ${COLORS.AQUA}33`,
              }}>
                ✦ Edit Dashboard
              </button>
            </div>
          ) : (
            <div style={{
              columnCount: 3,
              columnGap: 16,
              animation: "ucar-fadein .6s ease both",
            }}>
              {enabledWidgets.map(w => {
                const meta      = widgetById(w.widgetId);
                const Component = WIDGET_COMPONENTS[w.widgetId];
                if (!Component || !meta) return null;
                const permKey = DASHBOARD_WIDGET_KEY[w.widgetId];
                const readOnly = permKey ? !hasFullAccess(role, permKey) : false;
                return (
                  <div
                     key={w.widgetId}
                     style={{
                     breakInside: "avoid",
                     marginBottom: 16,
                     }}
                     >
                    <Component config={w.config ?? {}} readOnly={readOnly} />
                  </div>
                );
              })}
            </div>
      )}

      {/* ── Add Note Modal ── */}
      {addNoteOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: COLORS.BG_SURFACE, borderRadius: RADIUS.MD, padding: '24px', width: '320px', maxWidth: '90vw', boxShadow: SHADOWS.SM }}>
            <p style={{ fontWeight: 'bold', margin: '0 0 8px 0' }}>Add a Note</p>
            <textarea
              maxLength={200}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={4}
              style={{ width: '100%', resize: 'none', fontSize: '14px', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: '12px', color: COLORS.TEXT_MUTED, textAlign: 'right', margin: '4px 0 12px 0' }}>
              {noteText.length} / 200
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddNoteOpen(false); setNoteText(''); }}>Cancel</button>
              <button disabled={!noteText.trim()} onClick={handleAddNote}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Note Modal ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: COLORS.BG_SURFACE, borderRadius: RADIUS.MD, padding: '24px', width: '320px', maxWidth: '90vw', boxShadow: SHADOWS.SM }}>
            <p style={{ margin: '0 0 8px 0' }}>Delete this note?</p>
            <p style={{ fontSize: '13px', color: COLORS.TEXT_SECONDARY, fontStyle: 'italic', margin: '0 0 16px 0' }}>
              {deleteTarget.text}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button onClick={handleDeleteNote}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: COLORS.TEXT_DISABLED,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
        marginTop: 40 }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
