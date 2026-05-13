/**
 * FpaPage — Financial Planning & Analysis dashboard.
 *
 * Ingests a standardized Workday Operating Budget report, normalizes mapped
 * financial data, preserves historical months (overwriting on re-upload), and
 * renders eight executive-facing visuals covering FYTD and 13-month rolling
 * views.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from "recharts";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, storage } from "../firebase.js";
import { subscribeFpaFacts, subscribeFpaUploads } from "../firebase.js";
import Widget from "../components/Widget.jsx";
import { useWidgetSubscription } from "../hooks/useWidget.js";
import { useRole } from "../hooks/useRole.js";
import { canSeeWidget } from "../utils/permissions.js";
import {
  FPA_CAMPUSES,
  REVENUE_NORMALIZED_NAMES,
  EXPENSE_NORMALIZED_NAMES,
  fiscalYearLabel,
} from "../utils/fpaMappings.js";
import {
  totalRevenueFYTD,
  totalExpenseFYTD,
  revenueAndExpense13Month,
  revenueByCampusAndType,
  expenseByCampusAndType,
  laborExpenseByCampusByMonth,
  costOfSalesByCampusByMonth,
  expenseTypeAsPctOfRevenue,
  monthlySupportLevel,
  supportLevelFYTD,
  supportLevelFYTDForMonthKey,
  deriveFiscalYearsFromFacts,
  defaultFiscalYearFromFacts,
  latestMonthKey,
} from "../utils/fpaSelectors.js";
import { COLORS, SHADOWS, RADIUS } from "../theme.js";

// ── Palettes ─────────────────────────────────────────────────────────────────
// Restrained palette for stacked segments (revenue types, expense types).
const STACK_PALETTE = [
  COLORS.AQUA,
  COLORS.AQUA_DARK,
  COLORS.LAQUA,
  COLORS.ORANGE,
  "#2C4A63",
  "#80D4DC",
];

// Per-campus line colors for multi-series line charts.
const CAMPUS_COLORS = {
  "Mesa Lab":     COLORS.AQUA_DARK,
  "Foothills":    COLORS.LAQUA,
  "Center Green": COLORS.AQUA,
  "ES Admin":     COLORS.ORANGE,
};

// ── Currency formatters ──────────────────────────────────────────────────────
const fmtCurrency = (v) =>
  `$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtCurrencyK = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

// ── Shared chart helpers ─────────────────────────────────────────────────────
function CurrencyTooltip({ active, payload, label, valueFormatter = fmtCurrency }) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter(p => p.value != null && p.value !== 0);
  if (visible.length === 0) return null;
  return (
    <div style={{
      background: COLORS.BG_SURFACE, border: `1px solid ${COLORS.BORDER}`,
      borderRadius: 10, padding: "10px 14px", fontSize: 12,
      fontFamily: "'Poppins',sans-serif", boxShadow: SHADOWS.MD,
    }}>
      <div style={{ color: COLORS.TEXT_MUTED, marginBottom: 6, fontSize: 11 }}>{label}</div>
      {visible.map(p => (
        <div key={p.dataKey || p.name} style={{ color: p.color || p.fill, fontWeight: 600 }}>
          {p.name}: {valueFormatter(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Upload zone ──────────────────────────────────────────────────────────────
function FpaUploadZone({ accentColor = COLORS.AQUA }) {
  const [state, setState] = useState({ status: "IDLE", message: null, warnings: [] });
  const [monthOverride, setMonthOverride] = useState("");

  const isProcessing = state.status === "UPLOADING" || state.status === "PROCESSING";

  const handleDrop = useCallback(async (accepted) => {
    const file = accepted[0];
    if (!file) return;
    setState({ status: "UPLOADING", message: null, warnings: [] });

    try {
      const timestamp = Date.now();
      const storageRef = ref(storage, `fpa_uploads/${timestamp}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      const fileUrl = await new Promise((resolve, reject) => {
        task.on("state_changed", null, reject,
          async () => { resolve(await getDownloadURL(task.snapshot.ref)); });
      });

      setState({ status: "PROCESSING", message: null, warnings: [] });

      const token = await auth.currentUser.getIdToken();
      const body = { fileUrl };
      if (monthOverride) body.monthOverride = monthOverride;

      const res = await fetch("/api/parse-fpa-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const result = await res.json();
      const verb = result.overwroteExistingMonth ? "updated" : "added";
      const msg = `Month ${result.monthKey} ${verb} (${result.written} fact${result.written === 1 ? "" : "s"})`;
      setState({ status: "SUCCESS", message: msg, warnings: result.warnings || [] });
    } catch (err) {
      console.error("[FPA] Upload failed:", err);
      setState({ status: "ERROR", message: err?.message || "Upload failed", warnings: [] });
    }
  }, [monthOverride]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [] },
    multiple: false,
    disabled: isProcessing,
  });

  const icon = isProcessing ? "\u23F3"
    : state.status === "SUCCESS" ? "\u2713"
    : state.status === "ERROR" ? "\u2715"
    : "\u2191";

  return (
    <Widget title="Upload Workday FP&A Report"
      subtitle="Operating Budget Report (.xlsx) — auto-detects month"
      accentColor={accentColor}>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <label style={{ fontSize: 11, color: COLORS.TEXT_MUTED, fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Month override (optional)
        </label>
        <input
          type="month"
          value={monthOverride}
          onChange={(e) => setMonthOverride(e.target.value)}
          style={{
            background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
            borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
            padding: "7px 12px",
          }}
        />
      </div>

      <div {...getRootProps()} style={{
        border: `1.5px dashed ${isDragActive ? accentColor : COLORS.BORDER}`,
        borderRadius: 10, padding: "28px 20px",
        cursor: isProcessing ? "default" : "pointer",
        background: isDragActive ? `${accentColor}0e` : COLORS.BG_SURFACE_ALT,
        transition: "all 0.22s", textAlign: "center",
        position: "relative", overflow: "hidden",
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
          {isDragActive ? "Release to upload" : "Drop Workday .xlsx here or click to browse"}
        </div>
        <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins',sans-serif",
          fontWeight: 500 }}>
          {isProcessing
            ? (state.status === "UPLOADING" ? "Uploading to storage\u2026" : "Parsing workbook\u2026")
            : state.status === "SUCCESS" ? state.message
            : state.status === "ERROR"   ? state.message
            : "Re-uploading a month overwrites prior data for that month"}
        </div>

        {state.status === "SUCCESS" && (
          <div style={{
            display: "inline-block", marginTop: 12, padding: "4px 14px",
            borderRadius: 20, background: `${COLORS.SUCCESS}15`,
            border: `1px solid ${COLORS.SUCCESS}44`, color: COLORS.SUCCESS,
            fontSize: 11, fontWeight: 700, fontFamily: "'Poppins',sans-serif",
          }}>Success</div>
        )}
        {state.status === "ERROR" && (
          <div style={{
            display: "inline-block", marginTop: 12, padding: "4px 14px",
            borderRadius: 20, background: `${COLORS.WARNING}15`,
            border: `1px solid ${COLORS.WARNING}44`, color: COLORS.WARNING,
            fontSize: 11, fontWeight: 700, fontFamily: "'Poppins',sans-serif",
          }}>Error &mdash; try again</div>
        )}

        {isProcessing && (
          <div style={{ marginTop: 14, height: 2, background: COLORS.BORDER,
            borderRadius: 4, overflow: "hidden", maxWidth: 220, margin: "14px auto 0" }}>
            <div style={{ height: "100%", width: "55%", background: accentColor,
              borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
          </div>
        )}
      </div>

      {state.status === "SUCCESS" && state.warnings.length > 0 && (
        <div style={{
          marginTop: 14, padding: "10px 14px", borderRadius: 8,
          background: `${COLORS.WARNING}10`, border: `1px solid ${COLORS.WARNING}33`,
          fontFamily: "'Poppins',sans-serif", fontSize: 11, color: COLORS.WARNING,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Warnings</div>
          {state.warnings.map((w, i) => (
            <div key={i} style={{ opacity: 0.9 }}>&bull; {w}</div>
          ))}
        </div>
      )}
    </Widget>
  );
}

// ── KPI card (Report 1) ──────────────────────────────────────────────────────
function KpiCard({ label, value, accentColor = COLORS.AQUA, sublabel }) {
  return (
    <div style={{
      flex: 1, background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
      padding: "22px 24px", border: `1px solid ${COLORS.BORDER}`,
      boxShadow: SHADOWS.SM, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
      }} />
      <div style={{ color: COLORS.TEXT_MUTED, fontSize: 10, fontFamily: "'Poppins',sans-serif",
        fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px" }}>
        {label}
      </div>
      <div style={{ color: COLORS.TEXT_PRIMARY, fontSize: 30, fontWeight: 700,
        margin: "10px 0 6px", fontFamily: "'Poppins',sans-serif", letterSpacing: "-0.5px" }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: 11, fontWeight: 500,
          fontFamily: "'Poppins',sans-serif" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ── Status card showing dataset coverage ─────────────────────────────────────
function StatusCard({ fiscalYear, latestLabel, monthCount, uploadsCount }) {
  return (
    <div style={{
      flex: 1, background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
      padding: "18px 22px", border: `1px solid ${COLORS.BORDER}`,
      boxShadow: SHADOWS.SM, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${COLORS.AQUA_DARK}, transparent)`,
      }} />
      <div style={{ color: COLORS.TEXT_MUTED, fontSize: 10, fontFamily: "'Poppins',sans-serif",
        fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px" }}>
        Dataset Status
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <StatusItem label="Fiscal Year" value={fiscalYear ? fiscalYearLabel(fiscalYear) : "\u2014"} />
        <StatusItem label="Latest Period" value={latestLabel || "\u2014"} />
        <StatusItem label="Months in FY" value={monthCount ?? 0} />
        <StatusItem label="Uploads" value={uploadsCount ?? 0} />
      </div>
    </div>
  );
}

function StatusItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 500,
        fontFamily: "'Poppins',sans-serif", letterSpacing: "0.06em",
        textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: COLORS.TEXT_PRIMARY, fontWeight: 700,
        fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Chart: Revenue & Expense clustered (Report 2) ────────────────────────────
function RevenueExpenseChart({ data, loading }) {
  return (
    <Widget title="Total Revenue and Expense"
      subtitle="13-month rolling MTD values"
      accentColor={COLORS.AQUA}
      loading={loading}
      empty={!loading && data.every(d => d.revenue === 0 && d.expense === 0)}
      emptyMessage="Upload monthly reports to populate the rolling view"
      expandable printable>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} barCategoryGap="22%" margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} tickFormatter={fmtCurrencyK} />
          <Tooltip content={<CurrencyTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Poppins'" }} />
          <Bar dataKey="revenue" name="Revenue" fill={COLORS.AQUA}      radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill={COLORS.AQUA_DARK} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  );
}

// ── Chart: Stacked horizontal bar by campus (Reports 3 & 4) ──────────────────
function StackedByCampusChart({ title, subtitle, data, stackKeys, loading, emptyMessage }) {
  return (
    <Widget title={title} subtitle={subtitle} accentColor={COLORS.AQUA}
      loading={loading} empty={!loading && data.length === 0}
      emptyMessage={emptyMessage} expandable printable>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} tickFormatter={fmtCurrencyK} />
          <YAxis type="category" dataKey="campus" width={100}
            tick={{ fill: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} />
          <Tooltip content={<CurrencyTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Poppins'" }} />
          {stackKeys.map((key, i) => (
            <Bar key={key} dataKey={key} name={key} stackId="a"
              fill={STACK_PALETTE[i % STACK_PALETTE.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  );
}

// ── Chart: Multi-series line by campus (Reports 5 & 6) ───────────────────────
function MultiSeriesLineChart({ title, subtitle, data, loading }) {
  const activeCampuses = FPA_CAMPUSES.filter(campus =>
    data.some(d => (d[campus] || 0) !== 0)
  );
  return (
    <Widget title={title} subtitle={subtitle} accentColor={COLORS.AQUA}
      loading={loading}
      empty={!loading && activeCampuses.length === 0}
      emptyMessage="Upload monthly reports to populate the trend"
      expandable printable>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} tickFormatter={fmtCurrencyK} />
          <Tooltip content={<CurrencyTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Poppins'" }} />
          {activeCampuses.map(campus => (
            <Line key={campus} type="monotone" dataKey={campus} name={campus}
              stroke={CAMPUS_COLORS[campus] || COLORS.AQUA}
              strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Widget>
  );
}

// ── Chart: Expense type as % of revenue (Report 7) ───────────────────────────
function ExpensePctChart({ data, loading }) {
  return (
    <Widget title="Total Expenses"
      subtitle="Expense type as % of total revenue FYTD"
      accentColor={COLORS.AQUA}
      loading={loading}
      empty={!loading && data.every(d => d.amount === 0)}
      emptyMessage="No expense data for the selected fiscal year"
      expandable printable>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 40, left: 24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} />
          <YAxis type="category" dataKey="name" width={110}
            tick={{ fill: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} />
          <Tooltip content={<CurrencyTooltip valueFormatter={fmtPct} />} />
          <Bar dataKey="pct" name="% of revenue" fill={COLORS.AQUA} radius={[0, 3, 3, 0]}>
            <LabelList dataKey="pct" position="right" formatter={fmtPct}
              style={{ fill: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins'" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  );
}

// ── Chart: Monthly Support Level (Report 8) ──────────────────────────────────
function SupportLevelChart({ data, fytdTotal = 0, stlyTotal = null, loading }) {
  const headerRight = (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end",
        background: `${COLORS.AQUA}14`,
        border: `1px solid ${COLORS.AQUA}30`,
        borderRadius: 8,
        padding: "4px 10px",
        lineHeight: 1.1,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: COLORS.TEXT_MUTED,
          fontFamily: "'Poppins',sans-serif",
        }}>FYTD Total</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
          fontFamily: "'Poppins',sans-serif", marginTop: 1,
        }}>{fmtCurrency(fytdTotal)}</span>
      </div>
      {stlyTotal !== null && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-end",
          background: `${COLORS.ORANGE}14`,
          border: `1px solid ${COLORS.ORANGE}40`,
          borderRadius: 8,
          padding: "4px 10px",
          lineHeight: 1.1,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: COLORS.TEXT_MUTED,
            fontFamily: "'Poppins',sans-serif",
          }}>STLY Total</span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: COLORS.ORANGE,
            fontFamily: "'Poppins',sans-serif", marginTop: 1,
          }}>{fmtCurrency(stlyTotal)}</span>
        </div>
      )}
    </div>
  );
  return (
    <Widget title="Monthly Support Level"
      subtitle="Total Rollup to General Fund"
      accentColor={COLORS.AQUA}
      loading={loading}
      empty={!loading && data.length === 0}
      emptyMessage="No monthly data for the selected fiscal year"
      headerRight={headerRight}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 14, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: COLORS.CHART_AXIS, fontSize: 10, fontFamily: "'Poppins'" }}
            tickLine={false} axisLine={false} tickFormatter={fmtCurrencyK} />
          <Tooltip content={<CurrencyTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Poppins'" }} />
          <Bar dataKey="supportLevel" name="This Year" fill={COLORS.AQUA_DARK} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="supportLevel" position="top" formatter={fmtCurrencyK}
              style={{ fill: COLORS.TEXT_SECONDARY, fontSize: 9, fontFamily: "'Poppins'" }} />
          </Bar>
          <Bar dataKey="stlySupportLevel" name="Prior Year" fill={COLORS.ORANGE}
            radius={[3, 3, 0, 0]}>
            <LabelList dataKey="stlySupportLevel" position="top" formatter={fmtCurrencyK}
              style={{ fill: COLORS.ORANGE, fontSize: 9, fontFamily: "'Poppins'" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Widget>
  );
}

// ── Helpers for filtering ────────────────────────────────────────────────────
function filterOutEsAdmin(facts) {
  return facts.filter(f => f.campus !== "ES Admin");
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FpaPage() {
  const { role } = useRole();
  const canSeeUploadZone = canSeeWidget(role, "fpa_report_dropbox");
  const [fiscalYear, setFiscalYear] = useState(null);
  const [includeEsAdmin, setIncludeEsAdmin] = useState(true);

  const { data: factsData, loading: factsLoading } = useWidgetSubscription(
    (cb) => subscribeFpaFacts(cb), []
  );
  const { data: uploadsData } = useWidgetSubscription(
    (cb) => subscribeFpaUploads(cb), []
  );

  const facts   = useMemo(() => factsData ?? [],   [factsData]);
  const uploads = useMemo(() => uploadsData ?? [], [uploadsData]);

  const fiscalYears = useMemo(() => deriveFiscalYearsFromFacts(facts), [facts]);

  useEffect(() => {
    if (facts.length === 0) return;
    if (fiscalYear == null || !fiscalYears.includes(fiscalYear)) {
      setFiscalYear(defaultFiscalYearFromFacts(facts));
    }
  }, [facts, fiscalYears, fiscalYear]);

  const activeFY = fiscalYear ?? defaultFiscalYearFromFacts(facts);

  // Filter facts for selectors that should respect the includeEsAdmin toggle.
  // Monthly Support Level always excludes ES Admin regardless of toggle.
  const factsForToggleable = useMemo(() =>
    includeEsAdmin ? facts : filterOutEsAdmin(facts),
    [facts, includeEsAdmin]
  );
  const factsForSupportLevel = useMemo(() =>
    filterOutEsAdmin(facts),
    [facts]
  );

  // Always anchor time window to the latest month from unfiltered facts so
  // toggling ES Admin off never shifts which period the charts report on.
  const latestKey = latestMonthKey(facts, activeFY);

  const fytdRevenue = useMemo(() => totalRevenueFYTD(facts, activeFY), [facts, activeFY]);
  const fytdExpense = useMemo(() => totalExpenseFYTD(factsForToggleable, activeFY), [factsForToggleable, activeFY]);
  // 13-month rolling: pass latestKey so time window is fixed regardless of filtering
  const rolling13   = useMemo(() => revenueAndExpense13Month(factsForToggleable, latestKey), [factsForToggleable, latestKey]);
  // FYTD per-campus: call with unfiltered facts, strip ES Admin from output when toggled off
  const revByCampus = useMemo(() => {
    const all = revenueByCampusAndType(facts, activeFY);
    return includeEsAdmin ? all : all.filter(r => r.campus !== "ES Admin");
  }, [facts, activeFY, includeEsAdmin]);
  const expByCampus = useMemo(() => {
    const all = expenseByCampusAndType(facts, activeFY);
    return includeEsAdmin ? all : all.filter(r => r.campus !== "ES Admin");
  }, [facts, activeFY, includeEsAdmin]);
  const laborSeries = useMemo(() => laborExpenseByCampusByMonth(factsForToggleable, latestKey), [factsForToggleable, latestKey]);
  const cosSeries   = useMemo(() => costOfSalesByCampusByMonth(factsForToggleable, latestKey), [factsForToggleable, latestKey]);
  // expPct: filter inputs for correct totals; pass latestKey so month anchor is stable
  const expPct      = useMemo(() => expenseTypeAsPctOfRevenue(factsForToggleable, activeFY, latestKey), [factsForToggleable, activeFY, latestKey]);
  const support     = useMemo(() => monthlySupportLevel(factsForSupportLevel, activeFY), [factsForSupportLevel, activeFY]);
  const supportFYTD = useMemo(() => supportLevelFYTD(factsForSupportLevel, activeFY), [factsForSupportLevel, activeFY]);
  const priorFY = activeFY - 1;
  const supportSTLY = useMemo(() => monthlySupportLevel(factsForSupportLevel, priorFY), [factsForSupportLevel, priorFY]);
  const supportMerged = useMemo(() => {
    const stlyByFM = Object.fromEntries(
      supportSTLY.map(d => [d.fiscalMonthNumber, d.supportLevel])
    );
    return support.map(d => ({
      ...d,
      stlySupportLevel: stlyByFM[d.fiscalMonthNumber] ?? null,
    }));
  }, [support, supportSTLY]);
  const supportFYTDSTLY = useMemo(() => {
    if (supportSTLY.length === 0) return null;
    const currentMaxFM = support.length > 0
      ? Math.max(...support.map(d => d.fiscalMonthNumber))
      : 0;
    const matchingRow = supportSTLY.find(d => d.fiscalMonthNumber === currentMaxFM);
    if (!matchingRow) return null;
    return supportLevelFYTDForMonthKey(factsForSupportLevel, priorFY, matchingRow.monthKey);
  }, [support, supportSTLY, factsForSupportLevel, priorFY]);
  const latestLabel = latestKey
    ? new Date(Number(latestKey.split("-")[0]), Number(latestKey.split("-")[1]) - 1, 1)
        .toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  const monthCount = useMemo(() =>
    new Set(facts.filter(f => f.fiscalYear === activeFY).map(f => f.monthKey)).size,
    [facts, activeFY]
  );

  const hasData = facts.length > 0;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Controls bar ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
          fontFamily: "'Poppins',sans-serif", letterSpacing: "-0.3px" }}>
          FP&amp;A Dashboard
        </div>

        {/* ── ES Admin toggle (centered) ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
            letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
            ES Admin - Indirect Funds
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 11,
              color: includeEsAdmin ? COLORS.TEXT_SECONDARY : COLORS.TEXT_PRIMARY,
              fontWeight: 600,
              fontFamily: "'Poppins',sans-serif",
              transition: "color 0.3s ease"
            }}>
              Excluded
            </span>
            <button
              onClick={() => setIncludeEsAdmin(!includeEsAdmin)}
              style={{
                position: "relative",
                width: 48,
                height: 24,
                borderRadius: 12,
                border: `1px solid ${COLORS.BORDER}`,
                background: includeEsAdmin ? COLORS.AQUA : COLORS.BG_SURFACE_ALT,
                cursor: "pointer",
                transition: "background 0.3s ease",
                padding: 0,
              }}
              aria-label={includeEsAdmin ? "Exclude ES Admin" : "Include ES Admin"}
            >
              <div style={{
                position: "absolute",
                top: 2,
                left: includeEsAdmin ? 26 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: COLORS.TEXT_PRIMARY,
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                transition: "left 0.3s ease",
              }} />
            </button>
            <span style={{
              fontSize: 11,
              color: includeEsAdmin ? COLORS.TEXT_PRIMARY : COLORS.TEXT_SECONDARY,
              fontWeight: 600,
              fontFamily: "'Poppins',sans-serif",
              transition: "color 0.3s ease"
            }}>
              Included
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          {fiscalYears.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
                Fiscal Year
              </div>
              <select value={activeFY || ""} onChange={(e) => setFiscalYear(Number(e.target.value))}
                style={{ background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
                  borderRadius: RADIUS.SM, color: COLORS.TEXT_PRIMARY,
                  fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
                  padding: "9px 32px 9px 14px", cursor: "pointer",
                  appearance: "none", WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235A7A91'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
                }}>
                {fiscalYears.map(fy => (
                  <option key={fy} value={fy}>{fiscalYearLabel(fy)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 1: KPI + status ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 22 }}>
        <KpiCard label={`Total Revenue FYTD ${activeFY ? fiscalYearLabel(activeFY) : ""}`}
          value={hasData ? fmtCurrency(fytdRevenue) : "\u2014"}
          sublabel={latestLabel ? `Through ${latestLabel}` : "Awaiting first upload"}
          accentColor={COLORS.AQUA} />
        <KpiCard label={`Total Expenses FYTD ${activeFY ? fiscalYearLabel(activeFY) : ""}`}
          value={hasData ? fmtCurrency(fytdExpense) : "\u2014"}
          sublabel={latestLabel ? `Through ${latestLabel}` : "Awaiting first upload"}
          accentColor={COLORS.AQUA_DARK} />
        <StatusCard fiscalYear={activeFY} latestLabel={latestLabel}
          monthCount={monthCount} uploadsCount={uploads.length} />
      </div>

      {/* ── Row 2: 13-month clustered ── */}
      <div style={{ marginBottom: 22 }}>
        <RevenueExpenseChart data={rolling13} loading={factsLoading} />
      </div>

      {/* ── Row 3: FYTD revenue + expense by campus ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
        <StackedByCampusChart
          title="Total Revenue"
          subtitle={`By campus FYTD ${activeFY ? fiscalYearLabel(activeFY) : ""}`}
          data={revByCampus}
          stackKeys={REVENUE_NORMALIZED_NAMES}
          loading={factsLoading}
          emptyMessage="No revenue data for the selected fiscal year"
        />
        <StackedByCampusChart
          title="Total Expense"
          subtitle={`By campus FYTD ${activeFY ? fiscalYearLabel(activeFY) : ""}`}
          data={expByCampus}
          stackKeys={EXPENSE_NORMALIZED_NAMES}
          loading={factsLoading}
          emptyMessage="No expense data for the selected fiscal year"
        />
      </div>

      {/* ── Row 4: Labor + Cost of Sales (both 13-month) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
        <MultiSeriesLineChart
          title="Monthly Labor Expense"
          subtitle="Salaries + Benefits by campus 13-month rolling"
          data={laborSeries}
          loading={factsLoading}
        />
        <MultiSeriesLineChart
          title="Monthly Cost of Sales"
          subtitle="Materials by campus 13-month rolling"
          data={cosSeries}
          loading={factsLoading}
        />
      </div>

      {/* ── Row 5: Expense % + Support level ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 28 }}>
        <ExpensePctChart data={expPct} loading={factsLoading} />
        <SupportLevelChart
          data={supportMerged}
          fytdTotal={supportFYTD}
          stlyTotal={supportFYTDSTLY}
          loading={factsLoading}
        />
      </div>

      {/* ── Upload panel ── */}
      {canSeeUploadZone && (
        <div style={{ marginBottom: 28 }}>
          <FpaUploadZone />
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ marginTop: 8, textAlign: "center", fontSize: 10, color: COLORS.TEXT_DISABLED,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        University Corporation for Atmospheric Research &middot; Internal Tool
      </div>
    </div>
  );
}
