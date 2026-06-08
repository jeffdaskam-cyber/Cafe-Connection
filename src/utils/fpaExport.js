// src/utils/fpaExport.js
// Reads fpa_facts + daily_metrics from Firestore, aggregates into the agent
// JSON schema, and triggers a browser download.

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";

const CAMPUSES = ["ES Admin", "Mesa Lab", "Foothills", "Center Green"];
const VOLUME_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

const REVENUE_KEYS = [
  ["Cafe Sales Revenue",    "cafe_sales_revenue"],
  ["Cafe Revenue",          "cafe_revenue"],
  ["External Event Revenue","external_event_revenue"],
  ["Internal Event Revenue","internal_event_revenue"],
  ["Sales Tax",             "sales_tax"],
];

const EXPENSE_KEYS = [
  ["Salaries",     "salaries"],
  ["Benefits",     "benefits"],
  ["Materials",    "materials"],
  ["Services",     "services"],
  ["Taxes",        "taxes"],
  ["Depreciation", "depreciation"],
];

function buildBucket(campusData, period, keys) {
  const obj = {};
  let total = 0;
  for (const [name, key] of keys) {
    const v = campusData?.[name]?.[period] ?? 0;
    obj[key] = v;
    total += v;
  }
  obj.total = total;
  return obj;
}

function buildTotals(campusObjects, period) {
  const rev = {};
  const exp = {};
  for (const k of [...REVENUE_KEYS.map(r => r[1]), "total"]) rev[k] = 0;
  for (const k of [...EXPENSE_KEYS.map(e => e[1]), "total"]) exp[k] = 0;
  for (const c of campusObjects) {
    const r = period === "mtd" ? c.revenue_mtd : c.revenue_ytd;
    const e = period === "mtd" ? c.expenses_mtd : c.expenses_ytd;
    for (const k of Object.keys(rev)) rev[k] += r[k] ?? 0;
    for (const k of Object.keys(exp)) exp[k] += e[k] ?? 0;
  }
  const labor = (exp.salaries ?? 0) + (exp.benefits ?? 0);
  const materials = exp.materials ?? 0;
  return {
    revenue: rev,
    expenses: exp,
    support_level: exp.total - rev.total,
    labor_expense: labor,
    cost_of_sales: materials,
    labor_pct_of_revenue: rev.total > 0 ? labor / rev.total : null,
    materials_pct_of_revenue: rev.total > 0 ? materials / rev.total : null,
  };
}

