/**
 * Fiscal year helpers shared by every page with a fiscal-year selector.
 *
 * UCAR's fiscal year runs Oct 1 → Sep 30 and is named for the calendar year
 * it ends in: Oct 2025 – Sep 2026 is FY2026 ("FY26").
 *
 * Fiscal-year dropdowns are built from uploaded data, so a new year would not
 * show up until its first upload. fiscalYearOptions() always adds the current
 * fiscal year, so the selectors roll forward on October 1st on their own.
 */

export const FISCAL_START_MONTH = 10; // October

export function fiscalYearFor(calendarYear, calendarMonth) {
  // calendarMonth: 1-12 (Jan=1)
  return calendarMonth >= FISCAL_START_MONTH ? calendarYear + 1 : calendarYear;
}

export function fiscalYearLabel(fiscalYear) {
  return `FY${String(fiscalYear).slice(-2)}`;
}

export function currentFiscalYear(now = new Date()) {
  return fiscalYearFor(now.getFullYear(), now.getMonth() + 1);
}

// Fiscal years found in the data plus the current one, ascending and unique.
export function fiscalYearOptions(dataFiscalYears, now = new Date()) {
  return [...new Set([...dataFiscalYears, currentFiscalYear(now)])].sort((a, b) => a - b);
}
