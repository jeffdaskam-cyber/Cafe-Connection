/**
 * ScheduleNotes — org-wide notes for a given week.
 *
 * One Firestore doc per week: schedule_notes/note_{weekOf}
 * Anyone on the team can read or edit. Changes are saved immediately on blur.
 *
 * Props:
 *   weekOf  {string} — ISO Monday "YYYY-MM-DD"
 */

import { useState, useEffect, useRef } from "react";
import { subscribeScheduleNote, saveScheduleNote } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Widget from "./Widget.jsx";
import { COLORS, RADIUS } from "../theme.js";

// ── Component ──────────────────────────────────────────────────────────────────
export default function ScheduleNotes({ weekOf }) {
  const { user } = useAuth();

  const [noteData,  setNoteData]  = useState(null);   // Firestore doc or null
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(false);
  const [draft,     setDraft]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  // Track last weekOf so we can reset edit state when the week changes
  const weekRef = useRef(weekOf);

  useEffect(() => {
    if (weekRef.current !== weekOf) {
      weekRef.current = weekOf;
      setEditing(false);
      setDraft("");
    }
    setLoading(true);
    const unsub = subscribeScheduleNote(weekOf, (data) => {
      setNoteData(data);
      setLoading(false);
    });
    return unsub;
  }, [weekOf]);

  function handleEdit() {
    setDraft(noteData?.body ?? "");
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setDraft("");
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await saveScheduleNote(weekOf, draft, user.uid, user.email);
      setEditing(false);
      setDraft("");
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } catch (err) {
      console.error("[ScheduleNotes] Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  const hasNote = noteData?.body && noteData.body.trim().length > 0;

  const headerActions = !editing
    ? [{
        label: hasNote ? "✏️ Edit" : "✏️ Add Note",
        onClick: handleEdit,
      }]
    : [];

  return (
    <Widget
      title="Schedule Notes"
      subtitle="Org-wide · all campuses"
      icon="📝"
      accentColor={COLORS.AQUA}
      loading={loading}
      actions={headerActions}
    >
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add notes for this week (reminders, announcements, coverage changes…)"
            autoFocus
            style={{
              width: "100%", minHeight: 120,
              background: COLORS.BG_SURFACE_ALT,
              border: `1px solid ${COLORS.AQUA_BORDER}`,
              borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
              fontFamily: "'Poppins',sans-serif",
              fontSize: 12, lineHeight: 1.65,
              padding: "12px 14px",
              resize: "vertical", outline: "none",
              boxSizing: "border-box",
              marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={handleCancel}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.SM, padding: "7px 16px",
                color: COLORS.TEXT_SECONDARY, cursor: "pointer",
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 600, fontSize: 11,
              }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{
                background: saving ? `${COLORS.AQUA}55` : COLORS.AQUA,
                border: "none",
                borderRadius: RADIUS.SM, padding: "7px 18px",
                color: COLORS.TEXT_ON_ACCENT,
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 11,
              }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : hasNote ? (
        <div>
          <div style={{
            whiteSpace: "pre-wrap",
            color: COLORS.TEXT_PRIMARY,
            fontSize: 12,
            fontFamily: "'Poppins',sans-serif",
            lineHeight: 1.7,
            marginBottom: 10,
          }}>
            {noteData.body}
          </div>
          {noteData.updated_by && (
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
              Last edited by {noteData.updated_by}
              {savedTick && " · ✓ Saved"}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: "24px 0",
          color: COLORS.TEXT_MUTED, fontSize: 12,
          fontFamily: "'Poppins',sans-serif",
        }}>
          No notes for this week.
          <br />
          <button onClick={handleEdit}
            style={{
              marginTop: 10,
              background: "transparent",
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.SM, padding: "6px 14px",
              color: COLORS.TEXT_SECONDARY, cursor: "pointer",
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 600, fontSize: 11,
            }}>
            Add a note
          </button>
        </div>
      )}
    </Widget>
  );
}
