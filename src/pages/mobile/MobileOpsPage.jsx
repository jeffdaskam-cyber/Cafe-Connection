/**
 * MobileOpsPage — mobile-friendly ops: Schedule Notes + Cash Drop.
 *
 * Schedule Notes are org-wide (single doc per week), using
 * subscribeScheduleNote / saveScheduleNote from firebase.js.
 *
 * Cash Drops are per-campus, using addCashDrop / subscribeRecentCashDrops.
 */

import { useState, useEffect } from "react";
import {
  subscribeScheduleNote,
  saveScheduleNote,
  addCashDrop,
  subscribeRecentCashDrops,
} from "../../firebase.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const CAMPUSES = ["Center Green", "Foothills", "Mesa Lab"];

function getCurrentMonday() {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export default function MobileOpsPage() {
  const [campus, setCampus] = useState("Center Green");

  return (
    <div style={{ padding: 16 }}>
      <h2 style={headingStyle}>Weekly Ops</h2>

      <select value={campus} onChange={(e) => setCampus(e.target.value)} style={selectStyle}>
        {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <ScheduleNotesSection />
      <CashDropSection campus={campus} />
    </div>
  );
}

// ── Schedule Notes (org-wide, per week) ───────────────────────────────────────

function ScheduleNotesSection() {
  const { user } = useAuth();
  const weekOf = getCurrentMonday();
  const [body,    setBody]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeScheduleNote(weekOf, (data) => {
      setBody(data?.body ?? "");
      setLoading(false);
    });
    return unsub;
  }, [weekOf]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await saveScheduleNote(weekOf, body, user.uid, user.email);
    } catch (err) {
      console.error("[MobileOpsPage] Save note error:", err);
    }
    setSaving(false);
  }

  return (
    <section style={sectionStyle}>
      <h3 style={subheadStyle}>Schedule Notes</h3>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Week of {weekOf}</p>
      {loading ? (
        <p style={mutedStyle}>Loading...</p>
      ) : (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add notes for this week..."
            rows={4}
            style={textareaStyle}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            style={buttonStyle(saving)}
          >
            {saving ? "Saving..." : "Save Notes"}
          </button>
        </>
      )}
    </section>
  );
}

// ── Cash Drop ─────────────────────────────────────────────────────────────────

function CashDropSection({ campus }) {
  const { user } = useAuth();
  const [amount,  setAmount]  = useState("");
  const [date,    setDate]    = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,   setNotes]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [recent,  setRecent]  = useState([]);
  const [loading, setLoading] = useState(true);

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
    setSaving(true);
    try {
      await addCashDrop({
        campus,
        amount: num,
        date,
        notes,
        uid:   user.uid,
        email: user.email,
      });
      setAmount("");
      setNotes("");
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
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={inputStyle}
            />
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
              <p style={{ fontSize: 11, fontWeight: 600, color: "#00357A", marginBottom: 6 }}>
                Recent Drops
              </p>
              {recent.slice(0, 5).map((d) => (
                <div key={d.id} style={dropCardStyle}>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(d.amount)}</span>
                  <span style={{ color: "#888", fontSize: 12 }}>
                    {d.date || fmtDate(d.created_at)}
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

const headingStyle  = { fontSize: 16, fontWeight: 700, color: "#00357A", marginBottom: 12 };
const subheadStyle  = { fontSize: 14, fontWeight: 700, color: "#00357A", marginBottom: 8 };
const mutedStyle    = { color: "#888", fontSize: 13 };
const selectStyle   = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid #00A2B4", fontSize: 14, background: "#fff", marginBottom: 16,
};
const sectionStyle  = {
  background: "#fff", borderRadius: 10, padding: 16,
  marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
};
const textareaStyle = {
  width: "100%", borderRadius: 8, border: "1px solid #ccc",
  fontSize: 14, padding: "10px 12px", boxSizing: "border-box",
  resize: "vertical", marginBottom: 8, fontFamily: "inherit",
};
const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid #ccc",
  fontSize: 14, padding: "10px 12px", boxSizing: "border-box",
  fontFamily: "inherit",
};
const buttonStyle = (disabled) => ({
  background:    disabled ? "#ccc" : "#00A2B4",
  color:         "#fff",
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
  background: "#F1F0EE", borderRadius: 6, padding: "8px 10px",
  fontSize: 13, marginBottom: 6,
};
