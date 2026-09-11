// src/utils/cafeVolume.js
// Aggregates daily_metrics POS documents into the per-month café volume block
// used by the agent export. Kept free of Firebase imports so it can be tested
// directly; fpaExport.js supplies the documents.

export const VOLUME_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

// Payroll-deduct sales are tendered at 85% of menu price, so the 15% employee
// discount is charge × 15/85 — but only on the menu price. The payroll tender
// recorded by the POS is what was charged in full, sales tax included, and the
// discount never applied to the tax. Applying 15/85 to the whole tender
// therefore overstates the discount by the tax share, about 9% here, so the
// tender is put back on a pre-tax footing first.
//
// On a $10 item: charged $8.50 plus $0.75 tax = $9.25 tendered. The discount is
// $1.50, not the $1.63 that $9.25 × 15/85 gives.
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
 * Traffic follows the same rule as payroll: a period doc states the month's
 * own totals, so it replaces the daily docs rather than adding to them. Summing
 * both double-counts every check and dollar in a month that has each — which is
 * exactly what happens when a month uploaded daily later gets its period
 * workbook filed to recover the payroll the dailies never carried.
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
        period_net_revenue: null,
        period_total_checks: null,
        daily_net_revenue: 0,
        daily_total_checks: 0,
        period_total_taxes: null,
        daily_total_taxes: null,
        period_payroll: null,
        daily_payroll: null,
        daily_docs: 0,
        daily_docs_with_payroll: 0,
        daily_docs_with_taxes: 0,
      };
    }
    const acc = accum[monthKey][doc.campus];
    if (doc.report_type === "period") {
      acc.period_net_revenue = (acc.period_net_revenue ?? 0) + (doc.net_revenue ?? 0);
      acc.period_total_checks = (acc.period_total_checks ?? 0) + (doc.total_checks ?? 0);
      if (doc.total_taxes != null) acc.period_total_taxes = (acc.period_total_taxes ?? 0) + doc.total_taxes;
      if (doc.payroll != null) acc.period_payroll = (acc.period_payroll ?? 0) + doc.payroll;
    } else {
      acc.daily_net_revenue += doc.net_revenue ?? 0;
      acc.daily_total_checks += doc.total_checks ?? 0;
      acc.daily_docs += 1;
      if (doc.total_taxes != null) {
        acc.daily_docs_with_taxes += 1;
        acc.daily_total_taxes = (acc.daily_total_taxes ?? 0) + doc.total_taxes;
      }
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
export function resolveTraffic(v) {
  // Only a period doc that actually reports traffic replaces the dailies. One
  // that carries a payroll figure and no checks — a tender-only correction —
  // contributes its payroll without blanking the month it belongs to.
  const fromPeriod = (v.period_total_checks ?? 0) > 0;
  return fromPeriod
    ? {
        total_checks: v.period_total_checks ?? 0,
        net_revenue: v.period_net_revenue ?? 0,
        source: "period",
      }
    : {
        total_checks: v.daily_total_checks,
        net_revenue: v.daily_net_revenue,
        source: "daily",
      };
}

/**
 * The effective sales-tax rate for a campus-month, as the POS reported it.
 *
 * Derived from the month's own figures rather than configured, so it follows a
 * rate change on its own. Taken from whichever source supplied the traffic, so
 * the tax and the revenue it is divided by always describe the same reporting
 * period. Null when the tax was not recorded — parsePdf cannot read the TAXES
 * section, so a PDF-sourced month has none (it has no payroll either, for the
 * same reason: the tender section it would come from is equally unreadable).
 *
 * This assumes payroll-deduct purchases carry the same taxable mix as the rest
 * of the month's sales, which is the best the aggregates support: the POS does
 * not break tax out per tender.
 */
export function resolveTaxRate(v, traffic) {
  const taxes = traffic.source === "period"
    ? v.period_total_taxes
    : (v.daily_docs > 0 && v.daily_docs_with_taxes === v.daily_docs ? v.daily_total_taxes : null);
  if (taxes == null || !(traffic.net_revenue > 0)) return null;
  return taxes / traffic.net_revenue;
}

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
  let recordedPretax = 0;
  const campusesMissingPayroll = [];
  const campusesMissingTaxRate = [];

  for (const campus of VOLUME_CAMPUSES) {
    const v = monthVol[campus];
    if (!v) continue;
    const traffic = resolveTraffic(v);
    if (traffic.total_checks === 0) continue;
    const { amount, coverage } = resolvePayroll(v);
    const taxRate = resolveTaxRate(v, traffic);

    // The tender less its sales tax — the menu-price side of the charge, which
    // is the only part the 15% discount ever applied to.
    const pretax = amount == null || taxRate == null ? null : amount / (1 + taxRate);

    byCampus[campus] = {
      total_checks: traffic.total_checks,
      avg_check: traffic.net_revenue / traffic.total_checks,
      payroll_deduct_sales: amount,
      payroll_deduct_sales_pretax: pretax,
      payroll_tax_rate: taxRate,
      payroll_discount: pretax == null ? null : pretax * PAYROLL_DISCOUNT_RATE,
      payroll_coverage: coverage,
    };
    allRevenue += traffic.net_revenue;
    allChecks += traffic.total_checks;
    if (amount == null) {
      campusesMissingPayroll.push(campus);
      recordedSales += coverage.recorded_sales ?? 0;
    } else {
      recordedSales += amount;
      if (pretax == null) campusesMissingTaxRate.push(campus);
      else recordedPretax += pretax;
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

  // The discount needs the tax rate as well as the payroll, so a month can have
  // a complete tender total and still no computable discount. Saying which is
  // missing keeps the two from being read as one failure.
  const discountable = complete && campusesMissingTaxRate.length === 0;

  return {
    by_campus: byCampus,
    totals: {
      total_checks: allChecks,
      avg_check: allChecks > 0 ? allRevenue / allChecks : null,
      payroll_deduct_sales: complete ? recordedSales : null,
      payroll_deduct_sales_pretax: discountable ? recordedPretax : null,
      payroll_discount: discountable ? recordedPretax * PAYROLL_DISCOUNT_RATE : null,
      payroll_coverage: coverage,
      payroll_tax_basis: discountable
        ? { status: "tax_excluded" }
        : { status: "unavailable", campuses_missing_tax_rate: campusesMissingTaxRate },
    },
  };
}
