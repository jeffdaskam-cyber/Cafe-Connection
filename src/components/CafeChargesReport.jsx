/**
 * CafeChargesReport — itemized charge summary for a selected date range.
 *
 * Queries daily_metrics for one or all campuses over a user-defined date range.
 * Aggregates totals (preferring period docs over daily sums) and generates
 * a formatted email + printable table.
 */

import { useState } from "react";
import { getCafeChargesData } from "../firebase.js";
import { useRole } from "../hooks/useRole.js";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR } from "./CampusSelector.jsx";
import { COLORS } from "../theme.js";

const CAMPUSES     = ["Mesa Lab", "Foothills", "Center Green"];
const ALL_CAMPUSES = "All Campuses";
const CAMPUS_LIST  = [ALL_CAMPUSES, ...CAMPUSES];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  if (n == null) return "N/A";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateRange(start, end) {
  const s = new Date(start + "T12:00:00").toLocaleDateString("en-US",
    { month: "long", day: "numeric", year: "numeric" });
  const e = new Date(end   + "T12:00:00").toLocaleDateString("en-US",
    { month: "long", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

// Aggregate docs for a single campus: prefer period doc, else sum dailies.
function aggregateCampus(docs) {
  if (!docs || docs.length === 0) return { net_revenue: null, total_taxes: null, cash_drop: null, total_checks: null, source: "none" };

  const periodDoc = docs.find(d => d.report_type === "period");
  if (periodDoc) {
    return {
      net_revenue:  periodDoc.net_revenue  ?? null,
      total_taxes:  periodDoc.total_taxes  ?? null,
      cash_drop:    periodDoc.cash_drop    ?? null,
      total_checks: periodDoc.total_checks ?? null,
      source:       "period",
      docs,
    };
  }

  const sum = docs.reduce((acc, d) => ({
    net_revenue:  (acc.net_revenue  ?? 0) + (d.net_revenue  ?? 0),
    total_taxes:  (acc.total_taxes  ?? 0) + (d.total_taxes  ?? 0),
    cash_drop:    (acc.cash_drop    ?? 0) + (d.cash_drop    ?? 0),
    total_checks: (acc.total_checks ?? 0) + (d.total_checks ?? 0),
  }), {});

  return {
    net_revenue:  docs.length > 0 ? Math.round((sum.net_revenue  ?? 0) * 100) / 100 : null,
    total_taxes:  docs.length > 0 ? Math.round((sum.total_taxes  ?? 0) * 100) / 100 : null,
    cash_drop:    docs.length > 0 ? Math.round((sum.cash_drop    ?? 0) * 100) / 100 : null,
    total_checks: docs.length > 0 ? Math.round(sum.total_checks ?? 0)               : null,
    source:       "daily",
    docs,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CafeChargesReport() {
  const { isManager } = useRole();
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultEnd   = now.toISOString().slice(0, 10);

  const [campus,     setCampus]     = useState(ALL_CAMPUSES);
  const [startDate,  setStartDate]  = useState(defaultStart);
  const [endDate,    setEndDate]    = useState(defaultEnd);
  const [status,     setStatus]     = useState("idle"); // idle | loading | done | error
  const [reportData, setReportData] = useState(null);   // { campusName: { docs, totals } }
  const [copied,     setCopied]     = useState(false);
  const [expanded,   setExpanded]   = useState(null);   // campus name with table open

  async function handleGenerate() {
    if (!startDate || !endDate) return;
    setStatus("loading"); setCopied(false); setReportData(null);
    try {
      const raw = await getCafeChargesData(campus, startDate, endDate);
      const processed = {};
      Object.entries(raw).forEach(([c, docs]) => {
        processed[c] = aggregateCampus(docs);
      });
      setReportData(processed);
      setStatus("done");
    } catch (err) {
      console.error("[CafeChargesReport] Fetch failed:", err);
      setStatus("error");
    }
  }

  function handleReset() {
    setStatus("idle");
    setReportData(null);
    setCopied(false);
    setExpanded(null);
  }

  function buildEmailText() {
    if (!reportData) return "";
    const targets = campus === ALL_CAMPUSES ? CAMPUSES : [campus];
    const lines = [
      "Good morning,",
      `Cafe charge summary for ${fmtDateRange(startDate, endDate)}:`,
      "",
    ];
    targets.forEach(c => {
      const d = reportData[c];
      lines.push(c === "Foothills" ? "Foothills Cafe" : c);
      lines.push(`  Net Revenue:    ${fmtMoney(d?.net_revenue)}`);
      if (d?.total_taxes  != null) lines.push(`  Total Taxes:    ${fmtMoney(d.total_taxes)}`);
      if (d?.cash_drop    != null) lines.push(`  Cash Drops:     ${fmtMoney(d.cash_drop)}`);
      if (d?.total_checks != null) lines.push(`  Total Checks:   ${d.total_checks}`);
      lines.push("");
    });
    lines.push("Please let me know if you have any questions.");
    lines.push(""); lines.push("Sincerely,");
    return lines.join("\n");
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildEmailText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const targets = campus === ALL_CAMPUSES ? CAMPUSES : [campus];

  const inputStyle = {
    background: COLORS.BG_SURFACE_ALT,
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: 8, color: COLORS.TEXT_PRIMARY,
    fontFamily: "'Poppins',sans-serif",
    fontWeight: 600, fontSize: 12,
    padding: "9px 12px", outline: "none",
  };

  return (
    <Widget
      title="Cafe Charges"
      subtitle="Itemized charge summary"
      icon="💳"
      accentColor={COLORS.AQUA}
      loading={status === "loading"}
      error={status === "error" ? "Could not fetch data. Check your Firestore connection." : null}
      onRetry={handleReset}
    >
      <div style={{ paddingTop: 4 }}>

        {/* ── Filters ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {/* Campus */}
          <div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
              letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 6,
              fontFamily: "'Poppins',sans-serif" }}>Campus</div>
            <select value={campus} onChange={e => { setCampus(e.target.value); handleReset(); }}
              style={{ ...inputStyle, width: "100%", cursor: "pointer" }}>
              {CAMPUS_LIST.map(c => (
                <option key={c} value={c} style={{ background: COLORS.BG_SURFACE }}>{c}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 6,
                fontFamily: "'Poppins',sans-serif" }}>From</div>
              <input type="date" value={startDate}
                onChange={e => { setStartDate(e.target.value); handleReset(); }}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 6,
                fontFamily: "'Poppins',sans-serif" }}>To</div>
              <input type="date" value={endDate}
                onChange={e => { setEndDate(e.target.value); handleReset(); }}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
        </div>

        {/* ── Generate button — manager+ only ── */}
        {status === "idle" && isManager && (
          <button onClick={handleGenerate}
            style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
              background: COLORS.AQUA, color: COLORS.TEXT_ON_ACCENT, fontFamily: "'Poppins',sans-serif",
              fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Generate Report
          </button>
        )}

        {/* ── Results ── */}
        {status === "done" && reportData && (
          <div>
            {/* Summary cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {targets.map(c => {
                const d   = reportData[c];
                const cc  = CAMPUS_COLOR[c] ?? COLORS.AQUA;
                const src = d?.source;
                return (
                  <div key={c} style={{
                    background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: 10, padding: "12px 14px",
                    borderLeft: `3px solid ${cc}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center",
                      justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: cc,
                        fontFamily: "'Poppins',sans-serif" }}>
                        {c === "Foothills" ? "Foothills Cafe" : c}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Data source badge */}
                        <div style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px",
                          borderRadius: 20, fontFamily: "'Poppins',sans-serif",
                          background: src && src !== "none" ? `${cc}18` : `${COLORS.ORANGE}18`,
                          border: `1px solid ${src && src !== "none" ? cc + "44" : COLORS.ORANGE + "44"}`,
                          color: src && src !== "none" ? cc : COLORS.ORANGE,
                          letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {src === "period" ? "period" : src === "daily" ? "summed daily" : "no data"}
                        </div>
                        {/* Detail toggle */}
                        {d?.docs?.length > 0 && (
                          <button onClick={() => setExpanded(expanded === c ? null : c)}
                            style={{ background: "transparent", border: `1px solid ${COLORS.BORDER}`,
                              borderRadius: 5, padding: "2px 8px", cursor: "pointer",
                              fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                              fontSize: 9, color: COLORS.TEXT_MUTED, letterSpacing: "0.04em",
                              textTransform: "uppercase" }}>
                            {expanded === c ? "▲ Hide" : "▼ Detail"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                      {[
                        ["Net Revenue",  d?.net_revenue],
                        ["Total Taxes",  d?.total_taxes],
                        ["Cash Drops",   d?.cash_drop],
                        ["Total Checks", d?.total_checks != null
                          ? d.total_checks.toLocaleString() : null],
                      ].map(([label, val]) => val != null && (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: COLORS.TEXT_MUTED, fontWeight: 600,
                            letterSpacing: "0.08em", textTransform: "uppercase",
                            fontFamily: "'Poppins',sans-serif" }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                            fontFamily: "'Poppins',sans-serif" }}>
                            {label === "Total Checks" ? val : fmtMoney(val)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Detail table */}
                    {expanded === c && d?.docs?.length > 0 && (
                      <div style={{ marginTop: 12, overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse",
                          fontSize: 10, fontFamily: "'Poppins',sans-serif" }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${COLORS.BORDER}` }}>
                              {["Date","Type","Net Rev","Taxes","Cash Drop","Checks"].map(h => (
                                <th key={h} style={{ padding: "5px 8px", textAlign: "right",
                                  color: COLORS.TEXT_MUTED, fontWeight: 600,
                                  ...(h === "Date" || h === "Type" ? { textAlign: "left" } : {}) }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {d.docs.map((row, i) => (
                              <tr key={i} style={{
                                borderBottom: `1px solid ${COLORS.BORDER}`,
                                background: i % 2 === 0 ? "transparent" : COLORS.BG_SURFACE_ALT,
                              }}>
                                <td style={{ padding: "5px 8px", color: COLORS.TEXT_SECONDARY, whiteSpace: "nowrap" }}>{fmtDate(row.date)}</td>
                                <td style={{ padding: "5px 8px" }}>
                                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20,
                                    background: row.report_type === "period" ? COLORS.AQUA_LIGHT : COLORS.BG_SURFACE_HOVER,
                                    color: row.report_type === "period" ? COLORS.AQUA : COLORS.TEXT_SECONDARY,
                                    fontWeight: 600 }}>
                                    {row.report_type || "daily"}
                                  </span>
                                </td>
                                <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.TEXT_PRIMARY, fontWeight: 600 }}>{fmtMoney(row.net_revenue)}</td>
                                <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.TEXT_SECONDARY }}>{fmtMoney(row.total_taxes)}</td>
                                <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.TEXT_SECONDARY }}>{fmtMoney(row.cash_drop)}</td>
                                <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.TEXT_SECONDARY }}>{row.total_checks ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Email preview */}
            <textarea readOnly value={buildEmailText()}
              style={{ width: "100%", background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 10, color: COLORS.TEXT_PRIMARY, fontFamily: "'Courier New', monospace",
                fontSize: 11, lineHeight: 1.7, padding: "12px 14px",
                resize: "none", outline: "none", boxSizing: "border-box",
                height: 180, marginBottom: 10 }} />

            {/* Copy + Reset */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCopy}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8,
                  background: copied ? COLORS.AQUA_LIGHT : COLORS.AQUA,
                  border: copied ? `1px solid ${COLORS.AQUA_BORDER}` : "none",
                  color: copied ? COLORS.AQUA : COLORS.TEXT_ON_ACCENT,
                  fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  fontSize: 12, cursor: "pointer" }}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
              <button onClick={handleReset}
                style={{ padding: "10px 18px", borderRadius: 8,
                  border: `1px solid ${COLORS.BORDER}`, background: "transparent",
                  color: COLORS.TEXT_SECONDARY, fontFamily: "'Poppins',sans-serif",
                  fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                ← New
              </button>
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
}
