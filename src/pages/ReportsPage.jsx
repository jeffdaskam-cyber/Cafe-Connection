/**
 * ReportsPage — report generation engine.
 *
 * Phase 5: Month-End Report activated.
 * Phase 7: Full report engine — all four reports live.
 *
 * Live reports:
 *   - Month-End Report    ✅  accounting email generator
 *   - Cafe Charges        ✅  itemized charge summary by date range + campus
 *   - Set-Up Report       ✅  event setup sheet builder + history
 *   - Event Report        ✅  post-event attendance / revenue log
 */

import { useState } from "react";
import { getMonthEndData } from "../firebase.js";
import Widget            from "../components/Widget.jsx";
import CafeChargesReport from "../components/CafeChargesReport.jsx";
import SetUpReport       from "../components/SetUpReport.jsx";
import EventReport       from "../components/EventReport.jsx";

// ── Brand palette ──────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const AQUA     = "#00A2B4";
const ORANGE   = "#FAA119";

const CAMPUSES     = ["Mesa Lab", "Foothills", "Center Green"];
const CAMPUS_COLOR = { "Mesa Lab": "#00A2B4", "Foothills": "#34E1F4", "Center Green": "#00818F" };
const MONTH_NAMES  = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];

function fmtMoney(n) {
  if (n == null) return "N/A";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Month-End Report ───────────────────────────────────────────────────────────
function MonthEndReport() {
  const now = new Date();
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [year,       setYear]       = useState(now.getFullYear());
  const [status,     setStatus]     = useState("idle");
  const [reportData, setReportData] = useState(null);
  const [copied,     setCopied]     = useState(false);

  const monthName = MONTH_NAMES[month - 1];
  const years     = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  async function handleGenerate() {
    setStatus("loading"); setCopied(false); setReportData(null);
    try {
      const data = await getMonthEndData(year, month);
      setReportData(data);
      setStatus("done");
    } catch (err) {
      console.error("[ReportsPage] Month-end fetch failed:", err);
      setStatus("error");
    }
  }

  function handleReset() {
    setStatus("idle");
    setReportData(null);
    setCopied(false);
  }

  function buildEmailText() {
    if (!reportData) return "";
    const lines = [
      "Good morning,",
      `The month-end information for each cafe is listed below for ${monthName} ${year}:`,
      "",
    ];
    CAMPUSES.forEach(c => {
      const d = reportData[c];
      lines.push(c === "Foothills" ? "Foothills Cafe" : c);
      lines.push(`Total Taxes: ${fmtMoney(d?.total_taxes)}`);
      lines.push(`Total Cash Drop: ${fmtMoney(d?.cash_drop)}`);
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

  return (
    <Widget
      title="Month-End Report"
      subtitle="Accounting email generator"
      icon="📋"
      accentColor={AQUA}
      loading={status === "loading"}
      error={status === "error" ? "Could not fetch data. Check your Firestore connection and try again." : null}
      onRetry={handleReset}
    >
      <div style={{ paddingTop: 4 }}>
        {/* Month + Year selectors */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 10, color: TSEC, fontWeight: 600,
              letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>Month</div>
            <select
              value={month}
              onChange={e => { setMonth(Number(e.target.value)); handleReset(); }}
              style={{ width: "100%", background: `${SPACE}cc`, border: `1px solid ${BORDER}`,
                borderRadius: 8, color: TPRI, fontFamily: "'Poppins',sans-serif",
                fontWeight: 600, fontSize: 12, padding: "9px 12px", cursor: "pointer" }}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1} style={{ background: DARKBLUE }}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: TSEC, fontWeight: 600,
              letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>Year</div>
            <select
              value={year}
              onChange={e => { setYear(Number(e.target.value)); handleReset(); }}
              style={{ width: "100%", background: `${SPACE}cc`, border: `1px solid ${BORDER}`,
                borderRadius: 8, color: TPRI, fontFamily: "'Poppins',sans-serif",
                fontWeight: 600, fontSize: 12, padding: "9px 12px", cursor: "pointer" }}>
              {years.map(y => (
                <option key={y} value={y} style={{ background: DARKBLUE }}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Generate button */}
        {status === "idle" && (
          <button onClick={handleGenerate}
            style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
              background: AQUA, color: SPACE, fontFamily: "'Poppins',sans-serif",
              fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Generate {monthName} {year} Report
          </button>
        )}

        {/* Results */}
        {status === "done" && reportData && (
          <div>
            {/* Data source badges */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {CAMPUSES.map(c => {
                const src     = reportData[c]?.source;
                const hasData = src && src !== "none";
                const cc      = CAMPUS_COLOR[c];
                return (
                  <div key={c} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px",
                    borderRadius: 20, fontFamily: "'Poppins',sans-serif",
                    background: hasData ? `${cc}22` : `${ORANGE}22`,
                    border: `1px solid ${hasData ? cc : ORANGE}55`,
                    color: hasData ? cc : ORANGE,
                    letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {c} · {src === "period" ? "period report" : src === "daily" ? "summed daily" : "no data"}
                  </div>
                );
              })}
            </div>

            {/* Email text preview */}
            <textarea readOnly value={buildEmailText()}
              style={{ width: "100%", background: `${SPACE}cc`, border: `1px solid ${BORDER}`,
                borderRadius: 10, color: TPRI, fontFamily: "'Courier New', monospace",
                fontSize: 12, lineHeight: 1.7, padding: "14px 16px",
                resize: "none", outline: "none", boxSizing: "border-box",
                height: 260, marginBottom: 12 }} />

            {/* Copy + reset */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCopy}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8,
                  background: copied ? `${AQUA}33` : AQUA,
                  border: copied ? `1px solid ${AQUA}` : "none",
                  color: copied ? AQUA : SPACE,
                  fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  fontSize: 12, cursor: "pointer" }}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
              <button onClick={handleReset}
                style={{ padding: "10px 18px", borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: "transparent",
                  color: TSEC, fontFamily: "'Poppins',sans-serif",
                  fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                ← New Report
              </button>
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
}

// ── Reports Page ───────────────────────────────────────────────────────────────
export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TPRI, marginBottom: 6,
          fontFamily: "'Poppins',sans-serif" }}>Reports</div>
        <div style={{ fontSize: 12, color: TSEC, fontWeight: 500,
          maxWidth: 560, lineHeight: 1.6, fontFamily: "'Poppins',sans-serif" }}>
          Generate, copy, and print operational reports. All four report types are live.
        </div>
      </div>

      {/* ── Accounting reports ── */}
      <div style={{ fontSize: 10, color: TSEC, fontWeight: 600, letterSpacing: "1.5px",
        textTransform: "uppercase", marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>
        Accounting
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
        marginBottom: 32, animation: "ucar-fadein .5s ease both" }}>
        <MonthEndReport />
        <CafeChargesReport />
      </div>

      {/* ── Operations reports ── */}
      <div style={{ fontSize: 10, color: TSEC, fontWeight: 600, letterSpacing: "1.5px",
        textTransform: "uppercase", marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>
        Operations
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
        marginBottom: 40, animation: "ucar-fadein .6s ease both" }}>
        <SetUpReport />
        <EventReport />
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: `${TSEC}88`,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
        fontFamily: "'Poppins',sans-serif" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
