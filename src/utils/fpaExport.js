// src/utils/fpaExport.js
// Reads fpa_facts + daily_metrics from Firestore, aggregates into the agent
// JSON schema, and triggers a browser download.

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";
import { buildCafeVolume, buildVolumeAccum } from "./cafeVolume.js";

const CAMPUSES = ["ES Admin", "Mesa Lab", "Foothills", "Center Green"];

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

  const volumeAccum = buildVolumeAccum(dailyMetrics);

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

      const cafeVolume = buildCafeVolume(volumeAccum, month.monthKey);
      if (cafeVolume) monthOut.cafe_volume = cafeVolume;
      return monthOut;
    });

  // Months whose café volume carries no usable payroll total, so a consumer
  // sees the gap before it sums anything. The August 2026 leadership report
  // read five zeroed months as "the discount program began in March 2026" and
  // published an FYTD discount of $32,825 against the app's $60,554.
  const payrollMonthsIncomplete = months
    .filter(m => m.cafe_volume && m.cafe_volume.totals.payroll_deduct_sales == null)
    .map(m => m.month_key);

  // A month can have every tender recorded and still no computable discount,
  // when its sales tax was never read. Listed apart so the two are not read as
  // one failure — the tenders in these months are still sound.
  const discountMonthsIncomplete = months
    .filter(m => m.cafe_volume
      && m.cafe_volume.totals.payroll_deduct_sales != null
      && m.cafe_volume.totals.payroll_discount == null)
    .map(m => m.month_key);

  const exportData = {
    export_metadata: {
      exported_at: new Date().toISOString(),
      app: "Cafe Connection",
      months_with_data: months.map(m => m.month_key),
      fiscal_years_with_data: [...new Set(months.map(m => m.fiscal_year))].sort(),
      data_quality: {
        payroll_months_incomplete: payrollMonthsIncomplete,
        discount_months_incomplete: discountMonthsIncomplete,
        payroll_note: "Months listed here have café traffic but no complete payroll-deduct total, because the source reports for those days were uploaded in a format the TENDERS parser cannot read (PDF uploads never yield one). Run scripts/backfillSalesPayroll.mjs to recover them from the archived reports, then re-export. Until that is done, no FYTD payroll figure derived from this file is complete.",
      },
      note: "MTD values represent activity in that specific calendar month. YTD values are cumulative FYTD totals as of that month's Workday upload. Use MTD for month-by-month trend analysis. Use YTD only for the most recent month's FYTD snapshot. cafe_volume data comes from InfoGenesis (POS) via daily_metrics — it reflects customer transaction counts, not Workday accounting figures. Within cafe_volume, payroll_deduct_sales is the MTD payroll-deduct tender total (what employees were charged, already net of their discount) and payroll_discount is the MTD value of the 15% employee discount on those sales. The discount is taken on the menu-price share of the tender only: the tender includes sales tax, and the discount never applied to tax, so the figure is payroll_deduct_sales_pretax × 15/85, where payroll_deduct_sales_pretax is the tender divided by (1 + payroll_tax_rate) and payroll_tax_rate is that campus-month's own sales tax over its net revenue. Taking 15/85 of the whole tender overstates the discount by the tax share, about 9%. Both are MTD-only, so they graph month by month alongside total_checks and avg_check. IMPORTANT: a null payroll_deduct_sales or payroll_discount means the figure was not recorded — never that it was zero. The 15% payroll-deduct discount is a long-standing program, so every month with café activity has payroll-deduct sales; a null is a gap in the uploaded source reports. payroll_coverage on each campus and month total says which. A null payroll_discount beside a non-null payroll_deduct_sales means the tender was recorded but the sales tax was not, so the discount cannot be computed; payroll_tax_basis on the month total names the campuses responsible. Do not sum months into an FYTD discount while either export_metadata.data_quality.payroll_months_incomplete or discount_months_incomplete is non-empty — the result understates the year by however much those months hold. Report the gap instead.",
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
