/**
 * FP&A selectors.
 *
 * Pure helpers that read a flat `fpa_facts` array and produce the eight
 * executive-facing dashboard views. FYTD snapshots use YTD values (column D
 * in the source workbook); monthly trends use MTD values (column C).
 *
 * All selectors tolerate missing months and missing campuses so partial
 * uploads still render meaningful data.
 */

import {
  FPA_CAMPUSES,
  REVENUE_NORMALIZED_NAMES,
  EXPENSE_NORMALIZED_NAMES,
  LABOR_EXPENSE_NAMES,
  COST_OF_SALES_NAMES,
  fiscalYearFor,
  fiscalMonthNumberFor,
  monthLabelFor,
} from "./fpaMappings.js";

// ── Fiscal-month ordering ────────────────────────────────────────────────────
export function compareMonthKeysAsc(a, b) {
  return a.localeCompare(b);
}

export function parseMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return { year: y, month: m };
}

// ── Month-key utilities ──────────────────────────────────────────────────────
export function listAllMonthKeys(facts) {
  return [...new Set(facts.map(f => f.monthKey))].sort(compareMonthKeysAsc);
}

export function listMonthKeysForFY(facts, fiscalYear) {
  return listAllMonthKeys(
    facts.filter(f => f.fiscalYear === fiscalYear)
  );
}

export function latestMonthKey(facts, fiscalYear) {
  const keys = fiscalYear == null ? listAllMonthKeys(facts) : listMonthKeysForFY(facts, fiscalYear);
  return keys[keys.length - 1] ?? null;
}

export function listFiscalYears(facts) {
  return [...new Set(facts.map(f => f.fiscalYear))].sort((a, b) => a - b);
}

