import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { uploadReport, parseReport, subscribeToCampus, subscribeAllReports, getMonthEndData } from "./firebase.js";

// ── Period helpers ────────────────────────────────────────────────────────────
function getMonthKey(date) {
  const d = date?.toDate ? date.toDate() : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
const FISCAL_MONTH_ORDER = [9,10,11,0,1,2,3,4,5,6,7,8];
function sortByFiscalMonth(a, b) {
  const [ay, am] = a.monthKey.split("-").map(Number);
  const [by, bm] = b.monthKey.split("-").map(Number);
  const aFY = (am-1) >= 9 ? ay : ay-1;
  const bFY = (bm-1) >= 9 ? by : by-1;
  if (aFY !== bFY) return aFY - bFY;
  return FISCAL_MONTH_ORDER.indexOf((am-1+12)%12) - FISCAL_MONTH_ORDER.indexOf((bm-1+12)%12);
}
function buildMonthlyData(docs) {
  const byMonth = {};
  docs.filter(d => d.report_type === "period").forEach(d => {
    const key = getMonthKey(d.date);
    byMonth[key] = { monthKey: key, label: getMonthLabel(key),
      net_revenue: d.net_revenue||0, total_checks: d.total_checks||0,
      lunch_checks: d.lunch_checks||0, source: "period" };
  });
  docs.filter(d => d.report_type === "daily" || !d.report_type).forEach(d => {
    const key = getMonthKey(d.date);
    if (byMonth[key]?.source === "period") return;
    if (!byMonth[key]) byMonth[key] = { monthKey: key, label: getMonthLabel(key),
      net_revenue: 0, total_checks: 0, lunch_checks: 0, source: "daily" };
    byMonth[key].net_revenue  += d.net_revenue  || 0;
    byMonth[key].total_checks += d.total_checks || 0;
    byMonth[key].lunch_checks += d.lunch_checks || 0;
  });
  return Object.values(byMonth).sort(sortByFiscalMonth);
}
function buildAnnualData(monthlyData) {
  const byFY = {};
  monthlyData.forEach(m => {
    const [year, month] = m.monthKey.split("-").map(Number);
    const fy = month >= 10 ? year : year - 1;
    const label = `FY${fy}\u2013${String(fy+1).slice(2)}`;
    if (!byFY[fy]) byFY[fy] = { fy, label, net_revenue: 0, total_checks: 0, lunch_checks: 0 };
    byFY[fy].net_revenue  += m.net_revenue;
    byFY[fy].total_checks += m.total_checks;
    byFY[fy].lunch_checks += m.lunch_checks;
  });
  return Object.values(byFY).sort((a, b) => a.fy - b.fy);
}

// ── Brand Palette ─────────────────────────────────────────────────────────────
const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
const CAMPUS_COLOR = { "Mesa Lab": "#00A2B4", Foothills: "#34E1F4", "Center Green": "#00818F" };
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const PANEL    = "#001f4d";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const TMID     = "#b0d0e8";
const AQUA     = "#00A2B4";
const LAQUA    = "#34E1F4";
const ORANGE   = "#FAA119";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function fmt(d) {
  if (!d) return "";
  const dt = d.toDate ? d.toDate() : new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function fmtMoney(n) {
  if (n === null || n === undefined) return "N/A";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Wave SVG ──────────────────────────────────────────────────────────────────
function WaveGraphic({ color = AQUA, opacity = 0.18, width = 420, height = 80 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
      {[0, 14, 28, 42].map((offset, i) => (
        <path key={i}
          d={`M0,${30+offset} C80,${10+offset} 160,${50+offset} 240,${28+offset} S380,${8+offset} ${width},${30+offset}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={opacity - i * 0.02} />
      ))}
    </svg>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, delta, accentColor }) {
  const pos = delta >= 0;
  return (
    <div style={{ flex:1, background:PANEL, borderRadius:14, padding:"20px 22px",
      border:`1px solid ${BORDER}`, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
        background:`linear-gradient(90deg, ${accentColor}, transparent)`,
        borderRadius:"14px 14px 0 0" }} />
      <div style={{ color:TSEC, fontSize:10, fontFamily:"'Poppins',sans-serif",
        fontWeight:600, textTransform:"uppercase", letterSpacing:"1.2px" }}>{label}</div>
      <div style={{ color:TPRI, fontSize:28, fontWeight:700, margin:"8px 0 6px",
        fontFamily:"'Poppins',sans-serif", letterSpacing:"-0.5px" }}>{value}</div>
      <div style={{ fontSize:11, fontFamily:"'Poppins',sans-serif", fontWeight:500,
        color: pos ? AQUA : ORANGE }}>
        {pos ? "▲" : "▼"} {Math.abs(delta)}% vs last period
      </div>
      <div style={{ position:"absolute", bottom:0, right:0, opacity:0.07 }}>
        <WaveGraphic color={accentColor} opacity={1} width={180} height={50} />
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:DARKBLUE, border:`1px solid ${AQUA}44`, borderRadius:10,
      padding:"10px 14px", fontSize:12, fontFamily:"'Poppins',sans-serif",
      boxShadow:`0 4px 20px ${AQUA}22` }}>
      <div style={{ color:TMID, marginBottom:6, fontSize:11 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color:p.color, fontWeight:600 }}>
          {p.name}: {p.dataKey === "cafe_sales" ? `$${Number(p.value).toLocaleString()}` : p.value}
        </div>
      ))}
    </div>
  );
};

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ onUpload, uploadState }) {
  const isProcessing = uploadState.status === "UPLOADING" || uploadState.status === "PROCESSING";
  const onDrop = useCallback((files) => files[0] && onUpload(files[0]), [onUpload]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [],
    },
    multiple: false,
  });

  const icon = isProcessing ? "⏳"
    : uploadState.status === "SUCCESS" ? "✓"
    : uploadState.status === "ERROR"   ? "✕" : "↑";

  const successMsg = uploadState.campus ? `Filed to ${uploadState.campus}. Drop another.` : "Uploaded! Drop another.";
  const sub = isProcessing
    ? (uploadState.status === "UPLOADING" ? "Uploading…" : "Analyzing report data…")
    : uploadState.status === "SUCCESS" ? successMsg
    : uploadState.status === "ERROR"   ? (uploadState.errorMsg || "Error — try again")
    : isDragActive ? "Release to upload"
    : "Drop any campus report — location detected automatically";

  const accentColor = (uploadState.status === "SUCCESS" && uploadState.campus)
    ? CAMPUS_COLOR[uploadState.campus] : AQUA;

  return (
    <div {...getRootProps()} style={{ border:`1.5px dashed ${isDragActive ? accentColor : BORDER}`,
      borderRadius:12, padding:"32px 24px", cursor:"pointer",
      background: isDragActive ? `${accentColor}18` : `${SPACE}cc`,
      transition:"all 0.25s", textAlign:"center", position:"relative", overflow:"hidden" }}>
      <input {...getInputProps()} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
        background:accentColor, borderRadius:"12px 12px 0 0" }} />
      <div style={{ width:44, height:44, borderRadius:"50%",
        background:`${accentColor}22`, border:`1px solid ${accentColor}55`,
        display:"flex", alignItems:"center", justifyContent:"center",
        margin:"0 auto 12px", fontSize:20, color:accentColor, fontWeight:700 }}>{icon}</div>
      <div style={{ color:TPRI, fontSize:13, fontFamily:"'Poppins',sans-serif",
        fontWeight:600, marginBottom:6 }}>Upload Report</div>
      <div style={{ color:TMID, fontSize:11, fontFamily:"'Poppins',sans-serif", fontWeight:500 }}>{sub}</div>
      {uploadState.status === "SUCCESS" && uploadState.campus && (
        <div style={{ display:"inline-block", marginTop:12, padding:"4px 14px", borderRadius:20,
          background:`${CAMPUS_COLOR[uploadState.campus]}22`,
          border:`1px solid ${CAMPUS_COLOR[uploadState.campus]}55`,
          color:CAMPUS_COLOR[uploadState.campus],
          fontSize:11, fontWeight:700, fontFamily:"'Poppins',sans-serif",
          letterSpacing:"0.04em", textTransform:"uppercase" }}>
          {uploadState.campus}
        </div>
      )}
      {isProcessing && (
        <div style={{ marginTop:14, height:2, background:BORDER, borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", width:"55%", background:accentColor,
            borderRadius:4, animation:"ucar-slide 1.4s ease-in-out infinite alternate" }} />
        </div>
      )}
    </div>
  );
}

// ── Month-End Report Modal ────────────────────────────────────────────────────
function MonthEndModal({ onClose }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [reportData, setReportData] = useState(null);
  const [copied, setCopied] = useState(false);

  const monthName = MONTH_NAMES[month - 1];

  // Available years: current year and 2 prior
  const years = [now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2];

  async function handleGenerate() {
    setStatus("loading");
    setCopied(false);
    try {
      const data = await getMonthEndData(year, month);
      setReportData(data);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  function buildEmailText() {
    if (!reportData) return "";
    const campusLabels = {
      "Mesa Lab":     "Mesa Lab",
      "Foothills":    "Foothills Cafe",
      "Center Green": "Center Green",
    };
    const lines = [
      "Good morning,",
      `The month-end information for each cafe is listed below:`,
      "",
    ];
    CAMPUSES.forEach(c => {
      const d = reportData[c];
      lines.push(campusLabels[c]);
      lines.push(`Total Taxes: ${fmtMoney(d?.total_taxes)}`);
      lines.push(`Total Cash Drop: ${fmtMoney(d?.cash_drop)}`);
      lines.push("");
    });
    lines.push("Please let me know if you have any questions.");
    lines.push("");
    lines.push("Sincerely,");
    return lines.join("\n");
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildEmailText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const emailText = buildEmailText();

  return (
    // Backdrop
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(1,14,33,0.82)",
      zIndex:100, display:"flex", alignItems:"center", justifyContent:"center",
      backdropFilter:"blur(6px)" }}>
      {/* Modal panel */}
      <div onClick={e => e.stopPropagation()} style={{ background:PANEL,
        border:`1px solid ${BORDER}`, borderRadius:18, padding:"32px 36px",
        width:"100%", maxWidth:540, position:"relative", overflow:"hidden",
        boxShadow:`0 24px 64px rgba(0,0,0,0.5)` }}>

        {/* top accent */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
          background:`linear-gradient(90deg, ${AQUA}, ${LAQUA}, transparent)`,
          borderRadius:"18px 18px 0 0" }} />

        <div style={{ position:"absolute", bottom:0, right:0, opacity:0.05 }}>
          <WaveGraphic color={AQUA} opacity={1} width={400} height={100} />
        </div>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:TPRI, fontFamily:"'Poppins',sans-serif" }}>
              Month-End Report
            </div>
            <div style={{ fontSize:10, color:TSEC, fontWeight:500, letterSpacing:"0.08em",
              textTransform:"uppercase", marginTop:2 }}>
              Accounting email generator
            </div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:TSEC, fontSize:20, cursor:"pointer", lineHeight:1, padding:4 }}>✕</button>
        </div>

        {/* Month / Year selectors */}
        <div style={{ display:"flex", gap:12, marginBottom:24 }}>
          <div style={{ flex:2 }}>
            <div style={{ fontSize:10, color:TSEC, fontWeight:600, letterSpacing:"1.2px",
              textTransform:"uppercase", marginBottom:8 }}>Month</div>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              style={{ width:"100%", background:`${SPACE}cc`, border:`1px solid ${BORDER}`,
                borderRadius:8, color:TPRI, fontFamily:"'Poppins',sans-serif",
                fontWeight:600, fontSize:12, padding:"9px 12px", cursor:"pointer" }}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i+1} style={{ background:DARKBLUE }}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:TSEC, fontWeight:600, letterSpacing:"1.2px",
              textTransform:"uppercase", marginBottom:8 }}>Year</div>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ width:"100%", background:`${SPACE}cc`, border:`1px solid ${BORDER}`,
                borderRadius:8, color:TPRI, fontFamily:"'Poppins',sans-serif",
                fontWeight:600, fontSize:12, padding:"9px 12px", cursor:"pointer" }}>
              {years.map(y => (
                <option key={y} value={y} style={{ background:DARKBLUE }}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Generate button */}
        {status !== "done" && (
          <button onClick={handleGenerate} disabled={status === "loading"}
            style={{ width:"100%", padding:"11px 0", borderRadius:8, border:"none",
              background: status === "loading" ? `${AQUA}88` : AQUA,
              color:SPACE, fontFamily:"'Poppins',sans-serif", fontWeight:700,
              fontSize:13, cursor: status === "loading" ? "default" : "pointer",
              transition:"all .2s", marginBottom: status === "error" ? 12 : 0 }}>
            {status === "loading" ? "Fetching data…" : `Generate ${monthName} ${year} Report`}
          </button>
        )}

        {status === "error" && (
          <div style={{ color:ORANGE, fontSize:12, fontFamily:"'Poppins',sans-serif",
            fontWeight:500, textAlign:"center" }}>
            Could not fetch data. Check your Firestore connection and try again.
          </div>
        )}

        {/* Email preview */}
        {status === "done" && (
          <div style={{ marginTop:0 }}>
            {/* Data source badges */}
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              {CAMPUSES.map(c => {
                const src = reportData[c]?.source;
                const hasData = src && src !== "none";
                const cc = CAMPUS_COLOR[c];
                return (
                  <div key={c} style={{ fontSize:10, fontWeight:600, fontFamily:"'Poppins',sans-serif",
                    padding:"3px 10px", borderRadius:20,
                    background: hasData ? `${cc}22` : `${ORANGE}22`,
                    border:`1px solid ${hasData ? cc : ORANGE}55`,
                    color: hasData ? cc : ORANGE,
                    letterSpacing:"0.04em", textTransform:"uppercase" }}>
                    {c} · {src === "period" ? "period report" : src === "daily" ? "summed daily" : "no data"}
                  </div>
                );
              })}
            </div>

            {/* Email text area */}
            <textarea readOnly value={emailText}
              style={{ width:"100%", background:`${SPACE}cc`, border:`1px solid ${BORDER}`,
                borderRadius:10, color:TPRI, fontFamily:"'Courier New', monospace",
                fontSize:12, lineHeight:1.7, padding:"14px 16px",
                resize:"none", outline:"none", boxSizing:"border-box",
                height:260, marginBottom:12 }} />

            {/* Action buttons */}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={handleCopy}
                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none",
                  background: copied ? `${AQUA}33` : AQUA,
                  border: copied ? `1px solid ${AQUA}` : "none",
                  color: copied ? AQUA : SPACE,
                  fontFamily:"'Poppins',sans-serif", fontWeight:700,
                  fontSize:12, cursor:"pointer", transition:"all .2s" }}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
              <button onClick={() => setStatus("idle")}
                style={{ padding:"10px 18px", borderRadius:8,
                  border:`1px solid ${BORDER}`, background:"transparent",
                  color:TSEC, fontFamily:"'Poppins',sans-serif",
                  fontWeight:600, fontSize:12, cursor:"pointer" }}>
                ← Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [campus, setCampus]   = useState("Mesa Lab");
  const [period, setPeriod]   = useState("daily");
  const [metrics, setMetrics] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [uploadState, setUploadState] = useState({ status:"IDLE", campus:null, errorMsg:null });
  const [fiscalYear,  setFiscalYear]  = useState(null);
  const [showMonthEnd, setShowMonthEnd] = useState(false);

  useEffect(() => { const u = subscribeToCampus(campus, setMetrics);   return u; }, [campus]);
  useEffect(() => { const u = subscribeAllReports(campus, setAllDocs); return u; }, [campus]);

  const color        = CAMPUS_COLOR[campus];
  const monthlyData  = buildMonthlyData(allDocs);
  const annualData   = buildAnnualData(monthlyData);
  const fiscalYears  = annualData.map(d => d.label);

  useEffect(() => {
    if (fiscalYears.length > 0 && !fiscalYears.includes(fiscalYear)) {
      setFiscalYear(fiscalYears[fiscalYears.length - 1]);
    }
  }, [fiscalYears.join(",")]);

  function inFiscalYear(monthKey, fyLabel) {
    if (!fyLabel) return true;
    const [year, month] = monthKey.split("-").map(Number);
    const fy = month >= 10 ? year : year - 1;
    return `FY${fy}\u2013${String(fy+1).slice(2)}` === fyLabel;
  }

  const filteredMonthly = period === "monthly"
    ? monthlyData.filter(d => inFiscalYear(d.monthKey, fiscalYear)) : monthlyData;
  const filteredDaily   = period === "daily"
    ? metrics.filter(d => {
        if (!fiscalYear) return true;
        const dt = d.date?.toDate ? d.date.toDate() : new Date(d.date);
        const m = dt.getMonth() + 1, y = dt.getFullYear();
        const fy = m >= 10 ? y : y - 1;
        return `FY${fy}\u2013${String(fy+1).slice(2)}` === fiscalYear;
      }) : metrics;

  const chartData =
    period === "daily"   ? filteredDaily.map(d => ({ date:fmt(d.date), cafe_sales:d.net_revenue||0, cafe_volume:d.total_checks||0, event_volume:d.lunch_checks||0 })) :
    period === "monthly" ? filteredMonthly.map(d => ({ date:d.label, cafe_sales:d.net_revenue, cafe_volume:d.total_checks, event_volume:d.lunch_checks })) :
                           annualData.map(d => ({ date:d.label, cafe_sales:d.net_revenue, cafe_volume:d.total_checks, event_volume:d.lunch_checks }));

  const statSource  = period === "daily" ? filteredDaily : period === "monthly" ? filteredMonthly : annualData;
  const totalSales  = statSource.reduce((s, d) => s + (d.net_revenue  || 0), 0);
  const avgVolume   = statSource.length ? Math.round(statSource.reduce((s, d) => s + (d.total_checks || 0), 0) / statSource.length) : 0;
  const totalEvents = statSource.reduce((s, d) => s + (d.lunch_checks || 0), 0);
  const isProcessing = uploadState.status === "UPLOADING" || uploadState.status === "PROCESSING";

  const handleUpload = useCallback(async (file) => {
    setUploadState({ status:"UPLOADING", campus:null, errorMsg:null });
    try {
      const url    = await uploadReport("unknown", file, () => {});
      setUploadState({ status:"PROCESSING", campus:null, errorMsg:null });
      const result = await parseReport(url, "unknown", file.name);
      setUploadState({ status:"SUCCESS", campus:result?.campus || null, errorMsg:null });
    } catch (err) {
      console.error(err);
      setUploadState({ status:"ERROR", campus:null, errorMsg:err?.message || "Error — try again" });
    }
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${SPACE}; }
        @keyframes ucar-slide { from{transform:translateX(-120%)} to{transform:translateX(220%)} }
        @keyframes ucar-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ucar-fadein { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ucar-campus-btn { transition: all .22s ease; }
        .ucar-campus-btn:hover { filter: brightness(1.15); }
        .ucar-monthend-btn { transition: all .22s ease; }
        .ucar-monthend-btn:hover { background: ${AQUA}22 !important; color: ${AQUA} !important; }
      `}</style>

      {showMonthEnd && <MonthEndModal onClose={() => setShowMonthEnd(false)} />}

      <div style={{ minHeight:"100vh",
        background:`linear-gradient(160deg, ${SPACE} 0%, #001230 100%)`,
        color:TPRI, fontFamily:"'Poppins',sans-serif", paddingBottom:48 }}>

        {/* ── Header ── */}
        <div style={{ borderBottom:`1px solid ${BORDER}`, padding:"0 36px",
          background:`${SPACE}f0`, position:"sticky", top:0, zIndex:20,
          backdropFilter:"blur(12px)", display:"flex", alignItems:"center",
          justifyContent:"space-between", height:64, overflow:"hidden" }}>
          <div style={{ position:"absolute", right:200, top:0, opacity:0.25 }}>
            <WaveGraphic color={AQUA} opacity={0.6} width={500} height={64} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14, zIndex:1 }}>
            <div style={{ width:40, height:40, borderRadius:"50%",
              background:`linear-gradient(135deg, ${AQUA}, ${DARKBLUE})`,
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:`0 0 16px ${AQUA}44`, flexShrink:0 }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <ellipse cx="12" cy="12" rx="10" ry="10" stroke="white" strokeWidth="1.2" />
                <path d="M4 10 Q8 6 12 10 Q16 14 20 10" stroke="white" strokeWidth="1.4" fill="none" />
                <path d="M4 14 Q8 10 12 14 Q16 18 20 14" stroke="white" strokeWidth="1.4" fill="none" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:15, letterSpacing:"0.02em", color:TPRI }}>
                <span style={{ color:AQUA }}>UCAR</span> Cafe Connection
              </div>
              <div style={{ fontSize:10, color:TSEC, fontWeight:500,
                letterSpacing:"0.08em", textTransform:"uppercase" }}>
                Catering &amp; Cafe Information Hub
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, zIndex:1 }}>
            {/* Month-End Report button */}
            <button className="ucar-monthend-btn" onClick={() => setShowMonthEnd(true)}
              style={{ display:"flex", alignItems:"center", gap:7,
                background:"transparent", border:`1px solid ${BORDER}`,
                borderRadius:8, padding:"7px 16px", cursor:"pointer",
                fontFamily:"'Poppins',sans-serif", fontWeight:600,
                fontSize:11, color:TSEC, letterSpacing:"0.04em" }}>
              <span style={{ fontSize:14 }}>📋</span>
              Month-End Report
            </button>
            <div style={{ fontSize:11, color:TSEC, fontWeight:500, letterSpacing:"0.04em" }}>
              {new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}
            </div>
            {isProcessing && (
              <div style={{ display:"flex", alignItems:"center", gap:7,
                background:`${DARKBLUE}cc`, border:`1px solid ${AQUA}55`,
                padding:"5px 14px", borderRadius:20,
                fontSize:11, fontWeight:600, color:AQUA,
                animation:"ucar-pulse 1.6s ease-in-out infinite" }}>
                <div style={{ width:6, height:6, borderRadius:"50%",
                  background:ORANGE, boxShadow:`0 0 6px ${ORANGE}` }} />
                Processing report…
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth:1280, margin:"0 auto", padding:"32px 36px" }}>

          {/* ── Campus + FY + Period Selectors ── */}
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between",
            marginBottom:32, flexWrap:"wrap", gap:16 }}>

            <div>
              <div style={{ fontSize:10, color:TSEC, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:10 }}>Campus</div>
              <div style={{ display:"flex", gap:8 }}>
                {CAMPUSES.map(c => {
                  const active = c === campus, cc = CAMPUS_COLOR[c];
                  return (
                    <button key={c} className="ucar-campus-btn" onClick={() => setCampus(c)}
                      style={{ padding:"9px 24px", borderRadius:6,
                        border: active ? `1.5px solid ${cc}` : `1.5px solid ${BORDER}`,
                        cursor:"pointer", fontFamily:"'Poppins',sans-serif",
                        fontWeight:600, fontSize:12, letterSpacing:"0.03em",
                        background: active ? `${cc}22` : "transparent",
                        color: active ? cc : TSEC,
                        boxShadow: active ? `0 0 18px ${cc}33` : "none" }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {period !== "annual" && fiscalYears.length > 0 && (
              <div>
                <div style={{ fontSize:10, color:TSEC, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:10 }}>Fiscal Year</div>
                <select value={fiscalYear || ""} onChange={e => setFiscalYear(e.target.value)}
                  style={{ background:`${SPACE}cc`, border:`1px solid ${BORDER}`, borderRadius:8,
                    color:TPRI, fontFamily:"'Poppins',sans-serif", fontWeight:600, fontSize:12,
                    padding:"9px 32px 9px 14px", cursor:"pointer",
                    appearance:"none", WebkitAppearance:"none",
                    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237aaec8'/%3E%3C/svg%3E")`,
                    backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center" }}>
                  {fiscalYears.map(fy => <option key={fy} value={fy} style={{ background:DARKBLUE }}>{fy}</option>)}
                </select>
              </div>
            )}

            <div>
              <div style={{ fontSize:10, color:TSEC, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:10 }}>Period</div>
              <div style={{ display:"flex", background:`${SPACE}cc`, border:`1px solid ${BORDER}`, borderRadius:8, padding:3, gap:2 }}>
                {[["daily","Daily"],["monthly","Monthly"],["annual","Annual"]].map(([val, label]) => {
                  const active = period === val;
                  return (
                    <button key={val} onClick={() => setPeriod(val)}
                      style={{ padding:"7px 18px", borderRadius:6, border:"none", cursor:"pointer",
                        fontFamily:"'Poppins',sans-serif", fontWeight:600, fontSize:12,
                        letterSpacing:"0.03em", transition:"all .2s ease",
                        background: active ? AQUA : "transparent",
                        color: active ? SPACE : TSEC,
                        boxShadow: active ? `0 0 12px ${AQUA}55` : "none" }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div style={{ display:"flex", gap:18, marginBottom:28, animation:"ucar-fadein .5s ease both" }}>
            <StatCard
              label={period === "daily" ? "Net Revenue (30d)" : period === "monthly" ? "Net Revenue (Monthly)" : "Net Revenue (Annual)"}
              value={`$${(totalSales/1000).toFixed(1)}k`} delta={4.2} accentColor={AQUA} />
            <StatCard
              label={period === "daily" ? "Avg Daily Checks" : period === "monthly" ? "Avg Monthly Checks" : "Avg Annual Checks"}
              value={avgVolume || "—"} delta={-1.8} accentColor={LAQUA} />
            <StatCard
              label={period === "daily" ? "Avg Lunch Checks" : "Total Lunch Checks"}
              value={totalEvents || "—"} delta={11.3} accentColor={color} />
          </div>

          {/* ── Charts ── */}
          {chartData.length > 0 ? (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:28, animation:"ucar-fadein .6s ease both" }}>
              <div style={{ background:PANEL, borderRadius:16, padding:"24px 28px",
                border:`1px solid ${BORDER}`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", bottom:0, right:0, opacity:0.06 }}>
                  <WaveGraphic color={AQUA} opacity={1} width={340} height={90} />
                </div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Cafe Sales</div>
                <div style={{ fontSize:10, color:TSEC, fontWeight:500, marginBottom:20, letterSpacing:"0.04em", textTransform:"uppercase" }}>
                  {period === "daily" ? "Last 30 days" : period === "monthly" ? "By month · fiscal year order" : "By fiscal year"} · {campus}
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={chartData} barSize={7}>
                    <CartesianGrid strokeDasharray="3 3" stroke={`${BORDER}88`} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill:TSEC, fontSize:9, fontFamily:"'Poppins'" }}
                      tickLine={false} axisLine={false} interval={period === "daily" ? 4 : 0} />
                    <YAxis tick={{ fill:TSEC, fontSize:9, fontFamily:"'Poppins'" }}
                      tickLine={false} axisLine={false}
                      tickFormatter={v => `$${(v/1000).toFixed(1)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="cafe_sales" name="Cafe Sales" fill={AQUA} radius={[4,4,0,0]}
                      label={{ position:"top", formatter:v => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`,
                        fill:TSEC, fontSize:8, fontFamily:"'Poppins'" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background:PANEL, borderRadius:16, padding:"24px 28px",
                border:`1px solid ${BORDER}`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", bottom:0, right:0, opacity:0.06 }}>
                  <WaveGraphic color={LAQUA} opacity={1} width={340} height={90} />
                </div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Total Cafe Volume</div>
                <div style={{ fontSize:10, color:TSEC, fontWeight:500, marginBottom:20, letterSpacing:"0.04em", textTransform:"uppercase" }}>
                  Total checks · {campus}
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={`${BORDER}88`} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill:TSEC, fontSize:9, fontFamily:"'Poppins'" }}
                      tickLine={false} axisLine={false} interval={period === "daily" ? 4 : 0} />
                    <YAxis tick={{ fill:TSEC, fontSize:9, fontFamily:"'Poppins'" }}
                      tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="cafe_volume" name="Cafe Volume"
                      stroke={AQUA} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div style={{ background:PANEL, border:`1.5px dashed ${BORDER}`,
              borderRadius:16, padding:56, textAlign:"center", marginBottom:28,
              animation:"ucar-fadein .5s ease both" }}>
              <div style={{ width:56, height:56, borderRadius:"50%",
                background:`${AQUA}18`, border:`1px solid ${AQUA}44`,
                display:"flex", alignItems:"center", justifyContent:"center",
                margin:"0 auto 16px", fontSize:22 }}>📊</div>
              <div style={{ color:TPRI, fontWeight:700, fontSize:15, marginBottom:6 }}>
                No {period} data yet for {campus}
              </div>
              <div style={{ color:TSEC, fontSize:12, fontWeight:500 }}>
                Upload a report below to populate the charts
              </div>
            </div>
          )}

          {/* ── Upload Section ── */}
          <div style={{ background:PANEL, borderRadius:16, padding:"26px 28px",
            border:`1px solid ${BORDER}`, animation:"ucar-fadein .7s ease both",
            position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, right:0, opacity:0.07 }}>
              <WaveGraphic color={AQUA} opacity={1} width={500} height={80} />
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:2, position:"relative" }}>
              Upload Reports
            </div>
            <div style={{ fontSize:10, color:TSEC, fontWeight:500, letterSpacing:"0.04em",
              textTransform:"uppercase", marginBottom:22, position:"relative" }}>
              Campus is detected automatically from each report
            </div>
            <UploadZone onUpload={handleUpload} uploadState={uploadState} />
          </div>

          {/* ── Footer ── */}
          <div style={{ marginTop:32, textAlign:"center", fontSize:10, color:`${TSEC}88`,
            fontWeight:500, letterSpacing:"0.08em", textTransform:"uppercase" }}>
            University Corporation for Atmospheric Research · Internal Tool
          </div>

        </div>
      </div>
    </>
  );
}
