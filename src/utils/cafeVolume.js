// src/utils/cafeVolume.js
// Aggregates daily_metrics POS documents into the per-month café volume block
// used by the agent export. Kept free of Firebase imports so it can be tested
// directly; fpaExport.js supplies the documents.

export const VOLUME_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

// Payroll-deduct sales are tendered at 85% of menu price — the 15% employee
// discount is the difference between the full price and what was charged, so
// discount = charge × 15/85. The Payroll Discount card on Cafe Sales applies
// the same rate, but reads through PAYROLL_BASELINES in Dashboard.jsx, so the
// two only agree once daily_metrics carries the full payroll history.
export const PAYROLL_DISCOUNT_RATE = 15 / 85;

export function resolveMonthKey(date) {
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

/**
 * daily_metrics → accum[monthKey][campus].
 *
 * Payroll (the payroll-deduct tender total) is tracked per report_type the way
 * the Cafe Sales tab does it: a month-end "period" doc carries the authoritative
 * figure for its month, and the daily docs are summed as the fallback for months
 * with no period doc or with a period doc whose payroll came through null.
 *
 * A daily doc whose payroll is null contributes nothing to the sum and is
 * counted separately. The parser writes null when it cannot read the TENDERS
 * section — PDF uploads never yield one — and that is not the same fact as a
 * day on which no one paid by payroll deduct. Summing `payroll ?? 0` erases the
 * difference, so the counts below are what let resolvePayroll refuse to report
 * an incomplete month as a total.
 */
export function buildVolumeAccum(dailyMetrics) {
  const accum = {};
  for (const doc of dailyMetrics) {
    if (!VOLUME_CAMPUSES.includes(doc.campus)) continue;
    const monthKey = resolveMonthKey(doc.date);
    if (!monthKey) continue;
    if (!accum[monthKey]) accum[monthKey] = {};
    if (!accum[monthKey][doc.campus]) {
      accum[monthKey][doc.campus] = {
        net_revenue: 0,
        total_checks: 0,
        period_payroll: null,
        daily_payroll: null,
        daily_docs: 0,
        daily_docs_with_payroll: 0,
      };
    }
    const acc = accum[monthKey][doc.campus];
    acc.net_revenue += doc.net_revenue ?? 0;
    acc.total_checks += doc.total_checks ?? 0;
    if (doc.report_type === "period") {
      if (doc.payroll != null) acc.period_payroll = (acc.period_payroll ?? 0) + doc.payroll;
    } else {
      acc.daily_docs += 1;
      if (doc.payroll != null) {
        acc.daily_docs_with_payroll += 1;
        acc.daily_payroll = (acc.daily_payroll ?? 0) + doc.payroll;
      }
    }
  }
  return accum;
}

/**
 * What one campus-month's payroll figure is, and how much of it was recorded.
 *
 * `amount` is null whenever the month was not fully recorded. The 15% payroll-
 * deduct discount is a long-standing program, so any month with café activity
 * has payroll-deduct sales; a gap is a gap in the uploaded reports, never a
 * month in which the discount was not offered. Reporting a partial sum as the
 * month's total would understate it in a way nothing downstream could detect,
 * so the partial stays in `recorded_sales` where it cannot be mistaken for one.
 */
export function resolvePayroll(v) {
  if (v.period_payroll != null) {
    return { amount: v.period_payroll, coverage: { status: "period" } };
  }
  if (v.daily_docs_with_payroll === 0) {
    return {
      amount: null,
      coverage: {
        status: "missing",
        days_with_payroll: 0,
        days_reported: v.daily_docs,
      },
    };
  }
  if (v.daily_docs_with_payroll < v.daily_docs) {
    return {
      amount: null,
      coverage: {
        status: "partial",
        days_with_payroll: v.daily_docs_with_payroll,
        days_reported: v.daily_docs,
        recorded_sales: v.daily_payroll,
      },
    };
  }
  return {
    amount: v.daily_payroll,
    coverage: {
      status: "daily",
      days_with_payroll: v.daily_docs_with_payroll,
      days_reported: v.daily_docs,
    },
  };
}

export function buildCafeVolume(accum, monthKey) {
  const monthVol = accum[monthKey];
  if (!monthVol) return null;

  const byCampus = {};
  let allRevenue = 0;
  let allChecks = 0;
  let recordedSales = 0;
  const campusesMissingPayroll = [];

  for (const campus of VOLUME_CAMPUSES) {
    const v = monthVol[campus];
    if (!v || v.total_checks === 0) continue;
    const { amount, coverage } = resolvePayroll(v);
    byCampus[campus] = {
      total_checks: v.total_checks,
      avg_check: v.net_revenue / v.total_checks,
      payroll_deduct_sales: amount,
      payroll_discount: amount == null ? null : amount * PAYROLL_DISCOUNT_RATE,
      payroll_coverage: coverage,
    };
    allRevenue += v.net_revenue;
    allChecks += v.total_checks;
    if (amount == null) {
      campusesMissingPayroll.push(campus);
      recordedSales += coverage.recorded_sales ?? 0;
    } else {
      recordedSales += amount;
    }
  }

  if (Object.keys(byCampus).length === 0) return null;

  // A month total is only a total when every café that traded reported its
  // payroll. Otherwise it is null and the campuses responsible are named.
  const complete = campusesMissingPayroll.length === 0;
  const coverage = complete
    ? { status: "complete" }
    : {
        status: campusesMissingPayroll.length === Object.keys(byCampus).length
          ? "missing"
          : "partial",
        campuses_missing_payroll: campusesMissingPayroll,
        recorded_sales: recordedSales,
      };

  return {
    by_campus: byCampus,
    totals: {
      total_checks: allChecks,
      avg_check: allChecks > 0 ? allRevenue / allChecks : null,
      payroll_deduct_sales: complete ? recordedSales : null,
      payroll_discount: complete ? recordedSales * PAYROLL_DISCOUNT_RATE : null,
      payroll_coverage: coverage,
    },
  };
}
