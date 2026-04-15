/**
 * EventRevenuePage — Internal & External event revenue by campus.
 *
 * Displays a grouped bar chart of internal vs. external event revenue,
 * with campus highlighting, Monthly/Annual period toggle, and fiscal year
 * selector. Two upload zones allow uploading Internal and External reports
 * which are parsed server-side and stored in the event_revenue collection.
 */

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, storage } from "../firebase.js";
import { subscribeEventRevenue } from "../firebase.js";
import Widget from "../components/Widget.jsx";
import { useWidgetSubscription } from "../hooks/useWidget.js";
import { COLORS, SHADOWS, RADIUS } from "../theme.js";

// ── Fiscal year helpers ───────────────────────────────────────────────────────
const FISCAL_MONTH_ORDER = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]; // Oct=0 through Sep=11

function sortByFiscalMonth(a, b) {
  const [ay, am] = a.monthKey.split("-").map(Number);
  const [by, bm] = b.monthKey.split("-").map(Number);
  const aFY = am >= 10 ? ay : ay - 1;
  const bFY = bm >= 10 ? by : by - 1;
  if (aFY !== bFY) return aFY - bFY;
  return FISCAL_MONTH_ORDER.indexOf(am - 1) - FISCAL_MONTH_ORDER.indexOf(bm - 1);
}

function getFiscalYearLabel(year, month) {
  const fyEnd = month >= 10 ? year + 1 : year;
  return `FY${String(fyEnd).slice(2)}`;
}

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ── Bar color config ──────────────────────────────────────────────────────────
const BAR_CONFIG = [
  { key: "revenueCG", name: "Center Green", color: COLORS.AQUA      },
  { key: "revenueFL", name: "Foothills",    color: "#34E1F4"         },
  { key: "revenueML", name: "Mesa Lab",     color: COLORS.AQUA_DARK  },
];

