/**
 * SetUpReport — event setup instruction sheet.
 *
 * Staff fills in event details + setup requirements; the Widget wraps it
 * with a print action so the saved sheet can be handed to catering staff.
 * All submissions are stored in the `setup_reports` Firestore collection.
 */

import { useState } from "react";
import { saveSetupReport, subscribeSetupReports } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useWidgetSubscription } from "../hooks/useWidget.js";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR, CAMPUSES } from "./CampusSelector.jsx";
import { COLORS } from "../theme.js";

const ACCENT = "#FAA119"; // orange accent for set-up reports

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtEventDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtAge(ts) {
  if (!ts) return "";
  const d     = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const days  = Math.floor(diffMs / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function SetUpReport() {
  const { user } = useAuth();

  // Form state
  const [showForm,      setShowForm]      = useState(false);
  const [title,         setTitle]         = useState("");
  const [campus,        setCampus]        = useState(CAMPUSES[0]);
  const [eventDate,     setEventDate]     = useState("");
  const [instructions,  setInstructions]  = useState("");
  const [saving,        setSaving]        = useState(false);
  const [savedTick,     setSavedTick]     = useState(false);
  const [formError,     setFormError]     = useState(null);

  // Past reports list (real-time)
  const { data: reports, loading: reportsLoading } = useWidgetSubscription(
    (cb) => subscribeSetupReports(cb), []
  );

  async function handleSave() {
    if (!title.trim()) { setFormError("Event name is required."); return; }
    if (!eventDate)     { setFormError("Event date is required."); return; }
    if (!user) return;
    setSaving(true); setFormError(null);
    try {
      await saveSetupReport({
        title: title.trim(),
        campus,
        eventDate,
        instructions,
        uid:   user.uid,
        email: user.email,
      });
      setShowForm(false);
      setTitle(""); setCampus(CAMPUSES[0]); setEventDate(""); setInstructions("");
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
    } catch (err) {
      console.error("[SetUpReport] Save failed:", err);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setShowForm(false);
    setTitle(""); setEventDate(""); setInstructions("");
    setFormError(null);
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: COLORS.BG_SURFACE_ALT,
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: 8, color: COLORS.TEXT_PRIMARY,
    fontFamily: "'Poppins',sans-serif",
    fontSize: 12, fontWeight: 500,
    padding: "9px 12px", outline: "none",
  };

  const headerActions = !showForm
    ? [{ icon: "➕", label: "New", onClick: () => setShowForm(true) }]
    : [];

  return (
    <Widget
      title="Set-Up Report"
      subtitle="Event setup sheets for catering staff"
      icon="🔧"
      accentColor={ACCENT}
      loading={reportsLoading && !showForm}
      printable
      actions={headerActions}
    >
      {/* ── Form ── */}
      {showForm && (
        <div style={{ marginBottom: reports?.length ? 20 : 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {/* Title */}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.1px", textTransform: "uppercase",
                marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Event Name</div>
              <input type="text" value={title} onChange={e => { setTitle(e.target.value); setFormError(null); }}
                placeholder="e.g. Board Meeting Luncheon"
                style={{ ...inputStyle, borderColor: formError && !title ? `${COLORS.WARNING}88` : COLORS.BORDER }} />
            </div>

            {/* Campus */}
            <div>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.1px", textTransform: "uppercase",
                marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Campus</div>
              <select value={campus} onChange={e => setCampus(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {CAMPUSES.map(c => (
                  <option key={c} value={c} style={{ background: COLORS.BG_SURFACE }}>{c}</option>
                ))}
              </select>
            </div>

            {/* Event date */}
            <div>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.1px", textTransform: "uppercase",
                marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Event Date</div>
              <input type="date" value={eventDate}
                onChange={e => { setEventDate(e.target.value); setFormError(null); }}
                style={{ ...inputStyle, borderColor: formError && !eventDate ? `${COLORS.WARNING}88` : COLORS.BORDER }} />
            </div>
          </div>

          {/* Instructions */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
              letterSpacing: "1.1px", textTransform: "uppercase",
              marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>
              Setup Instructions &amp; Requirements
            </div>
            <textarea value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={"Tables: \nChairs: \nLinens: \nAV/Equipment: \nCatering items: \nSpecial notes: "}
              style={{ ...inputStyle, minHeight: 130, resize: "vertical", lineHeight: 1.65 }} />
          </div>

          {formError && (
            <div style={{ fontSize: 11, color: COLORS.WARNING, marginBottom: 8,
              fontFamily: "'Poppins',sans-serif" }}>{formError}</div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                background: saving ? `${ACCENT}77` : ACCENT,
                color: COLORS.TEXT_ON_ACCENT, fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 12,
                cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Save Setup Sheet"}
            </button>
            <button onClick={handleCancel}
              style={{ padding: "10px 18px", borderRadius: 8,
                border: `1px solid ${COLORS.BORDER}`, background: "transparent",
                color: COLORS.TEXT_SECONDARY, fontFamily: "'Poppins',sans-serif",
                fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Saved tick ── */}
      {savedTick && !showForm && (
        <div style={{ fontSize: 11, color: ACCENT, marginBottom: 10,
          fontFamily: "'Poppins',sans-serif", fontWeight: 600 }}>
          ✓ Setup sheet saved.
        </div>
      )}

      {/* ── Past setup reports list ── */}
      {!showForm && (
        <>
          {!reports || reports.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 0",
              color: COLORS.TEXT_MUTED, fontSize: 12,
              fontFamily: "'Poppins',sans-serif" }}>
              No setup sheets on file yet.
              <br />
              <button onClick={() => setShowForm(true)}
                style={{ marginTop: 10, background: "transparent",
                  border: `1px solid ${COLORS.BORDER}`, borderRadius: 6,
                  padding: "6px 14px", color: COLORS.TEXT_SECONDARY, cursor: "pointer",
                  fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 11 }}>
                Create the first one
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reports.map(r => {
                const cc = CAMPUS_COLOR[r.campus] ?? ACCENT;
                return (
                  <div key={r.id} style={{
                    background: COLORS.BG_SURFACE_ALT, borderRadius: 10,
                    border: `1px solid ${COLORS.BORDER}`, padding: "12px 14px",
                    borderLeft: `3px solid ${cc}55`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                          fontFamily: "'Poppins',sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 10, color: COLORS.TEXT_SECONDARY,
                          fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>
                          {r.campus} · {fmtEventDate(r.eventDate)}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED,
                        fontFamily: "'Poppins',sans-serif", flexShrink: 0 }}>
                        {fmtAge(r.created_at)}
                      </div>
                    </div>
                    {r.instructions && (
                      <div style={{ marginTop: 8, fontSize: 11, color: COLORS.TEXT_SECONDARY,
                        fontFamily: "'Poppins',sans-serif", lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                        maxHeight: 60, overflow: "hidden",
                        maskImage: "linear-gradient(to bottom, white 60%, transparent 100%)",
                        WebkitMaskImage: "linear-gradient(to bottom, white 60%, transparent 100%)",
                      }}>
                        {r.instructions}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Widget>
  );
}
