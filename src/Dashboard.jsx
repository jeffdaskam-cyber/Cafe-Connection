/**
 * FinancialsPage — daily, monthly, and annual cafe sales metrics.
 *
 * Phase 5 changes:
 *   - Sales report upload (DropBox) moved to Weekly Ops tab
 *   - Month-End Report moved to Reports tab
 *   - Charts wrapped in Widget (expandable, printable, loading states)
 *   - Campus selector replaced with shared CampusSelector component
 *   - Subscriptions replaced with useWidgetSubscription hook
 */

import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { subscribeToCampus, subscribeAllReports } from "./firebase.js";
import Widget from "./components/Widget.jsx";
import CampusSelector, { CAMPUSES, CAMPUS_COLOR } from "./components/CampusSelector.jsx";

const FINANCIALS_CAMPUSES = [...CAMPUSES, "All Campuses"];
import { useWidgetSubscription } from "./hooks/useWidget.js";
import { COLORS, SHADOWS, RADIUS } from "./theme.js";



// ── Period helpers ─────────────────────────────────────────────────────────────
function getMonthKey(date) {
  const d = date?.toDate ? date.toDate() : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
const FISCAL_MONTH_ORDER = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];
function sortByFiscalMonth(a, b) {
  const [ay, am] = a.monthKey.split("-").map(Number);
  const [by, bm] = b.monthKey.split("-").map(Number);
  const aFY = (am - 1) >= 9 ? ay : ay - 1;
  const bFY = (bm - 1) >= 9 ? by : by - 1;
  if (aFY !== bFY) return aFY - bFY;
  return FISCAL_MONTH_ORDER.indexOf((am - 1 + 12) % 12) - FISCAL_MONTH_ORDER.indexOf((bm - 1 + 12) % 12);
}
function buildMonthlyData(docs) {
  const byMonth = {};
  docs.filter(d => d.report_type === "period").forEach(d => {
    const key = getMonthKey(d.date);
    byMonth[key] = { monthKey: key, label: getMonthLabel(key),
      net_revenue: d.net_revenue || 0, total_checks: d.total_checks || 0,
      lunch_checks: d.lunch_checks || 0, source: "period" };
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
    const fy    = month >= 10 ? year : year - 1;
    const label = `FY${String(fy + 1).slice(2)}`;
    if (!byFY[fy]) byFY[fy] = { fy, label, net_revenue: 0, total_checks: 0, lunch_checks: 0 };
    byFY[fy].net_revenue  += m.net_revenue;
    byFY[fy].total_checks += m.total_checks;
    byFY[fy].lunch_checks += m.lunch_checks;
  });
  return Object.values(byFY).sort((a, b) => a.fy - b.fy);
}

function fmt(d) {
  if (!d) return "";
  const dt = d.toDate ? d.toDate() : new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function fmtMoney(n) {
  if (n == null) return "N/A";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Wave graphic ───────────────────────────────────────────────────────────────
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

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, delta, accentColor }) {
  const pos = delta >= 0;
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
      <div style={{ fontSize: 11, fontFamily: "'Poppins',sans-serif", fontWeight: 500,
        color: pos ? COLORS.SUCCESS : COLORS.WARNING }}>
        {pos ? "▲" : "▼"} {Math.abs(delta)}% vs last period
      </div>
      <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.07 }}>
        <WaveGraphic color={accentColor} opacity={1} width={180} height={50} />
      </div>
    </div>
  );
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: COLORS.BG_SURFACE, border: `1px solid ${COLORS.BORDER}`,
      borderRadius: 10, padding: "10px 14px", fontSize: 12, fontFamily: "'Poppins',sans-serif",
      boxShadow: SHADOWS.MD }}>
      <div style={{ color: COLORS.TEXT_MUTED, marginBottom: 6, fontSize: 11 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.dataKey === "cafe_sales" ? `$${Number(p.value).toLocaleString()}` : p.value}
        </div>
      ))}
    </div>
  );
};

// ── Financials Page ────────────────────────────────────────────────────────────
// Renamed from Dashboard → FinancialsPage as part of Phase 1 tab architecture refactor.
// This component is now rendered under the "Financials" tab in App.jsx.
const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

function getCalendarYear(fyLabel, month) {
  if (!fyLabel) return new Date().getFullYear();
  const match = fyLabel.match(/FY(\d{2})/);
  if (!match) return new Date().getFullYear();
  const fyEnd = 2000 + parseInt(match[1]); // e.g. "FY26" → 2026
  // FY26 = Oct 2025 – Sep 2026: Oct-Dec → fyEnd - 1, Jan-Sep → fyEnd
  return month >= 10 ? fyEnd - 1 : fyEnd;
}

