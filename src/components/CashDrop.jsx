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
import { addCashDrop, subscribeRecentCashDrops } from "../firebase.js";
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
@@ -193,33 +211,53 @@ export default function CashDrop({ campus }) {
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
