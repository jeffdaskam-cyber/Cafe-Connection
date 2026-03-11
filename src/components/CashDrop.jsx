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
import { useAuth } from "../contexts/AuthContext.jsx";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR } from "./CampusSelector.jsx";

// ── Brand palette ──────────────────────────────────────────────────────────────
const SPACE  = "#011837";
const BORDER = "#003070";
const TPRI   = "#FFFFFF";
const TSEC   = "#7aaec8";
const AQUA   = "#00A2B4";
const ORANGE = "#FAA119";

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
  const accent = CAMPUS_COLOR[campus] ?? AQUA;

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

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: `${SPACE}cc`,
    border: `1px solid ${BORDER}`,
    borderRadius: 8, color: TPRI,
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
            <div style={{ fontSize: 10, color: TSEC, fontWeight: 600,
              letterSpacing: "1.1px", textTransform: "uppercase",
              marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Amount ($)</div>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(null); }}
              style={{ ...inputStyle,
                borderColor: error ? `${ORANGE}88` : BORDER,
              }}
            />
          </div>

          {/* Date */}
          <div>
            <div style={{ fontSize: 10, color: TSEC, fontWeight: 600,
              letterSpacing: "1.1px", textTransform: "uppercase",
              marginBottom: 6, fontFamily: "'Poppins',sans-serif" }}>Date</div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: TSEC, fontWeight: 600,
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
          <div style={{ fontSize: 11, color: ORANGE, marginBottom: 8,
            fontFamily: "'Poppins',sans-serif" }}>{error}</div>
        )}

        <button type="submit" disabled={saving}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
            background: saved ? `${accent}44` : saving ? `${accent}77` : accent,
            color: saved ? accent : SPACE,
            border: saved ? `1px solid ${accent}` : "none",
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
        <div style={{ fontSize: 10, color: TSEC, fontWeight: 600,
          letterSpacing: "1.2px", textTransform: "uppercase",
          marginBottom: 10, fontFamily: "'Poppins',sans-serif" }}>
          Recent Drops
        </div>

        {loadingDrops ? (
          <div style={{ height: 40, background: `${BORDER}44`, borderRadius: 8,
            animation: "ucar-shimmer 1.4s ease-in-out infinite" }} />
        ) : drops.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0",
            color: `${TSEC}88`, fontSize: 11,
            fontFamily: "'Poppins',sans-serif" }}>
            No drops recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drops.map(drop => (
              <div key={drop.id} style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8,
                background: `${SPACE}cc`,
                border: `1px solid ${BORDER}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TPRI,
                    fontFamily: "'Poppins',sans-serif" }}>
                    {fmtMoney(drop.amount)}
                  </div>
                  <div style={{ fontSize: 10, color: TSEC,
                    fontFamily: "'Poppins',sans-serif", marginTop: 1 }}>
                    {drop.date && new Date(drop.date + "T12:00:00").toLocaleDateString("en-US",
                      { month: "short", day: "numeric", year: "numeric" })}
                    {drop.notes ? ` · ${drop.notes}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: `${TSEC}88`,
                  fontFamily: "'Poppins',sans-serif", textAlign: "right" }}>
                  {fmtTimestamp(drop.created_at)}
                  <br />
                  <span style={{ fontSize: 9 }}>{drop.created_by}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Widget>
  );
}
