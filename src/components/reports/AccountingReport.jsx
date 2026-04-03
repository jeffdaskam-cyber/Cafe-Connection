/**
 * AccountingReport — Monthly accounting summary for a single campus.
 *
 * Queries daily_metrics for the selected month + campus and sums the five
 * fields accounting needs: Net Revenue, Total Tax, Payroll, Credit Card,
 * and Cash Deposit (cash_drop).
 *
 * Supports a print flow via a portal-rendered container outside #root so
 * @media print can hide the app shell and show only the table.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { fetchAccountingData } from "../../firebase.js";
import { useRole } from "../../hooks/useRole.js";
import Widget from "../Widget.jsx";
import { COLORS, RADIUS } from "../../theme.js";

const CAMPUSES    = ["Mesa Lab", "Foothills", "Center Green"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

function prevMonth() {
  const d = new Date();
  const m = d.getMonth(); // 0-indexed
  return {
    month: m === 0 ? 12 : m,
    year:  m === 0 ? d.getFullYear() - 1 : d.getFullYear(),
  };
}

function fmtMoney(n) {
  if (n == null) return "N/A";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Print table (rendered both in-widget and in print portal) ────────────────
function AccountingTable({ campus, month, year, data }) {
  const monthName = MONTH_NAMES[month - 1];
  const rows = [
    ["Net Revenue",  data.netRevenue],
    ["Total Tax",    data.totalTax],
    ["Payroll",      data.payroll],
    ["Credit Card",  data.creditCard],
    ["Cash Deposit", data.cashDeposit],
  ];

  return (
    <div className="accounting-report-table">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
          fontFamily: "'Poppins',sans-serif" }}>{campus}</div>
        <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY,
          fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>
          Monthly Accounting Report — {monthName} {year}
        </div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 360 }}>
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label} style={{ borderBottom: `1px solid ${COLORS.BORDER}` }}>
              <td style={{ padding: "8px 16px 8px 0", fontWeight: 600, fontSize: 13,
                color: COLORS.TEXT_PRIMARY, fontFamily: "'Poppins',sans-serif" }}>
                {label}
              </td>
              <td style={{ padding: "8px 0", textAlign: "right", fontSize: 13,
                fontFamily: "'Courier New', monospace", color: COLORS.TEXT_PRIMARY }}>
                {fmtMoney(val)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.docCount === 0 && (
        <p style={{ color: COLORS.ERROR, marginTop: 12, fontSize: 12,
          fontFamily: "'Poppins',sans-serif" }}>
          No daily reports found for this campus and period.
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AccountingReport() {
  const { isManager } = useRole();
  const prev = prevMonth();

  const [campus,  setCampus]  = useState("Mesa Lab");
  const [month,   setMonth]   = useState(prev.month);
  const [year,    setYear]    = useState(prev.year);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const now        = new Date();
  const yearRange  = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  async function generate() {
    setLoading(true); setError(null); setData(null);
    try {
      const result = await fetchAccountingData(campus, year, month);
      setData(result);
    } catch (e) {
      console.error("[AccountingReport] fetch failed:", e);
      setError(e.message || "Could not fetch data.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setData(null);
    setError(null);
  }

  // Shared select style matching ReportsPage pattern
  const selectStyle = {
    background: COLORS.BG_SURFACE_ALT,
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: RADIUS.SM,
    color: COLORS.TEXT_PRIMARY,
    fontFamily: "'Poppins',sans-serif",
    fontWeight: 600,
    fontSize: 12,
    padding: "9px 12px",
    cursor: "pointer",
  };

  const labelStyle = {
    fontSize: 10,
    color: COLORS.TEXT_MUTED,
    fontWeight: 600,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    marginBottom: 8,
    fontFamily: "'Poppins',sans-serif",
  };

  // Print portal container (outside #root — hidden normally, visible @media print)
  const printPortal = data
    ? createPortal(
        <div id="accounting-report-print-container">
          <AccountingTable campus={campus} month={month} year={year} data={data} />
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {printPortal}
      <Widget
        title="Monthly Accounting Report"
        subtitle="Five-field accounting summary"
        icon="🧾"
        accentColor={COLORS.AQUA}
        loading={loading}
        error={error ? "Could not fetch data. Check your Firestore connection and try again." : null}
        onRetry={handleReset}
      >
        <div style={{ paddingTop: 4 }}>

          {/* ── Controls ── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 2 }}>
              <div style={labelStyle}>Campus</div>
              <select
                value={campus}
                onChange={e => { setCampus(e.target.value); handleReset(); }}
                style={{ ...selectStyle, width: "100%" }}
              >
                {CAMPUSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <div style={labelStyle}>Month</div>
              <select
                value={month}
                onChange={e => { setMonth(Number(e.target.value)); handleReset(); }}
                style={{ ...selectStyle, width: "100%" }}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Year</div>
              <select
                value={year}
                onChange={e => { setYear(Number(e.target.value)); handleReset(); }}
                style={{ ...selectStyle, width: "100%" }}
              >
                {yearRange.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* ── Generate button — manager+ only ── */}
          {!data && !loading && isManager && (
            <button
              onClick={generate}
              style={{ width: "100%", padding: "11px 0", borderRadius: RADIUS.SM,
                border: "none", background: COLORS.AQUA, color: COLORS.TEXT_ON_ACCENT,
                fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13,
                cursor: "pointer" }}
            >
              Generate {MONTH_NAMES[month - 1]} {year} Report
            </button>
          )}

          {/* ── Results ── */}
          {data && (
            <div>
              {/* Print + Reset actions */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <button
                  onClick={() => window.print()}
                  style={{ flex: 1, padding: "10px 0", borderRadius: RADIUS.SM,
                    border: "none", background: COLORS.AQUA, color: COLORS.TEXT_ON_ACCENT,
                    fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                    fontSize: 12, cursor: "pointer" }}
                >
                  Print
                </button>
                <button
                  onClick={handleReset}
                  style={{ padding: "10px 18px", borderRadius: RADIUS.SM,
                    border: `1px solid ${COLORS.BORDER}`, background: "transparent",
                    color: COLORS.TEXT_SECONDARY, fontFamily: "'Poppins',sans-serif",
                    fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                >
                  ← New Report
                </button>
              </div>

              <AccountingTable campus={campus} month={month} year={year} data={data} />
            </div>
          )}
        </div>
      </Widget>
    </>
  );
}
