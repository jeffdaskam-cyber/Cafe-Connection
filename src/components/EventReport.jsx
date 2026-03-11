/**
 * EventReport — post-event summary form.
 *
 * Staff logs attendance, revenue, and notes after an event; all entries
 * are stored in the `event_reports` Firestore collection.
 * The copy-to-clipboard action formats a concise email summary.
 */

import { useState } from "react";
import { saveEventReport, subscribeEventReports } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useWidgetSubscription } from "../hooks/useWidget.js";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR, CAMPUSES } from "./CampusSelector.jsx";

// ── Brand palette ──────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const AQUA     = "#00A2B4";
const ORANGE   = "#FAA119";

const ACCENT = "#9B59B6"; // purple accent for event reports

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  if (n == null) return null;
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtEventDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtAge(ts) {
  if (!ts) return "";
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function EventReport() {
  const { user } = useAuth();

  // Form state
  const [showForm,   setShowForm]   = useState(false);
  const [title,      setTitle]      = useState("");
  const [campus,     setCampus]     = useState(CAMPUSES[0]);
  const [eventDate,  setEventDate]  = useState("");
  const [attendance, setAttendance] = useState("");
  const [revenue,    setRevenue]    = useState("");
  const [notes,      setNotes]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [savedTick,  setSavedTick]  = useState(false);
  const [formError,  setFormError]  = useState(null);

  // Clipboard state per report
  const [copiedId, setCopiedId] = useState(null);

  // Past reports list (real-time)
  const { data: reports, loading: reportsLoading } = useWidgetSubscription(
    (cb) => subscribeEventReports(cb), []
  );

  async function handleSave() {
    if (!title.trim()) { setFormError("Event name is required."); return; }
    if (!eventDate)     { setFormError("Event date is required."); return; }
    if (!user) return;
    setSaving(true); setFormError(null);
    try {
      await saveEventReport({
        title: title.trim(), campus, eventDate,
        attendance, revenue, notes,
        uid: user.uid, email: user.email,
      });
      setShowForm(false);
      setTitle(""); setCampus(CAMPUSES[0]); setEventDate("");
      setAttendance(""); setRevenue(""); setNotes("");
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
    } catch (err) {
      console.error("[EventReport] Save failed:", err);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function buildCopyText(r) {
    const lines = [
      "Good morning,",
      `Post-event summary for: ${r.title}`,
      `Campus:     ${r.campus}`,
      `Event Date: ${fmtEventDate(r.eventDate)}`,
    ];
    if (r.attendance != null) lines.push(`Attendance: ${r.attendance}`);
    if (r.revenue    != null) lines.push(`Revenue:    ${fmtMoney(r.revenue)}`);
    if (r.notes)               lines.push(`Notes:      ${r.notes}`);
    lines.push(""); lines.push("Please let me know if you have any questions.");
    lines.push(""); lines.push("Sincerely,");
    return lines.join("\n");
  }

  function handleCopy(r) {
    navigator.clipboard.writeText(buildCopyText(r)).then(() => {
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  }

  function handleCancel() {
    setShowForm(false);
    setTitle(""); setEventDate(""); setAttendance(""); setRevenue(""); setNotes("");
    setFormError(null);
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: `${SPACE}cc`,
    border: `1px solid ${BORDER}`,
    borderRadius: 8, color: TPRI,
    fontFamily: "'Poppins',sans-serif",
    fontSize: 12, fontWeight: 500,
    padding: "9px 12px", outline: "none",
    colorScheme: "dark",
  };

  const labelStyle = {
    fontSize: 10, color: TSEC, fontWeight: 600,
    letterSpacing: "1.1px", textTransform: "uppercase",
    marginBottom: 6, fontFamily: "'Poppins',sans-serif",
    display: "block",
  };

  const headerActions = !showForm
    ? [{ icon: "➕", label: "New", onClick: () => setShowForm(true) }]
    : [];

  return (
    <Widget
      title="Event Report"
      subtitle="Post-event attendance &amp; revenue log"
      icon="🎪"
      accentColor={ACCENT}
      loading={reportsLoading && !showForm}
      actions={headerActions}
    >
      {/* ── Form ── */}
      {showForm && (
        <div style={{ marginBottom: reports?.length ? 20 : 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {/* Event name */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Event Name</label>
              <input type="text" value={title}
                onChange={e => { setTitle(e.target.value); setFormError(null); }}
                placeholder="e.g. Leadership Summit Luncheon"
                style={{ ...inputStyle, borderColor: formError && !title ? `${ORANGE}88` : BORDER }} />
            </div>

            {/* Campus */}
            <div>
              <label style={labelStyle}>Campus</label>
              <select value={campus} onChange={e => setCampus(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {CAMPUSES.map(c => (
                  <option key={c} value={c} style={{ background: DARKBLUE }}>{c}</option>
                ))}
              </select>
            </div>

            {/* Event date */}
            <div>
              <label style={labelStyle}>Event Date</label>
              <input type="date" value={eventDate}
                onChange={e => { setEventDate(e.target.value); setFormError(null); }}
                style={{ ...inputStyle, borderColor: formError && !eventDate ? `${ORANGE}88` : BORDER }} />
            </div>

            {/* Headcount */}
            <div>
              <label style={labelStyle}>Headcount (optional)</label>
              <input type="number" min="0" value={attendance}
                onChange={e => setAttendance(e.target.value)}
                placeholder="0"
                style={inputStyle} />
            </div>

            {/* Revenue */}
            <div>
              <label style={labelStyle}>Revenue $ (optional)</label>
              <input type="number" min="0" step="0.01" value={revenue}
                onChange={e => setRevenue(e.target.value)}
                placeholder="0.00"
                style={inputStyle} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observations, issues, follow-ups…"
              style={{ ...inputStyle, minHeight: 90, resize: "vertical", lineHeight: 1.65 }} />
          </div>

          {formError && (
            <div style={{ fontSize: 11, color: ORANGE, marginBottom: 8,
              fontFamily: "'Poppins',sans-serif" }}>{formError}</div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                background: saving ? `${ACCENT}77` : ACCENT,
                color: TPRI, fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 12,
                cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Save Event Report"}
            </button>
            <button onClick={handleCancel}
              style={{ padding: "10px 18px", borderRadius: 8,
                border: `1px solid ${BORDER}`, background: "transparent",
                color: TSEC, fontFamily: "'Poppins',sans-serif",
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
          ✓ Event report saved.
        </div>
      )}

      {/* ── Past event reports list ── */}
      {!showForm && (
        <>
          {!reports || reports.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 0",
              color: `${TSEC}88`, fontSize: 12,
              fontFamily: "'Poppins',sans-serif" }}>
              No event reports logged yet.
              <br />
              <button onClick={() => setShowForm(true)}
                style={{ marginTop: 10, background: "transparent",
                  border: `1px solid ${BORDER}`, borderRadius: 6,
                  padding: "6px 14px", color: TSEC, cursor: "pointer",
                  fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 11 }}>
                Log the first event
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reports.map(r => {
                const cc = CAMPUS_COLOR[r.campus] ?? ACCENT;
                return (
                  <div key={r.id} style={{
                    background: `${SPACE}cc`, borderRadius: 10,
                    border: `1px solid ${BORDER}`, padding: "12px 14px",
                    borderLeft: `3px solid ${cc}55`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TPRI,
                          fontFamily: "'Poppins',sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 10, color: TSEC,
                          fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>
                          {r.campus} · {fmtEventDate(r.eventDate)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: `${TSEC}88`,
                          fontFamily: "'Poppins',sans-serif" }}>
                          {fmtAge(r.created_at)}
                        </div>
                        <button onClick={() => handleCopy(r)}
                          style={{ background: copiedId === r.id ? `${AQUA}22` : "transparent",
                            border: `1px solid ${copiedId === r.id ? AQUA + "66" : BORDER}`,
                            borderRadius: 5, padding: "3px 8px",
                            cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                            fontWeight: 600, fontSize: 9,
                            color: copiedId === r.id ? AQUA : TSEC,
                            letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {copiedId === r.id ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: "flex", gap: 16 }}>
                      {r.attendance != null && (
                        <div>
                          <div style={{ fontSize: 9, color: TSEC, fontWeight: 600,
                            letterSpacing: "0.08em", textTransform: "uppercase",
                            fontFamily: "'Poppins',sans-serif" }}>Headcount</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: TPRI,
                            fontFamily: "'Poppins',sans-serif" }}>{r.attendance}</div>
                        </div>
                      )}
                      {r.revenue != null && (
                        <div>
                          <div style={{ fontSize: 9, color: TSEC, fontWeight: 600,
                            letterSpacing: "0.08em", textTransform: "uppercase",
                            fontFamily: "'Poppins',sans-serif" }}>Revenue</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: TPRI,
                            fontFamily: "'Poppins',sans-serif" }}>{fmtMoney(r.revenue)}</div>
                        </div>
                      )}
                    </div>

                    {r.notes && (
                      <div style={{ marginTop: 8, fontSize: 11, color: TSEC,
                        fontFamily: "'Poppins',sans-serif", lineHeight: 1.55,
                        whiteSpace: "pre-wrap" }}>
                        {r.notes}
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
