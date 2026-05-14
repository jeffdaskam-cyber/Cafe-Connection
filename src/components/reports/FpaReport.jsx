/**
 * FpaReport — Monthly executive performance report for the Event Services dept.
 *
 * Subscribes to fpa_facts, lets the user pick a fiscal year and month, then
 * generates a .docx file with three captured Recharts charts and narrative
 * text derived from the FP&A data.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import html2canvas from "html2canvas";
import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  HeadingLevel, AlignmentType, BorderStyle,
} from "docx";
import { subscribeFpaFacts } from "../../firebase.js";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import Widget from "../Widget.jsx";
import { COLORS, RADIUS } from "../../theme.js";
import {
  revenueAndExpense13Month,
  expenseTypeAsPctOfRevenue,
  monthlySupportLevel,
  supportLevelFYTD,
  supportLevelFYTDForMonthKey,
  totalRevenueFYTD,
  totalExpenseFYTD,
  laborExpenseByCampusByMonth,
  deriveFiscalYearsFromFacts,
  defaultFiscalYearFromFacts,
  listMonthKeysForFY,
} from "../../utils/fpaSelectors.js";
import {
  FPA_CAMPUSES,
  REVENUE_NORMALIZED_NAMES,
  EXPENSE_NORMALIZED_NAMES,
  fiscalYearLabel,
} from "../../utils/fpaMappings.js";

// ── Formatting helpers ───────────────────────────────────────────────────────
const fmt = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`;

function formatMonthKey(key) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ── Chart capture ────────────────────────────────────────────────────────────
async function captureChart(ref) {
  if (!ref.current) throw new Error("Chart ref not mounted");
  const canvas = await html2canvas(ref.current, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#FFFFFF",
    logging: false,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Canvas to blob failed"));
      blob.arrayBuffer().then(resolve).catch(reject);
    }, "image/png");
  });
}

// ── docx assembly ────────────────────────────────────────────────────────────
function buildDocument({
  monthLabel, fyLabel, generatedDate,
  narrativeRevenueExpense, narrativeKeyMetrics, narrativeExpenses, narrativeSupport,
  img1, img2, img3,
}) {
  const accentBar = new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: "00A2B4", space: 0 } },
    spacing: { after: 0 },
    children: [],
  });
  const spacer = (pt = 120) => new Paragraph({ spacing: { before: pt, after: 0 }, children: [] });
  const sectionHeading = (text) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: "00A2B4" })],
  });
  const bodyText = (text) => new Paragraph({
    spacing: { before: 0, after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: "2C4A63" })],
  });
  const narrativeParagraphs = (text) =>
    text.split("\n\n").map((para) => bodyText(para));

  // docx ImageRun.transformation is in pixels (96 DPI). 600px ≈ 6.25" wide.
  const IMG_WIDTH = 600;
  const imgHeight = (capturedH, capturedW) => Math.round(IMG_WIDTH * capturedH / capturedW);
  const chartImage = (data, widthPx, heightPx, description) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 200 },
      children: [new ImageRun({
        type: "png",
        data,
        transformation: { width: widthPx, height: heightPx },
        altText: { title: description, description, name: description },
      })],
    });

  return new Document({
    styles: {
      default: {
        document: { run: { font: "Arial", size: 22, color: "011837" } },
      },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: "00A2B4" },
          paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: "Arial", color: "011837" },
          paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({
            text: "UNIVERSITY CORPORATION FOR ATMOSPHERIC RESEARCH",
            font: "Arial", size: 18, bold: true, color: "5A7A91",
            allCaps: true, characterSpacing: 40,
          })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({
            text: "Event Services Department",
            font: "Arial", size: 36, bold: true, color: "011837",
          })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({
            text: `Monthly Performance Report — ${monthLabel}`,
            font: "Arial", size: 28, color: "2C4A63",
          })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [
            new TextRun({ text: `Fiscal Year: ${fyLabel}`, font: "Arial", size: 20, color: "5A7A91" }),
            new TextRun({ text: `     |     Prepared: ${generatedDate}`, font: "Arial", size: 20, color: "5A7A91" }),
          ],
        }),
        accentBar,
        spacer(200),

        sectionHeading("Total Revenue and Expense"),
        chartImage(img1, IMG_WIDTH, imgHeight(300, 800), "Total Revenue and Expense — 13-Month Rolling"),
        spacer(80),
        bodyText(narrativeRevenueExpense),
        spacer(80),

        sectionHeading("Key Financial Metrics"),
        ...narrativeParagraphs(narrativeKeyMetrics),
        spacer(80),

        sectionHeading("Total Expenses"),
        bodyText(narrativeExpenses),
        chartImage(img2, IMG_WIDTH, imgHeight(280, 800), "Total Expenses as % of Revenue FYTD"),
        spacer(80),

        sectionHeading("Monthly Support Level"),
        bodyText(narrativeSupport),
        chartImage(img3, IMG_WIDTH, imgHeight(280, 800), "Monthly Support Level — Current vs. Prior Year"),
        spacer(80),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 320, after: 0 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDD9D4", space: 6 } },
          children: [new TextRun({
            text: "University Corporation for Atmospheric Research  ·  Internal Use Only",
            font: "Arial", size: 16, color: "9BAEBB",
          })],
        }),
      ],
    }],
  });
}

// ── Component ────────────────────────────────────────────────────────────────
export default function FpaReport() {
  const { data: factsData, loading: factsLoading } =
    useWidgetSubscription((cb) => subscribeFpaFacts(cb), []);
  const facts = useMemo(() => factsData || [], [factsData]);

  const fiscalYears = useMemo(() => deriveFiscalYearsFromFacts(facts), [facts]);
  const defaultFY   = useMemo(() => defaultFiscalYearFromFacts(facts), [facts]);

  const [selectedFY,       setSelectedFY]       = useState(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [generating,       setGenerating]       = useState(false);
  const [error,            setError]            = useState(null);

  // Initialize selected FY when data first arrives
  useEffect(() => {
    if (selectedFY == null && defaultFY != null) {
      setSelectedFY(defaultFY);
    }
  }, [defaultFY, selectedFY]);

  const availableMonthKeys = useMemo(
    () => (selectedFY != null ? listMonthKeysForFY(facts, selectedFY).slice().reverse() : []),
    [facts, selectedFY]
  );

  useEffect(() => {
    if (availableMonthKeys.length > 0) {
      setSelectedMonthKey(availableMonthKeys[0]);
    } else {
      setSelectedMonthKey(null);
    }
  }, [availableMonthKeys]);

  const factsNoEsAdmin = useMemo(
    () => facts.filter((f) => f.campus !== "ES Admin"),
    [facts]
  );

  const rolling13 = useMemo(
    () => (selectedMonthKey ? revenueAndExpense13Month(facts, selectedMonthKey) : []),
    [facts, selectedMonthKey]
  );
  const expPct = useMemo(
    () => (selectedFY != null && selectedMonthKey
      ? expenseTypeAsPctOfRevenue(facts, selectedFY, selectedMonthKey)
      : []),
    [facts, selectedFY, selectedMonthKey]
  );
  const supportMerged = useMemo(() => {
    if (selectedFY == null) return [];
    const current = monthlySupportLevel(factsNoEsAdmin, selectedFY);
    const prior   = monthlySupportLevel(factsNoEsAdmin, selectedFY - 1);
    const stlyMap = Object.fromEntries(prior.map((d) => [d.fiscalMonthNumber, d.supportLevel]));
    return current.map((d) => ({ ...d, stlySupportLevel: stlyMap[d.fiscalMonthNumber] ?? null }));
  }, [factsNoEsAdmin, selectedFY]);

  const fytdRevenue = useMemo(
    () => (selectedFY != null ? totalRevenueFYTD(facts, selectedFY) : 0),
    [facts, selectedFY]
  );
  const fytdExpense = useMemo(
    () => (selectedFY != null ? totalExpenseFYTD(facts, selectedFY) : 0),
    [facts, selectedFY]
  );
  const supportFYTD = useMemo(
    () => (selectedFY != null ? supportLevelFYTD(factsNoEsAdmin, selectedFY) : 0),
    [factsNoEsAdmin, selectedFY]
  );
  const supportFYTDSTLY = useMemo(() => {
    if (selectedFY == null) return null;
    const priorSupport = monthlySupportLevel(factsNoEsAdmin, selectedFY - 1);
    if (priorSupport.length === 0) return null;
    const current = monthlySupportLevel(factsNoEsAdmin, selectedFY);
    const maxFM   = current.length > 0 ? Math.max(...current.map((d) => d.fiscalMonthNumber)) : 0;
    const match   = priorSupport.find((d) => d.fiscalMonthNumber === maxFM);
    if (!match) return null;
    return supportLevelFYTDForMonthKey(factsNoEsAdmin, selectedFY - 1, match.monthKey);
  }, [factsNoEsAdmin, selectedFY]);

  const selectedMonthFacts = useMemo(
    () => facts.filter((f) => f.monthKey === selectedMonthKey),
    [facts, selectedMonthKey]
  );
  const mtdRevenue = useMemo(() =>
    selectedMonthFacts
      .filter((f) => REVENUE_NORMALIZED_NAMES.includes(f.normalizedName))
      .reduce((s, f) => s + (f.mtdAmount || 0), 0),
    [selectedMonthFacts]
  );
  const mtdExpense = useMemo(() =>
    selectedMonthFacts
      .filter((f) => EXPENSE_NORMALIZED_NAMES.includes(f.normalizedName))
      .reduce((s, f) => s + (f.mtdAmount || 0), 0),
    [selectedMonthFacts]
  );
  const mtdLabor = useMemo(() =>
    selectedMonthFacts
      .filter((f) => ["Salaries", "Benefits"].includes(f.normalizedName))
      .reduce((s, f) => s + (f.mtdAmount || 0), 0),
    [selectedMonthFacts]
  );
  const mtdMaterials = useMemo(() =>
    selectedMonthFacts
      .filter((f) => f.normalizedName === "Materials")
      .reduce((s, f) => s + (f.mtdAmount || 0), 0),
    [selectedMonthFacts]
  );

  const laborSeries = useMemo(
    () => (selectedMonthKey ? laborExpenseByCampusByMonth(facts, selectedMonthKey) : []),
    [facts, selectedMonthKey]
  );
  const selectedMonthLabor = laborSeries.find((d) => d.monthKey === selectedMonthKey) ?? {};

  const chartRef1 = useRef(null);
  const chartRef2 = useRef(null);
  const chartRef3 = useRef(null);

  // ── Narrative strings ──────────────────────────────────────────────────────
  const monthLabel = formatMonthKey(selectedMonthKey);
  const fyLabel    = selectedFY != null ? fiscalYearLabel(selectedFY) : "";

  const monthSurplusDeficit = mtdRevenue - mtdExpense;
  const narrativeRevenueExpense =
    `In ${monthLabel}, the Event Services department generated ${fmt(mtdRevenue)} in total revenue ` +
    `against ${fmt(mtdExpense)} in total expenses, resulting in a ` +
    `${monthSurplusDeficit >= 0 ? "departmental surplus" : "departmental deficit"} ` +
    `of ${fmt(Math.abs(monthSurplusDeficit))} for the month. ` +
    `For ${fyLabel} through ${monthLabel}, cumulative revenue stands at ${fmt(fytdRevenue)} ` +
    `and cumulative expenses total ${fmt(fytdExpense)}, ` +
    `representing a fiscal year-to-date ` +
    `${fytdRevenue - fytdExpense >= 0 ? "surplus" : "deficit"} ` +
    `of ${fmt(Math.abs(fytdRevenue - fytdExpense))}.`;

  const nonAdminCampuses = FPA_CAMPUSES.filter((c) => c !== "ES Admin");
  const highLaborCampus = nonAdminCampuses.reduce(
    (best, c) => (selectedMonthLabor[c] || 0) > (selectedMonthLabor[best] || 0) ? c : best,
    nonAdminCampuses[0]
  );
  const narrativeKeyMetrics =
    `Total Revenue: Departmental revenue for ${monthLabel} was ${fmt(mtdRevenue)}. ` +
    `Fiscal year-to-date revenue through ${monthLabel} totals ${fmt(fytdRevenue)}.\n\n` +
    `Total Expense: Total departmental expenses for ${monthLabel} were ${fmt(mtdExpense)}. ` +
    `Fiscal year-to-date expenses through ${monthLabel} total ${fmt(fytdExpense)}.\n\n` +
    `Monthly Labor Expense: Combined salary and benefits costs for ${monthLabel} ` +
    `totaled ${fmt(mtdLabor)} across all campuses. ` +
    `${highLaborCampus} carried the highest labor expenditure for the period.\n\n` +
    `Monthly Cost of Sales: Materials costs for ${monthLabel} totaled ${fmt(mtdMaterials)}.`;

  const totalExpPct = fytdRevenue > 0 ? (fytdExpense / fytdRevenue) * 100 : 0;
  const topExpenseCategory = expPct
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.pct - a.pct)[0];
  const narrativeExpenses =
    `Total departmental expenses represent ${fmtPct(totalExpPct)} of fiscal year-to-date revenue through ${monthLabel}. ` +
    (topExpenseCategory
      ? `The largest expense category is ${topExpenseCategory.name}, accounting for ` +
        `${fmtPct(topExpenseCategory.pct)} of total revenue. `
      : "") +
    `The chart below details each expense category as a percentage of total ${fyLabel} revenue.`;

  const supportSelectedMonth = supportMerged.find(
    (d) => d.monthKey === selectedMonthKey
  )?.supportLevel ?? 0;
  let narrativeSupport =
    `The Event Services department contributed ${fmt(supportSelectedMonth)} to the General Fund ` +
    `in ${monthLabel}. Fiscal year-to-date support through ${monthLabel} totals ${fmt(supportFYTD)}.`;
  if (supportFYTDSTLY !== null) {
    const yoyDelta = supportFYTD - supportFYTDSTLY;
    const yoyPct   = supportFYTDSTLY !== 0
      ? Math.abs(yoyDelta / supportFYTDSTLY * 100).toFixed(1)
      : null;
    narrativeSupport +=
      ` Compared to the same period in the prior fiscal year (${fmt(supportFYTDSTLY)}), ` +
      `the department's General Fund contribution is ` +
      (yoyDelta > 0
        ? `${yoyPct ? yoyPct + "% " : ""}higher year over year, reflecting increased net costs.`
        : yoyDelta < 0
        ? `${yoyPct ? yoyPct + "% " : ""}lower year over year, reflecting improved revenue or reduced costs.`
        : `unchanged year over year.`);
  } else {
    narrativeSupport += ` Prior fiscal year data is not available for a year-over-year comparison.`;
  }

  // ── Generate handler ────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      const [img1, img2, img3] = await Promise.all([
        captureChart(chartRef1),
        captureChart(chartRef2),
        captureChart(chartRef3),
      ]);
      const doc = buildDocument({
        monthLabel,
        fyLabel,
        generatedDate: new Date().toLocaleDateString("en-US",
          { month: "long", day: "numeric", year: "numeric" }),
        narrativeRevenueExpense,
        narrativeKeyMetrics,
        narrativeExpenses,
        narrativeSupport,
        img1, img2, img3,
      });
      const blob = await Packer.toBlob(doc);
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url,
        download: `Event_Services_Performance_${selectedMonthKey}.docx`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[FpaReport] Generation failed:", err);
      setError("Report generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
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

  const axisTick = { fill: "#5A7A91", fontSize: 10, fontFamily: "Arial" };
  const disabled = !selectedMonthKey || generating || facts.length === 0;

  return (
    <Widget
      title="FP&A Performance Report"
      subtitle="Monthly executive report — .docx download"
      icon="📊"
      accentColor={COLORS.AQUA}
      loading={factsLoading}
    >
      <div style={{ paddingTop: 4 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Fiscal Year</div>
            <select
              value={selectedFY ?? ""}
              onChange={(e) => setSelectedFY(Number(e.target.value))}
              style={{ ...selectStyle, width: "100%" }}
              disabled={fiscalYears.length === 0}
            >
              {fiscalYears.length === 0 && <option value="">—</option>}
              {fiscalYears.map((fy) => (
                <option key={fy} value={fy}>{fiscalYearLabel(fy)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <div style={labelStyle}>Month</div>
            <select
              value={selectedMonthKey ?? ""}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              style={{ ...selectStyle, width: "100%" }}
              disabled={availableMonthKeys.length === 0}
            >
              {availableMonthKeys.length === 0 && <option value="">—</option>}
              {availableMonthKeys.map((mk) => (
                <option key={mk} value={mk}>{formatMonthKey(mk)}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={disabled}
          style={{
            width: "100%", padding: "11px 0", borderRadius: RADIUS.SM,
            border: "none", background: COLORS.AQUA, color: COLORS.TEXT_ON_ACCENT,
            fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {generating ? "Generating…" : "Generate Report"}
        </button>

        <p style={{
          fontSize: 10, color: COLORS.TEXT_MUTED, marginTop: 10, marginBottom: 0,
          fontFamily: "'Poppins',sans-serif", fontStyle: "italic",
        }}>
          Includes charts for Revenue &amp; Expense, Total Expenses, and Monthly Support Level.
        </p>

        {error && (
          <p style={{
            color: COLORS.ERROR, marginTop: 12, fontSize: 12,
            fontFamily: "'Poppins',sans-serif",
          }}>
            {error}
          </p>
        )}
      </div>

      {/* ── Hidden chart capture surfaces ─────────────────────────────────── */}
      <div style={{ position: "absolute", left: -9999, top: -9999, pointerEvents: "none" }} aria-hidden="true">
        {/* Chart 1: Revenue & Expense — 13-month rolling */}
        <div ref={chartRef1} style={{ width: 800, height: 300, background: "#FFFFFF" }}>
          <BarChart width={800} height={300} data={rolling13}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E1DC" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick}
              tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontFamily: "Arial", fontSize: 11 }} />
            <Bar dataKey="revenue" name="Revenue" fill="#00A2B4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" name="Expense" fill="#00818F" radius={[3, 3, 0, 0]} />
          </BarChart>
        </div>

        {/* Chart 2: Expense % of Revenue — horizontal */}
        <div ref={chartRef2} style={{ width: 800, height: 280, background: "#FFFFFF" }}>
          <BarChart width={800} height={280} data={expPct} layout="vertical"
            margin={{ top: 10, right: 60, left: 110, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E1DC" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick}
              tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={axisTick} width={100} />
            <Tooltip />
            <Bar dataKey="pct" name="% of Revenue" fill="#00A2B4" radius={[0, 3, 3, 0]}>
              <LabelList dataKey="pct" position="right"
                formatter={(v) => `${Number(v).toFixed(1)}%`}
                style={{ fill: "#2C4A63", fontSize: 10, fontFamily: "Arial" }} />
            </Bar>
          </BarChart>
        </div>

        {/* Chart 3: Monthly Support Level — current vs STLY */}
        <div ref={chartRef3} style={{ width: 800, height: 280, background: "#FFFFFF" }}>
          <BarChart width={800} height={280} data={supportMerged}
            margin={{ top: 30, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E1DC" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick}
              tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontFamily: "Arial", fontSize: 11 }} />
            <Bar dataKey="supportLevel" name="This Year" fill="#00818F" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="supportLevel" position="top"
                formatter={(v) => `$${Math.round((v || 0) / 1000)}k`}
                style={{ fill: "#2C4A63", fontSize: 9, fontFamily: "Arial" }} />
            </Bar>
            <Bar dataKey="stlySupportLevel" name="Prior Year" fill="#FAA119" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="stlySupportLevel" position="top"
                formatter={(v) => v != null ? `$${Math.round(v / 1000)}k` : ""}
                style={{ fill: "#2C4A63", fontSize: 9, fontFamily: "Arial" }} />
            </Bar>
          </BarChart>
        </div>
      </div>
    </Widget>
  );
}
