/**
 * MobileOpsPage — mobile-friendly ops: Cash Drop.
 *
 * Cash Drops are per-campus, using addCashDrop / subscribeRecentCashDrops.
 */

import { useState, useEffect } from "react";
import {
  addCashDrop,
  isBagNumberTaken,
  subscribeRecentCashDrops,
} from "../../firebase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { COLORS } from "../../theme.js";

const CAMPUSES = ["Center Green", "Foothills", "Mesa Lab"];

export default function MobileOpsPage() {
  const [campus, setCampus] = useState("Center Green");

  return (
    <div style={{ padding: 16 }}>
      <h2 style={headingStyle}>Weekly Ops</h2>

      <select value={campus} onChange={(e) => setCampus(e.target.value)} style={selectStyle}>
        {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <CashDropSection campus={campus} />
    </div>
  );
}

// ── Cash Drop ─────────────────────────────────────────────────────────────────

function CashDropSection({ campus }) {
  const { user } = useAuth();
  const [amount,  setAmount]  = useState("");
  const [date,    setDate]    = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,   setNotes]   = useState("");
  const [bagNumber, setBagNumber] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [recent,  setRecent]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeRecentCashDrops(campus, (data) => {
      setRecent(data);
      setLoading(false);
    });
    return unsub;
  }, [campus]);

  async function handleSubmit() {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0 || !user) return;
    if (!bagNumber.trim()) {
      setError("Please enter the bag number.");
      return;
    }
    const taken = await isBagNumberTaken(bagNumber);
    if (taken) {
      setError(`Bag #${bagNumber.trim()} has already been used. Check the number and try again.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addCashDrop({
        campus,
        amount: num,
        date,
        notes,
        bag_number: bagNumber,
        uid:   user.uid,
        email: user.email,
      });
      setAmount("");
      setNotes("");
      setBagNumber("");
      setDate(new Date().toISOString().slice(0, 10));
    } catch (err) {
      console.error("[MobileOpsPage] Cash drop error:", err);
    }
    setSaving(false);
  }

  function fmtMoney(n) {
    return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtDate(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <section style={sectionStyle}>
      <h3 style={subheadStyle}>Cash Drop</h3>
      {loading ? <p style={mutedStyle}>Loading...</p> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Amount ($)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Bag Number"
              value={bagNumber}
              onChange={(e) => { setBagNumber(e.target.value); setError(null); }}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={inputStyle}
            />
            {error && (
              <p style={{ fontSize: 12, color: COLORS.WARNING, margin: 0 }}>{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving || !amount}
              style={buttonStyle(saving || !amount)}
            >
              {saving ? "Saving..." : "Log Cash Drop"}
            </button>
          </div>

          {recent.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 600, color: COLORS._DARKBLUE, marginBottom: 6 }}>
                Recent Drops
              </p>
              {recent.slice(0, 5).map((d) => (
                <div key={d.id} style={dropCardStyle}>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(d.amount)}</span>
                  <span style={{ color: COLORS.TEXT_MUTED, fontSize: 12 }}>
                    {d.date || fmtDate(d.created_at)}
                    {d.bag_number ? ` \u2014 Bag #${d.bag_number}` : ""}
                    {d.notes ? ` \u2014 ${d.notes}` : ""}
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const headingStyle  = { fontSize: 16, fontWeight: 700, color: COLORS._DARKBLUE, marginBottom: 12 };
const subheadStyle  = { fontSize: 14, fontWeight: 700, color: COLORS._DARKBLUE, marginBottom: 8 };
const mutedStyle    = { color: COLORS.TEXT_MUTED, fontSize: 13 };
const selectStyle   = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${COLORS.AQUA}`, fontSize: 14, background: COLORS.BG_SURFACE, marginBottom: 16,
};
const sectionStyle  = {
  background: COLORS.BG_SURFACE, borderRadius: 10, padding: 16,
  marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
};
const inputStyle = {
  width: "100%", borderRadius: 8, border: `1px solid ${COLORS.BORDER_STRONG}`,
  fontSize: 14, padding: "10px 12px", boxSizing: "border-box",
  fontFamily: "inherit",
};
const buttonStyle = (disabled) => ({
  background:    disabled ? COLORS.TEXT_DISABLED : COLORS.AQUA,
  color:         COLORS.TEXT_ON_ACCENT,
  border:        "none",
  borderRadius:  8,
  padding:       "10px 16px",
  fontSize:      14,
  fontWeight:    700,
  fontFamily:    "inherit",
  cursor:        disabled ? "not-allowed" : "pointer",
  width:         "100%",
});
const dropCardStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "baseline",
  background: COLORS.MOBILE_BG, borderRadius: 6, padding: "8px 10px",
  fontSize: 13, marginBottom: 6,
};
