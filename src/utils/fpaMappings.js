/**
 * FP&A mappings and shared constants.
 *
 * Project and ledger mappings drive the Workday Operating Budget parser and
 * every downstream selector. All four approved projects and twelve mapped
 * ledger rows are defined here; unmapped entries are ignored by design.
 *
 * Benefits combine rule: ledger codes 5051 (Benefits — Applied) and 9989
 * (Final Rate-Full Benefits) both normalize to "Benefits" and are summed by
 * selectors wherever Benefits totals are displayed.
 */

// ── Fiscal year config (UCAR FY runs Oct 1 → Sep 30) ─────────────────────────
export const FISCAL_START_MONTH = 10; // October

// ── Approved projects ────────────────────────────────────────────────────────
// Any row in column A that contains one of these project codes starts a
// project block. Rows outside these blocks are ignored.
export const FPA_PROJECTS = [
  { code: "PRJ004382", campus: "ES Admin",     label: "Event Services"    },
  { code: "PRJ005073", campus: "Mesa Lab",     label: "Food Services ML"  },
  { code: "PRJ005074", campus: "Foothills",    label: "Food Services FL"  },
  { code: "PRJ005075", campus: "Center Green", label: "Food Services CG"  },
];

export const FPA_CAMPUSES = FPA_PROJECTS.map(p => p.campus);

// ── Ledger mapping table ─────────────────────────────────────────────────────
// category: "Revenue" | "Expense" | "Tax"
// Sales Tax is category "Tax" but is included in the revenue bucket by selectors.
export const FPA_LEDGERS = [
  { code: "4313", sourceLabel: "4313:Miscellaneous Sales",          normalizedName: "Cafe Sales Revenue",    category: "Revenue" },
  { code: "4314", sourceLabel: "4314:Sales Tax Collected",          normalizedName: "Sales Tax",             category: "Tax"     },
  { code: "4320", sourceLabel: "4320:Other Non Government Income",  normalizedName: "External Event Revenue",category: "Revenue" },
  { code: "4325", sourceLabel: "4325:Other Miscellaneous Revenue",  normalizedName: "Cafe Revenue",          category: "Revenue" },
  { code: "9990", sourceLabel: "9990:Internal Chargeback Revenue",  normalizedName: "Internal Event Revenue",category: "Revenue" },
  { code: "5001", sourceLabel: "5001:Salaries",                     normalizedName: "Salaries",              category: "Expense" },
  { code: "5051", sourceLabel: "5051:Benefits - Applied",           normalizedName: "Benefits",              category: "Expense" },
  { code: "7000", sourceLabel: "7000:Materials and Supplies",       normalizedName: "Materials",             category: "Expense" },
  { code: "7500", sourceLabel: "7500:Purchased Services",           normalizedName: "Services",              category: "Expense" },
  { code: "7750", sourceLabel: "7750:Taxes, fines and penalties",   normalizedName: "Taxes",                 category: "Expense" },
  { code: "9350", sourceLabel: "9350:Depreciation Expense",         normalizedName: "Depreciation",          category: "Expense" },
  { code: "9989", sourceLabel: "9989:Final Rate-Full Benefits",     normalizedName: "Benefits",              category: "Expense" },
];

export const FPA_LEDGER_BY_CODE = Object.fromEntries(FPA_LEDGERS.map(l => [l.code, l]));

// ── Bucket definitions (used by selectors) ───────────────────────────────────
// Revenue bucket includes Sales Tax per FP&A handoff.
export const REVENUE_NORMALIZED_NAMES = [
  "Cafe Sales Revenue",
  "Sales Tax",
  "External Event Revenue",
  "Cafe Revenue",
  "Internal Event Revenue",
];

export const EXPENSE_NORMALIZED_NAMES = [
  "Salaries",
  "Benefits",
  "Materials",
  "Services",
  "Taxes",
  "Depreciation",
];

export const LABOR_EXPENSE_NAMES = ["Salaries", "Benefits"];
export const COST_OF_SALES_NAMES = ["Materials"];

// ── Fiscal-month ordering (Oct=1 … Sep=12) ───────────────────────────────────
export function fiscalMonthNumberFor(calendarMonth) {
  // calendarMonth: 1-12 (Jan=1)
  return ((calendarMonth - FISCAL_START_MONTH + 12) % 12) + 1;
}

export function fiscalYearFor(calendarYear, calendarMonth) {
  // UCAR FY label = calendar year containing the fiscal year-end (Sep).
  // Oct 2025 → Sep 2026 = FY2026
  return calendarMonth >= FISCAL_START_MONTH ? calendarYear + 1 : calendarYear;
}

export function fiscalYearLabel(fiscalYear) {
  return `FY${String(fiscalYear).slice(-2)}`;
}

export function monthKeyFor(calendarYear, calendarMonth) {
  return `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`;
}

export function monthLabelFor(calendarYear, calendarMonth) {
  return new Date(calendarYear, calendarMonth - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function campusSlug(campus) {
  return campus.replace(/\s+/g, "_");
}

export function fpaFactDocId(monthKey, campus, ledgerCode) {
  return `fpa_${monthKey}_${campusSlug(campus)}_${ledgerCode}`;
}