// ── 13-month rolling window (ending at latest month in facts) ────────────────
export function trailing13MonthKeys(facts, endMonthKey = null) {
  const allKeys = listAllMonthKeys(facts);
  if (allKeys.length === 0) return [];
  const end = endMonthKey ?? allKeys[allKeys.length - 1];

  // Generate 13 month keys ending at `end` (inclusive), calendar-walking backwards.
  const [endY, endM] = end.split("-").map(Number);
  const keys = [];
  let y = endY, m = endM;
  for (let i = 0; i < 13; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return keys;
}

// ── Sums by campus × monthKey × bucket ───────────────────────────────────────
function sumByPredicate(facts, amountField, predicate) {
  return facts.reduce((total, f) => predicate(f) ? total + (f[amountField] || 0) : total, 0);
}

function ytdRevenue(facts) {
  return sumByPredicate(facts, "ytdAmount", f => REVENUE_NORMALIZED_NAMES.includes(f.normalizedName));
}
function ytdExpense(facts) {
  return sumByPredicate(facts, "ytdAmount", f => EXPENSE_NORMALIZED_NAMES.includes(f.normalizedName));
}

// ── Report 1: Total Revenue - FYTD (KPI) ─────────────────────────────────────
export function totalRevenueFYTD(facts, fiscalYear) {
  const latest = latestMonthKey(facts, fiscalYear);
  if (!latest) return 0;
  const slice = facts.filter(f => f.fiscalYear === fiscalYear && f.monthKey === latest);
  return ytdRevenue(slice);
}

export function totalExpenseFYTD(facts, fiscalYear) {
  const latest = latestMonthKey(facts, fiscalYear);
  if (!latest) return 0;
  const slice = facts.filter(f => f.fiscalYear === fiscalYear && f.monthKey === latest);
  return ytdExpense(slice);
}

// ── Report 2: Total Revenue and Expense — 13-month rolling (clustered) ───────
export function revenueAndExpense13Month(facts, endMonthKey = null) {
  const keys = trailing13MonthKeys(facts, endMonthKey);
  return keys.map(key => {
    const slice = facts.filter(f => f.monthKey === key);
    const [y, m] = key.split("-").map(Number);
    return {
      monthKey: key,
      label: monthLabelFor(y, m),
      revenue: sumByPredicate(slice, "mtdAmount", f => REVENUE_NORMALIZED_NAMES.includes(f.normalizedName)),
      expense: sumByPredicate(slice, "mtdAmount", f => EXPENSE_NORMALIZED_NAMES.includes(f.normalizedName)),
    };
  });
}

// ── Report 3: Total Revenue - FYTD by campus, stacked by type ────────────────
export function revenueByCampusAndType(facts, fiscalYear) {
  const latest = latestMonthKey(facts, fiscalYear);
  if (!latest) return [];
  const slice = facts.filter(f => f.fiscalYear === fiscalYear && f.monthKey === latest);
  return FPA_CAMPUSES.map(campus => {
    const row = { campus };
    for (const name of REVENUE_NORMALIZED_NAMES) {
      row[name] = sumByPredicate(slice, "ytdAmount",
        f => f.campus === campus && f.normalizedName === name);
    }
    row.total = REVENUE_NORMALIZED_NAMES.reduce((s, n) => s + (row[n] || 0), 0);
    return row;
  }).filter(r => r.total > 0);
}

// ── Report 4: Total Expense - FYTD by campus, stacked by type ────────────────
export function expenseByCampusAndType(facts, fiscalYear) {
  const latest = latestMonthKey(facts, fiscalYear);
  if (!latest) return [];
  const slice = facts.filter(f => f.fiscalYear === fiscalYear && f.monthKey === latest);
  return FPA_CAMPUSES.map(campus => {
    const row = { campus };
    for (const name of EXPENSE_NORMALIZED_NAMES) {
      row[name] = sumByPredicate(slice, "ytdAmount",
        f => f.campus === campus && f.normalizedName === name);
    }
    row.total = EXPENSE_NORMALIZED_NAMES.reduce((s, n) => s + (row[n] || 0), 0);
    return row;
  }).filter(r => r.total > 0);
}

// ── Report 5: Monthly Labor Expense — multi-series by campus (13-month) ──────
export function laborExpenseByCampusByMonth(facts, endMonthKey = null) {
  return seriesByCampusByMonth(facts, LABOR_EXPENSE_NAMES, endMonthKey);
}

// ── Report 6: Monthly Cost of Sales — multi-series by campus (13-month) ──────
export function costOfSalesByCampusByMonth(facts, endMonthKey = null) {
  return seriesByCampusByMonth(facts, COST_OF_SALES_NAMES, endMonthKey);
}

function seriesByCampusByMonth(facts, normalizedNames, endMonthKey) {
  const keys = trailing13MonthKeys(facts, endMonthKey);
  return keys.map(key => {
    const slice = facts.filter(f => f.monthKey === key && normalizedNames.includes(f.normalizedName));
    const [y, m] = key.split("-").map(Number);
    const row = { monthKey: key, label: monthLabelFor(y, m) };
    for (const campus of FPA_CAMPUSES) {
      row[campus] = slice
        .filter(f => f.campus === campus)
        .reduce((s, f) => s + (f.mtdAmount || 0), 0);
    }
    return row;
  });
}

// ── Report 7: Expense type as % of total revenue (FYTD horizontal bar) ───────
export function expenseTypeAsPctOfRevenue(facts, fiscalYear, anchorMonthKey = null) {
  const latest = anchorMonthKey ?? latestMonthKey(facts, fiscalYear);
  if (!latest) return [];
  const slice = facts.filter(f => f.fiscalYear === fiscalYear && f.monthKey === latest);
  const totalRev = ytdRevenue(slice);
  if (totalRev === 0) return EXPENSE_NORMALIZED_NAMES.map(name => ({ name, amount: 0, pct: 0 }));
  return EXPENSE_NORMALIZED_NAMES.map(name => {
    const amount = sumByPredicate(slice, "ytdAmount", f => f.normalizedName === name);
    return {
      name,
      amount,
      pct: totalRev > 0 ? (amount / totalRev) * 100 : 0,
    };
  });
}

// ── Report 8: Monthly Support Level — FYTD months, single series ─────────────
// ES Admin is excluded: its expenses roll up elsewhere and shouldn't hit the
// General Fund support level.
export function monthlySupportLevel(facts, fiscalYear) {
  const monthKeys = listMonthKeysForFY(facts, fiscalYear);
  return monthKeys.map(key => {
    const slice = facts.filter(f => f.monthKey === key && f.campus !== "ES Admin");
    const revenue = sumByPredicate(slice, "mtdAmount",
      f => REVENUE_NORMALIZED_NAMES.includes(f.normalizedName));
    const expense = sumByPredicate(slice, "mtdAmount",
      f => EXPENSE_NORMALIZED_NAMES.includes(f.normalizedName));
    const [y, m] = key.split("-").map(Number);
    return {
      monthKey: key,
      label: monthLabelFor(y, m),
      supportLevel: expense - revenue,
      fiscalMonthNumber: fiscalMonthNumberFor(m),
    };
  }).sort((a, b) => a.fiscalMonthNumber - b.fiscalMonthNumber);
}

// FYTD total support level through the latest uploaded month (ES Admin excluded).
export function supportLevelFYTD(facts, fiscalYear) {
  const latest = latestMonthKey(facts, fiscalYear);
  if (!latest) return 0;
  const slice = facts.filter(f =>
    f.fiscalYear === fiscalYear &&
    f.monthKey === latest &&
    f.campus !== "ES Admin"
  );
  const revenue = sumByPredicate(slice, "ytdAmount",
    f => REVENUE_NORMALIZED_NAMES.includes(f.normalizedName));
  const expense = sumByPredicate(slice, "ytdAmount",
    f => EXPENSE_NORMALIZED_NAMES.includes(f.normalizedName));
  return expense - revenue;
}

// ── Fiscal year helper for the UI ────────────────────────────────────────────
export function deriveFiscalYearsFromFacts(facts) {
  return listFiscalYears(facts);
}

export function defaultFiscalYearFromFacts(facts) {
  const years = listFiscalYears(facts);
  if (years.length > 0) return years[years.length - 1];
  // Fall back to current FY based on today's date.
  const now = new Date();
  return fiscalYearFor(now.getFullYear(), now.getMonth() + 1);
}
