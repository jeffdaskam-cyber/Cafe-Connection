/**
 * CashDrop — log a cash drop for a campus and view recent entries.
 *
 * Writes to the `cash_drops` Firestore collection.
 * Shows the 10 most recent drops for the selected campus below the form.
 *
 * Props:
 *   campus  {string} — currently selected campus (e.g. "Mesa Lab")
 */

import { useState, useEffect } from "react";
import { addCashDrop, removeCashDrop, subscribeRecentCashDrops } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR } from "./CampusSelector.jsx";
import { COLORS, RADIUS } from "../theme.js";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTimestamp(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CashDrop({ campus }) {
  const { user } = useAuth();
  const accent = CAMPUS_COLOR[campus] ?? COLORS.AQUA;

  // Form state
  const [amount, setAmount] = useState("");
  const [date,   setDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState(null);

  // Recent drops list
  const [drops,   setDrops]   = useState([]);
  const [loadingDrops, setLoadingDrops] = useState(true);
  const [removingId, setRemovingId] = useState("");

  useEffect(() => {
    setLoadingDrops(true);
    const unsub = subscribeRecentCashDrops(campus, (data) => {
      setDrops(data);
      setLoadingDrops(false);
    });
    return unsub;
  }, [campus]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await addCashDrop({
        campus,
        amount: Number(amount),
        date,
        notes,
        uid:   user.uid,
        email: user.email,
      });
      setAmount("");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("[CashDrop] Failed:", err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveDrop(dropId) {
    if (!dropId || removingId) return;
    const confirmed = window.confirm("Remove this cash drop entry?");
    if (!confirmed) return;

    setRemovingId(dropId);
    setError(null);
    try {
      await removeCashDrop(dropId);
    } catch (err) {
      console.error("[CashDrop] Failed to remove drop:", err);
      setError("Unable to remove this drop. You may not have permission.");
    } finally {
      setRemovingId("");
    }
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: COLORS.BG_SURFACE_ALT,
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
    fontFamily: "'Poppins',sans-serif",
    fontSize: 12, fontWeight: 500,
    padding: "9px 12px", outline: "none",
  };

  return (
    <Widget
      title="Cash Drop"
      subtitle={campus}
      icon="💵"
      accentColor={accent}
    >
      {/* ── Form ── */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {/* Amount */}
          <div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
              letterSpacing: "1.1px", textTransform: "uppercase",
              marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Amount ($)</div>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(null); }}
              style={{
                ...inputStyle,
                borderColor: error ? `${COLORS.WARNING}88` : COLORS.BORDER,
              }}
            />
          </div>

          {/* Date */}
          <div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
              letterSpacing: "1.1px", textTransform: "uppercase",
              marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Date</div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
            letterSpacing: "1.1px", textTransform: "uppercase",
            marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Notes (optional)</div>
          <input
            type="text"
            placeholder="Any notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{ fontSize: 11, color: COLORS.WARNING, marginBottom: 8,
            fontFamily: "'Poppins',sans-serif" }}>{error}</div>
        )}

        <button type="submit" disabled={saving}
          style={{
            width: "100%", padding: "10px 0", borderRadius: RADIUS.SM,
            background: saved ? COLORS.AQUA_LIGHT : saving ? `${accent}77` : accent,
            color: saved ? accent : COLORS.TEXT_ON_ACCENT,
            border: saved ? `1px solid ${COLORS.AQUA_BORDER}` : "none",
            fontFamily: "'Poppins',sans-serif",
            fontWeight: 700, fontSize: 12,
            cursor: saving ? "not-allowed" : "pointer",
            transition: "all .2s",
          }}>
          {saved ? "✓ Recorded!" : saving ? "Saving…" : "Log Cash Drop"}
        </button>
      </form>

      {/* ── Recent Drops ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
          letterSpacing: "1.2px", textTransform: "uppercase",
          marginBottom: 10, fontFamily: "'Poppins',sans-serif" }}>
          Recent Drops
        </div>

        {loadingDrops ? (
          <div style={{ height: 40, background: COLORS.BG_SURFACE_HOVER, borderRadius: 8,
            animation: "ucar-shimmer 1.4s ease-in-out infinite" }} />
        ) : drops.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0",
            color: COLORS.TEXT_DISABLED, fontSize: 11,
            fontFamily: "'Poppins',sans-serif" }}>
            No drops recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drops.map(drop => (
              <div key={drop.id} style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px", borderRadius: RADIUS.SM,
                background: COLORS.BG_SURFACE_ALT,
                border: `1px solid ${COLORS.BORDER}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                    fontFamily: "'Poppins',sans-serif" }}>
                    {fmtMoney(drop.amount)}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.TEXT_SECONDARY,
                    fontFamily: "'Poppins',sans-serif", marginTop: 1 }}>
                    {drop.date && new Date(drop.date + "T12:00:00").toLocaleDateString("en-US",
                      { month: "short", day: "numeric", year: "numeric" })}
                    {drop.notes ? ` · ${drop.notes}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED,
                  fontFamily: "'Poppins',sans-serif", textAlign: "right" }}>
                  {fmtTimestamp(drop.created_at)}
                  <br />
                  <span style={{ fontSize: 9 }}>{drop.created_by}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDrop(drop.id)}
                  disabled={removingId === drop.id}
                  style={{
                    marginLeft: 10,
                    border: `1px solid ${COLORS.BORDER}`,
                    background: "transparent",
                    color: COLORS.TEXT_MUTED,
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: "'Poppins',sans-serif",
                    cursor: removingId === drop.id ? "not-allowed" : "pointer",
                    opacity: removingId === drop.id ? 0.65 : 1,
                  }}
                >
                  {removingId === drop.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Widget>
  );
}
