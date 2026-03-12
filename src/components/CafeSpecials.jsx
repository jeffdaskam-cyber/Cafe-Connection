/**
 * CafeSpecials — weekly specials board for a single campus.
 *
 * One Firestore doc per campus+week: cafe_specials/specials_{weekOf}_{campus_underscored}
 * Expandable Widget with an inline edit mode (pencil toggle).
 *
 * Props:
 *   weekOf  {string} — ISO Monday "YYYY-MM-DD"
 *   campus  {string} — e.g. "Mesa Lab"
 */

import { useState, useEffect, useRef } from "react";
import { subscribeCafeSpecials, saveCafeSpecials } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR } from "./CampusSelector.jsx";
import { COLORS, RADIUS } from "../theme.js";

// ── Component ──────────────────────────────────────────────────────────────────
export default function CafeSpecials({ weekOf, campus }) {
  const { user } = useAuth();
  const accent = CAMPUS_COLOR[campus] ?? COLORS.AQUA;

  const [specialsData, setSpecialsData] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [editing,      setEditing]      = useState(false);
  const [draft,        setDraft]        = useState("");
  const [saving,       setSaving]       = useState(false);

  // Reset edit mode when campus or week changes
  const keyRef = useRef(`${weekOf}__${campus}`);
  useEffect(() => {
    const key = `${weekOf}__${campus}`;
    if (keyRef.current !== key) {
      keyRef.current = key;
      setEditing(false);
      setDraft("");
    }
    setLoading(true);
    const unsub = subscribeCafeSpecials(weekOf, campus, (data) => {
      setSpecialsData(data);
      setLoading(false);
    });
    return unsub;
  }, [weekOf, campus]);

  function handleEdit() {
    setDraft(specialsData?.body ?? "");
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
      await saveCafeSpecials(weekOf, campus, draft, user.uid, user.email);
      setEditing(false);
      setDraft("");
    } catch (err) {
      console.error("[CafeSpecials] Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  const hasSpecials = specialsData?.body && specialsData.body.trim().length > 0;

  const headerActions = !editing
    ? [{
        label: hasSpecials ? "✏️ Edit" : "✏️ Add",
        onClick: handleEdit,
      }]
    : [];

  return (
    <Widget
      title={`${campus} Specials`}
      subtitle="Weekly menu specials"
      icon="🍽️"
      accentColor={accent}
      loading={loading}
      expandable
      actions={headerActions}
    >
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={`This week's specials for ${campus}…`}
            autoFocus
            style={{
              width: "100%", minHeight: 110,
              background: COLORS.BG_SURFACE_ALT,
              border: `1px solid ${accent}66`,
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
                background: saving ? `${accent}55` : accent,
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
      ) : hasSpecials ? (
        <div>
          <div style={{
            whiteSpace: "pre-wrap",
            color: COLORS.TEXT_PRIMARY,
            fontSize: 12,
            fontFamily: "'Poppins',sans-serif",
            lineHeight: 1.7,
            marginBottom: 8,
          }}>
            {specialsData.body}
          </div>
          {specialsData.updated_by && (
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif" }}>
              Last edited by {specialsData.updated_by}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: "24px 0",
          color: COLORS.TEXT_MUTED, fontSize: 12,
          fontFamily: "'Poppins',sans-serif",
        }}>
          No specials posted for this week.
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
            Post specials
          </button>
        </div>
      )}
    </Widget>
  );
}