function resolveMonthKey(date) {
  if (typeof date === "string") return date.slice(0, 7);
  if (date?.seconds != null) {
    const d = new Date(date.seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof date?.toDate === "function") {
    const d = date.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

export async function exportAgentJson() {
  const [fpaSnap, metricsSnap] = await Promise.all([
    getDocs(collection(db, "fpa_facts")),
    getDocs(collection(db, "daily_metrics")),
  ]);
  const facts = fpaSnap.docs.map(d => d.data());
  const dailyMetrics = metricsSnap.docs.map(d => d.data());

  // ── fpa_facts → byMonth[monthKey].campuses[campus][normalizedName] = { mtd, ytd }
  const byMonth = {};
  for (const fact of facts) {
    const { monthKey, monthLabel, fiscalYear, fiscalMonthNumber, campus, normalizedName, mtdAmount, ytdAmount } = fact;
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { monthKey, monthLabel, fiscalYear, fiscalMonthNumber, campuses: {} };
    }
    if (!byMonth[monthKey].campuses[campus]) byMonth[monthKey].campuses[campus] = {};
    // Accumulate rather than assign: several ledger codes share a normalizedName
    // (e.g. 5051 "Benefits - Applied" and 9989 "Final Rate-Full Benefits" both
    // normalize to "Benefits"). Keying by normalizedName means the second fact
    // would otherwise clobber the first; summing keeps both.
    const bucket = byMonth[monthKey].campuses[campus][normalizedName] ?? { mtd: 0, ytd: 0 };
    bucket.mtd += mtdAmount ?? 0;
    bucket.ytd += ytdAmount ?? 0;
    byMonth[monthKey].campuses[campus][normalizedName] = bucket;
  }

  // ── daily_metrics → volumeAccum[monthKey][campus] = { net_revenue, total_checks }
  const volumeAccum = {};
  for (const doc of dailyMetrics) {
    if (!VOLUME_CAMPUSES.includes(doc.campus)) continue;
    const monthKey = resolveMonthKey(doc.date);
    if (!monthKey) continue;
    if (!volumeAccum[monthKey]) volumeAccum[monthKey] = {};
    if (!volumeAccum[monthKey][doc.campus]) {
      volumeAccum[monthKey][doc.campus] = { net_revenue: 0, total_checks: 0 };
    }
    volumeAccum[monthKey][doc.campus].net_revenue += doc.net_revenue ?? 0;
    volumeAccum[monthKey][doc.campus].total_checks += doc.total_checks ?? 0;
  }

  function buildCafeVolume(monthKey) {
    const monthVol = volumeAccum[monthKey];
    if (!monthVol) return null;
    const byCampus = {};
    let allRevenue = 0;
    let allChecks = 0;
    for (const campus of VOLUME_CAMPUSES) {
      const v = monthVol[campus];
      if (!v || v.total_checks === 0) continue;
      byCampus[campus] = {
        total_checks: v.total_checks,
        avg_check: v.net_revenue / v.total_checks,
      };
      allRevenue += v.net_revenue;
      allChecks  += v.total_checks;
    }
    if (Object.keys(byCampus).length === 0) return null;
    return {
      by_campus: byCampus,
      totals: {
        total_checks: allChecks,
        avg_check: allChecks > 0 ? allRevenue / allChecks : null,
      },
    };
  }

  // ── Assemble months[] sorted chronologically ────────────────────────────────
  const months = Object.values(byMonth)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map(month => {
      const campusObjects = CAMPUSES.map(campus => {
        const cd = month.campuses[campus] ?? {};
        const revenue_mtd  = buildBucket(cd, "mtd", REVENUE_KEYS);
        const expenses_mtd = buildBucket(cd, "mtd", EXPENSE_KEYS);
        const revenue_ytd  = buildBucket(cd, "ytd", REVENUE_KEYS);
        const expenses_ytd = buildBucket(cd, "ytd", EXPENSE_KEYS);
        return {
          campus,
          revenue_mtd,
          expenses_mtd,
          support_level_mtd: expenses_mtd.total - revenue_mtd.total,
          revenue_ytd,
          expenses_ytd,
          support_level_ytd: expenses_ytd.total - revenue_ytd.total,
        };
      });

      const campusesOut = {};
      for (const c of campusObjects) {
        const { campus, ...rest } = c;
        campusesOut[campus] = rest;
      }

      const monthOut = {
        month_key: month.monthKey,
        month_label: month.monthLabel,
        fiscal_year: month.fiscalYear,
        fiscal_month_number: month.fiscalMonthNumber,
        campuses: campusesOut,
        totals: {
          mtd: buildTotals(campusObjects, "mtd"),
          ytd: buildTotals(campusObjects, "ytd"),
        },
      };

      const cafeVolume = buildCafeVolume(month.monthKey);
      if (cafeVolume) monthOut.cafe_volume = cafeVolume;
      return monthOut;
    });

  const exportData = {
    export_metadata: {
      exported_at: new Date().toISOString(),
      app: "Cafe Connection",
      months_with_data: months.map(m => m.month_key),
      fiscal_years_with_data: [...new Set(months.map(m => m.fiscal_year))].sort(),
      note: "MTD values represent activity in that specific calendar month. YTD values are cumulative FYTD totals as of that month's Workday upload. Use MTD for month-by-month trend analysis. Use YTD only for the most recent month's FYTD snapshot. cafe_volume data comes from InfoGenesis (POS) via daily_metrics — it reflects customer transaction counts, not Workday accounting figures.",
    },
    months,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cafe-connection-agent-export-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