// ── Wave graphic ──────────────────────────────────────────────────────────────
function WaveGraphic({ color = COLORS.AQUA, opacity = 0.18, width = 420, height = 80 }) {
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
function StatCard({ label, value, accentColor, showDelta = false }) {
  return (
    <div style={{ flex: 1, background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
      padding: "20px 22px", border: `1px solid ${COLORS.BORDER}`,
      boxShadow: SHADOWS.SM, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
        borderRadius: `${RADIUS.LG} ${RADIUS.LG} 0 0` }} />
      <div style={{ color: COLORS.TEXT_MUTED, fontSize: 10, fontFamily: "'Poppins',sans-serif",
        fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px" }}>{label}</div>
      <div style={{ color: COLORS.TEXT_PRIMARY, fontSize: 28, fontWeight: 700, margin: "8px 0 6px",
        fontFamily: "'Poppins',sans-serif", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.07 }}>
        <WaveGraphic color={accentColor} opacity={1} width={180} height={50} />
      </div>
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function EventRevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const fmt = v => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div style={{ background: COLORS.BG_SURFACE, border: `1px solid ${COLORS.BORDER}`,
      borderRadius: 10, padding: "10px 14px", fontSize: 12, fontFamily: "'Poppins',sans-serif",
      boxShadow: SHADOWS.MD }}>
      <div style={{ color: COLORS.TEXT_MUTED, marginBottom: 6, fontSize: 11 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color || p.fill, fontWeight: 600 }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Month names ───────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Upload zone ───────────────────────────────────────────────────────────────
function UploadZone({ title, subtitle, reportType, requiresMonthYear }) {
  const [uploadState, setUploadState] = useState({ status: "IDLE", errorMsg: null, successMsg: null });
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear]   = useState("");
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const isProcessing = uploadState.status === "UPLOADING" || uploadState.status === "PROCESSING";
  const canUpload = !requiresMonthYear || (selectedMonth && selectedYear);

  const handleDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (requiresMonthYear && (!selectedMonth || !selectedYear)) return;

    setUploadState({ status: "UPLOADING", errorMsg: null, successMsg: null });
    try {
      // Upload to Firebase Storage
      const timestamp = Date.now();
      const storageRef = ref(storage, `event_revenue_uploads/${timestamp}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      const fileUrl = await new Promise((resolve, reject) => {
        task.on("state_changed", null, reject,
          async () => { const url = await getDownloadURL(task.snapshot.ref); resolve(url); }
        );
      });

      setUploadState({ status: "PROCESSING", errorMsg: null, successMsg: null });

      // Get auth token and call API
      const token = await auth.currentUser.getIdToken();
      const body = { fileUrl, reportType };
      if (requiresMonthYear) {
        body.month = Number(selectedMonth);
        body.year  = Number(selectedYear);
      }

      const res = await fetch("/api/parse-event-revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const result = await res.json();
      const count = result.written?.length || 0;
      setUploadState({ status: "SUCCESS", errorMsg: null, successMsg: `Parsed ${count} campus record${count !== 1 ? "s" : ""}` });
    } catch (err) {
      console.error(`[EventRevenue] ${reportType} upload failed:`, err);
      setUploadState({ status: "ERROR", errorMsg: err?.message || "Upload failed", successMsg: null });
    }
  }, [reportType, requiresMonthYear, selectedMonth, selectedYear]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [] },
    multiple: false,
    disabled: isProcessing || (requiresMonthYear && !canUpload),
  });

  const accentColor = COLORS.AQUA;
  const icon = isProcessing ? "\u23F3"
    : uploadState.status === "SUCCESS" ? "\u2713"
    : uploadState.status === "ERROR" ? "\u2715"
    : "\u2191";

  return (
    <Widget title={title} subtitle={subtitle}
      icon={reportType === "internal" ? "\uD83D\uDCCA" : "\uD83D\uDCCB"}
      accentColor={accentColor}>

      {/* Month/Year pickers for internal reports */}
      {requiresMonthYear && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            style={{ flex: 1, background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
              fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
              padding: "9px 14px", cursor: "pointer" }}>
            <option value="">Month...</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            style={{ flex: 1, background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
              fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
              padding: "9px 14px", cursor: "pointer" }}>
            <option value="">Year...</option>
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      <div {...getRootProps()} style={{
        border: `1.5px dashed ${isDragActive ? accentColor : COLORS.BORDER}`,
        borderRadius: 10, padding: "28px 20px",
        cursor: isProcessing || (requiresMonthYear && !canUpload) ? "default" : "pointer",
        background: isDragActive ? `${accentColor}0e` : COLORS.BG_SURFACE_ALT,
        transition: "all 0.22s", textAlign: "center",
        position: "relative", overflow: "hidden",
        opacity: (requiresMonthYear && !canUpload) ? 0.5 : 1,
      }}>
        <input {...getInputProps()} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: accentColor, borderRadius: "10px 10px 0 0" }} />
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: `${accentColor}14`, border: `1px solid ${accentColor}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 12px", fontSize: 20, color: accentColor, fontWeight: 700,
        }}>{icon}</div>
        <div style={{ color: COLORS.TEXT_PRIMARY, fontSize: 13, fontFamily: "'Poppins',sans-serif",
          fontWeight: 600, marginBottom: 6 }}>
          {requiresMonthYear && !canUpload
            ? "Select month & year first"
            : isDragActive ? "Release to upload" : "Drop .xlsx file here or click to browse"}
        </div>
        <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins',sans-serif",
          fontWeight: 500 }}>
          {isProcessing
            ? (uploadState.status === "UPLOADING" ? "Uploading to storage\u2026" : "Parsing report data\u2026")
            : uploadState.status === "SUCCESS"
              ? uploadState.successMsg
              : uploadState.status === "ERROR"
                ? uploadState.errorMsg
                : "Accepts .xlsx files only"}
        </div>

        {uploadState.status === "SUCCESS" && (
          <div style={{
            display: "inline-block", marginTop: 12, padding: "4px 14px",
            borderRadius: 20, background: `${COLORS.SUCCESS}15`,
            border: `1px solid ${COLORS.SUCCESS}44`, color: COLORS.SUCCESS,
            fontSize: 11, fontWeight: 700, fontFamily: "'Poppins',sans-serif",
          }}>Success</div>
        )}
        {uploadState.status === "ERROR" && (
          <div style={{
            display: "inline-block", marginTop: 12, padding: "4px 14px",
            borderRadius: 20, background: `${COLORS.WARNING}15`,
            border: `1px solid ${COLORS.WARNING}44`, color: COLORS.WARNING,
            fontSize: 11, fontWeight: 700, fontFamily: "'Poppins',sans-serif",
          }}>Error — try again</div>
        )}

        {isProcessing && (
          <div style={{ marginTop: 14, height: 2, background: COLORS.BORDER,
            borderRadius: 4, overflow: "hidden", maxWidth: 200, margin: "14px auto 0" }}>
            <div style={{ height: "100%", width: "55%", background: accentColor,
              borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
          </div>
        )}
      </div>
    </Widget>
  );
}

// ── Event Revenue Page ────────────────────────────────────────────────────────
export default function EventRevenuePage() {
  const [period, setPeriod]       = useState("Monthly");
  const [fiscalYear, setFiscalYear] = useState(null);

  // ── Real-time Firestore subscription ──────────────────────────────────────
  const { data: allDocs, loading } = useWidgetSubscription(
    (cb) => subscribeEventRevenue(cb),
    []
  );

  const safeDocs = allDocs ?? [];

  // ── Derive fiscal years from data ─────────────────────────────────────────
  const fiscalYears = [...new Set(
    safeDocs.map(d => getFiscalYearLabel(d.year, d.month))
  )].sort();

  useEffect(() => {
    if (fiscalYears.length > 0 && !fiscalYears.includes(fiscalYear))
      setFiscalYear(fiscalYears[fiscalYears.length - 1]);
  }, [fiscalYears.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build chart data ──────────────────────────────────────────────────────
  const chartData = (() => {
    if (period === "Monthly") {
      // Filter to selected fiscal year, group by monthKey
      const filtered = safeDocs.filter(d => getFiscalYearLabel(d.year, d.month) === fiscalYear);
      const byMonth = {};
      filtered.forEach(d => {
        if (!byMonth[d.monthKey]) {
          byMonth[d.monthKey] = {
            monthKey: d.monthKey,
            label: getMonthLabel(d.monthKey),
            revenueCG: 0, revenueFL: 0, revenueML: 0,
          };
        }
        const entry = byMonth[d.monthKey];
        if (d.campus === "Center Green") entry.revenueCG += d.revenue || 0;
        else if (d.campus === "Foothills") entry.revenueFL += d.revenue || 0;
        else if (d.campus === "Mesa Lab")  entry.revenueML += d.revenue || 0;
      });
      return Object.values(byMonth).sort(sortByFiscalMonth);
    } else {
      // Annual view — group by fiscal year
      const byFY = {};
      safeDocs.forEach(d => {
        const fy = getFiscalYearLabel(d.year, d.month);
        if (!byFY[fy]) {
          byFY[fy] = {
            label: fy,
            revenueCG: 0, revenueFL: 0, revenueML: 0,
          };
        }
        const entry = byFY[fy];
        if (d.campus === "Center Green") entry.revenueCG += d.revenue || 0;
        else if (d.campus === "Foothills") entry.revenueFL += d.revenue || 0;
        else if (d.campus === "Mesa Lab")  entry.revenueML += d.revenue || 0;
      });
      return Object.values(byFY).sort((a, b) => a.label.localeCompare(b.label));
    }
  })();

  // ── Stat card totals (per campus, for current view) ───────────────────────
  const statSource = period === "Monthly"
    ? safeDocs.filter(d => getFiscalYearLabel(d.year, d.month) === fiscalYear)
    : safeDocs;

  function campusTotal(campus) {
    return statSource
      .filter(d => d.campus === campus)
      .reduce((s, d) => s + (d.revenue || 0), 0);
  }

  const fmtK = v => loading ? "\u2014" : `$${(v / 1000).toFixed(1)}k`;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Controls bar ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: 28, flexWrap: "wrap", gap: 16 }}>

        {/* Period toggle */}
        <div>
          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
            textTransform: "uppercase", marginBottom: 10 }}>Period</div>
          <div style={{ display: "flex", background: COLORS.BG_SURFACE_ALT,
            border: `1px solid ${COLORS.BORDER}`, borderRadius: RADIUS.SM, padding: 3, gap: 2 }}>
            {["Monthly", "Annual"].map(val => {
              const active = period === val;
              return (
                <button key={val} onClick={() => setPeriod(val)}
                  style={{ padding: "7px 18px", borderRadius: 6, border: "none", cursor: "pointer",
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
                    letterSpacing: "0.03em", transition: "all .2s ease",
                    background: active ? COLORS.AQUA : "transparent",
                    color: active ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_SECONDARY,
                    boxShadow: active ? `0 0 10px ${COLORS.AQUA}33` : "none" }}>
                  {val}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fiscal year dropdown */}
        {fiscalYears.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
              textTransform: "uppercase", marginBottom: 10 }}>Fiscal Year</div>
            <select value={fiscalYear || ""} onChange={e => setFiscalYear(e.target.value)}
              style={{ background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
                padding: "9px 32px 9px 14px", cursor: "pointer",
                appearance: "none", WebkitAppearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235A7A91'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
              {fiscalYears.map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "flex", gap: 18, marginBottom: 24,
        animation: "ucar-fadein .5s ease both" }}>
        <StatCard label="Center Green" value={fmtK(campusTotal("Center Green"))}
          accentColor={COLORS.AQUA} />
        <StatCard label="Foothills" value={fmtK(campusTotal("Foothills"))}
          accentColor={COLORS.AQUA} />
        <StatCard label="Mesa Lab" value={fmtK(campusTotal("Mesa Lab"))}
          accentColor={COLORS.AQUA} />
      </div>

      {/* ── Grouped bar chart ── */}
      <div style={{ marginBottom: 28, animation: "ucar-fadein .6s ease both" }}>
        <Widget
          title="Event Revenue"
          subtitle={period === "Monthly"
            ? `Total revenue by campus \u00b7 ${fiscalYear || ""}`
            : "Total revenue by campus \u00b7 All fiscal years"}
          accentColor={COLORS.AQUA}
          loading={loading}
          empty={!loading && chartData.length === 0}
          emptyMessage="No event revenue data yet"
          expandable
          printable
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barCategoryGap="20%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: COLORS.CHART_AXIS, fontSize: 9, fontFamily: "'Poppins'" }}
                tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: COLORS.CHART_AXIS, fontSize: 9, fontFamily: "'Poppins'" }}
                tickLine={false} axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip content={<EventRevenueTooltip />} />
              {BAR_CONFIG.map(bar => (
                <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color}
                  fillOpacity={1}
                  radius={[3, 3, 0, 0]}
                  label={{ position: "top",
                    formatter: v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : v > 0 ? `$${v}` : "",
                    fill: COLORS.CHART_AXIS, fontSize: 8, fontFamily: "'Poppins'" }} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Widget>
        {/* ── Chart legend ── */}
        <div style={{
          display: "flex", gap: 24, justifyContent: "center",
          marginTop: 12,
        }}>
          {BAR_CONFIG.map(bar => (
            <div key={bar.key} style={{
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "'Poppins',sans-serif", fontSize: 11,
              color: COLORS.TEXT_SECONDARY, fontWeight: 600,
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: 3,
                background: bar.color, flexShrink: 0,
              }} />
              {bar.name}
            </div>
          ))}
        </div>
      </div>

      {/* ── Upload zones ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
        marginBottom: 28, animation: "ucar-fadein .65s ease both" }}>
        <UploadZone
          title="Upload Internal Report"
          subtitle="Internal event revenue"
          reportType="internal"
          requiresMonthYear={true}
        />
        <UploadZone
          title="Upload External Invoices"
          subtitle="External event invoices"
          reportType="external"
          requiresMonthYear={false}
        />
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 8, textAlign: "center", fontSize: 10, color: COLORS.TEXT_DISABLED,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        University Corporation for Atmospheric Research \u00b7 Internal Tool
      </div>
    </div>
  );
}