export default function FinancialsPage() {
  const [campus,        setCampus]        = useState("Mesa Lab");
  const [period,        setPeriod]        = useState("daily");
  const [fiscalYear,    setFiscalYear]    = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // ── Compute query start date for daily subscription ────────────────────────
  const calendarYear = getCalendarYear(fiscalYear, selectedMonth);
  const monthStartDate = new Date(calendarYear, selectedMonth - 1, 1);

  // ── Real-time Firestore subscriptions via shared hook ──────────────────────
  const { data: metrics,  loading: metricsLoading  } = useWidgetSubscription(
    (cb) => subscribeToCampus(campus, cb, monthStartDate), [campus, selectedMonth, fiscalYear]
  );
  const { data: allDocs,  loading: allDocsLoading  } = useWidgetSubscription(
    (cb) => subscribeAllReports(campus, cb), [campus]
  );

  const loading     = metricsLoading || allDocsLoading;
  const safeMetrics = metrics  ?? [];
  const safeAllDocs = allDocs  ?? [];

  // ── Derived data ───────────────────────────────────────────────────────────
  const color       = CAMPUS_COLOR[campus] ?? COLORS.AQUA;
  const monthlyData = buildMonthlyData(safeAllDocs);
  const annualData  = buildAnnualData(monthlyData);
  const fiscalYears = annualData.map(d => d.label);

  // Keep fiscal year selection in sync with available data
  useEffect(() => {
    if (fiscalYears.length > 0 && !fiscalYears.includes(fiscalYear))
      setFiscalYear(fiscalYears[fiscalYears.length - 1]);
  }, [fiscalYears.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function inFiscalYear(monthKey, fyLabel) {
    if (!fyLabel) return true;
    const [year, month] = monthKey.split("-").map(Number);
    const fy = month >= 10 ? year : year - 1;
    return `FY${String(fy + 1).slice(2)}` === fyLabel;
  }

  const filteredMonthly = period === "monthly"
    ? monthlyData.filter(d => inFiscalYear(d.monthKey, fiscalYear))
    : monthlyData;

  const now = new Date();
  const isCurrentMonth =
    selectedMonth === now.getMonth() + 1 &&
    calendarYear === now.getFullYear();
  const monthEndDate = isCurrentMonth
    ? now
    : new Date(calendarYear, selectedMonth, 0, 23, 59, 59, 999);

  const filteredDaily = period === "daily"
    ? safeMetrics.filter(d => {
        const dt = d.date?.toDate ? d.date.toDate() : new Date(d.date);
        // Fiscal year filter
        if (fiscalYear) {
          const m = dt.getMonth() + 1, y = dt.getFullYear();
          const fy = m >= 10 ? y : y - 1;
          if (`FY${String(fy + 1).slice(2)}` !== fiscalYear) return false;
        }
        // Month filter
        return dt >= monthStartDate && dt <= monthEndDate;
      })
    : safeMetrics;

  // Aggregate daily data by date when showing All Campuses
  const aggregatedDaily = (() => {
    if (campus !== "All Campuses" || period !== "daily") return filteredDaily;
    const byDate = {};
    filteredDaily.forEach(d => {
      const key = fmt(d.date);
      if (!byDate[key]) byDate[key] = { net_revenue: 0, total_checks: 0, lunch_checks: 0, date: d.date };
      byDate[key].net_revenue  += d.net_revenue  || 0;
      byDate[key].total_checks += d.total_checks || 0;
      byDate[key].lunch_checks += d.lunch_checks || 0;
    });
    return Object.values(byDate);
  })();

  const chartData =
    period === "daily"   ? aggregatedDaily.map(d => ({ date: fmt(d.date), cafe_sales: d.net_revenue || 0, cafe_volume: d.total_checks || 0, event_volume: d.lunch_checks || 0 })) :
    period === "monthly" ? filteredMonthly.map(d => ({ date: d.label, cafe_sales: d.net_revenue, cafe_volume: d.total_checks, event_volume: d.lunch_checks })) :
                           annualData.map(d => ({ date: d.label, cafe_sales: d.net_revenue, cafe_volume: d.total_checks, event_volume: d.lunch_checks }));

  const statSource  = period === "daily" ? aggregatedDaily : period === "monthly" ? filteredMonthly : annualData;
  const totalSales  = statSource.reduce((s, d) => s + (d.net_revenue  || 0), 0);
  const totalChecks = statSource.reduce((s, d) => s + (d.total_checks || 0), 0);
  const avgVolume   = statSource.length ? Math.round(totalChecks / statSource.length) : 0;
  const totalEvents = statSource.reduce((s, d) => s + (d.lunch_checks || 0), 0);
  const avgCheck    = totalChecks > 0 ? totalSales / totalChecks : 0;
  const daysWithRevenue = statSource.filter(d => (d.net_revenue || 0) > 0).length;
  const avgDailyRevenue = daysWithRevenue > 0 ? totalSales / daysWithRevenue : 0;

  const dailyRangeLabel = isCurrentMonth
    ? `${MONTH_NAMES[selectedMonth - 1]} ${calendarYear} (MTD)`
    : `${MONTH_NAMES[selectedMonth - 1]} ${calendarYear}`;

  const chartSubtitle = period === "daily"   ? `${dailyRangeLabel} · ${campus}`
                      : period === "monthly" ? `By month · fiscal year · ${campus}`
                      :                       `By fiscal year · ${campus}`;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Controls bar ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: 28, flexWrap: "wrap", gap: 16 }}>

        {/* Campus */}
        <div>
          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
            textTransform: "uppercase", marginBottom: 10 }}>Campus</div>
          <CampusSelector value={campus} onChange={setCampus} campuses={FINANCIALS_CAMPUSES} />
        </div>

        {/* Fiscal year (hidden in annual view — FY is the axis itself) */}
        {period !== "annual" && fiscalYears.length > 0 && (
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

        {/* Month selector (daily mode only) */}
        {period === "daily" && (
          <div>
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
              textTransform: "uppercase", marginBottom: 10 }}>Month</div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{ background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
                padding: "9px 32px 9px 14px", cursor: "pointer",
                appearance: "none", WebkitAppearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235A7A91'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Period toggle */}
        <div>
          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
            textTransform: "uppercase", marginBottom: 10 }}>Period</div>
          <div style={{ display: "flex", background: COLORS.BG_SURFACE_ALT,
            border: `1px solid ${COLORS.BORDER}`, borderRadius: RADIUS.SM, padding: 3, gap: 2 }}>
            {[["daily", "Daily"], ["monthly", "Monthly"], ["annual", "Annual"]].map(([val, label]) => {
              const active = period === val;
              return (
                <button key={val} onClick={() => setPeriod(val)}
                  style={{ padding: "7px 18px", borderRadius: 6, border: "none", cursor: "pointer",
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
                    letterSpacing: "0.03em", transition: "all .2s ease",
                    background: active ? COLORS.AQUA : "transparent",
                    color: active ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_SECONDARY,
                    boxShadow: active ? `0 0 10px ${COLORS.AQUA}33` : "none" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "flex", gap: 18, marginBottom: 12,
        animation: "ucar-fadein .5s ease both" }}>
        <StatCard
          label={period === "daily" ? `Net Revenue (${dailyRangeLabel})` : period === "monthly" ? "Net Revenue (Monthly)" : "Net Revenue (Annual)"}
          value={loading ? "—" : `$${(totalSales / 1000).toFixed(1)}k`}
          delta={4.2} accentColor={COLORS.AQUA} />
        <StatCard
          label={period === "daily" ? "Avg Daily Checks" : period === "monthly" ? "Avg Monthly Checks" : "Avg Annual Checks"}
          value={loading ? "—" : (avgVolume || "—")}
          delta={-1.8} accentColor={COLORS.LAQUA} />
        <StatCard
          label="Total Lunch Checks"
          value={loading ? "—" : (totalEvents || "—")}
          delta={11.3} accentColor={color} />
      </div>
      <div style={{ display: "flex", gap: 18, marginBottom: 24,
        animation: "ucar-fadein .55s ease both" }}>
        <StatCard
          label="Avg Check"
          value={loading ? "—" : fmtMoney(avgCheck)}
          delta={0} accentColor="#E8871E" />
        <StatCard
          label="Avg Daily Revenue"
          value={loading ? "—" : fmtMoney(avgDailyRevenue)}
          delta={0} accentColor="#6366F1" />
      </div>

      {/* ── Charts ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20,
        marginBottom: 28, animation: "ucar-fadein .6s ease both" }}>

        {/* Cafe Sales */}
        <Widget
          title="Cafe Sales"
          subtitle={chartSubtitle}
          icon="💰"
          accentColor={COLORS.AQUA}
          loading={loading}
          empty={!loading && chartData.length === 0}
          emptyMessage={`No ${period} data yet for ${campus}`}
          emptyIcon="📊"
          expandable
          printable
        >
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} barSize={7}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: COLORS.CHART_AXIS, fontSize: 9, fontFamily: "'Poppins'" }}
                tickLine={false} axisLine={false} interval={period === "daily" ? 4 : 0} />
              <YAxis tick={{ fill: COLORS.CHART_AXIS, fontSize: 9, fontFamily: "'Poppins'" }}
                tickLine={false} axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cafe_sales" name="Cafe Sales" fill={COLORS.AQUA} radius={[4, 4, 0, 0]}
                label={{ position: "top",
                  formatter: v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`,
                  fill: COLORS.CHART_AXIS, fontSize: 8, fontFamily: "'Poppins'" }} />
            </BarChart>
          </ResponsiveContainer>
        </Widget>

        {/* Cafe Volume */}
        <Widget
          title="Total Cafe Volume"
          subtitle={`Total checks · ${campus}`}
          icon="📈"
          accentColor={COLORS.LAQUA}
          loading={loading}
          empty={!loading && chartData.length === 0}
          emptyMessage={`No ${period} data yet for ${campus}`}
          emptyIcon="📈"
          expandable
          printable
        >
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: COLORS.CHART_AXIS, fontSize: 9, fontFamily: "'Poppins'" }}
                tickLine={false} axisLine={false} interval={period === "daily" ? 4 : 0} />
              <YAxis tick={{ fill: COLORS.CHART_AXIS, fontSize: 9, fontFamily: "'Poppins'" }}
                tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="cafe_volume" name="Cafe Volume"
                stroke={COLORS.AQUA} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Widget>
      </div>
      {/* ── Footer ── */}
      <div style={{ marginTop: 8, textAlign: "center", fontSize: 10, color: COLORS.TEXT_DISABLED,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
