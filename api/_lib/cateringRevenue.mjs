/**
 * Catering revenue rollup — pure mapping logic.
 *
 * Separated from the handler so the mapping is unit tested without Firestore
 * (test/catering-revenue.test.mjs).
 *
 * Design notes (decisions recorded 2026-07-28, see docs/catering/PHASES.md):
 *
 * - Catering rollups are TAGGED `source: "catering"` and carry a deterministic
 *   document ID. The existing Event Revenue view sums every document in
 *   `event_revenue`, and the uploaded Internal/External spreadsheets already
 *   include catering, so these rows are excluded from that view by default.
 *
 * - One entry per event. `event_revenue` has no project dimension, so a
 *   multi-project ("split payment") event is rolled up once with every project
 *   ID recorded for traceability; allocation stays a finance-side concern.
 *
 * - The document ID is derived from the event ID, which makes the write
 *   idempotent by construction: re-confirming or re-closing overwrites in place
 *   instead of adding a second row. This is deliberately NOT the accumulating
 *   transaction the spreadsheet importer uses — that one is additive because
 *   each upload carries new totals.
 */

export const CATERING_REVENUE_SOURCE = "catering";

// Must match isValidCampus() in firestore.rules.
export const VALID_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

const BUILDING_CAMPUS = {
  ML: "Mesa Lab",
  CG1: "Center Green", CG2: "Center Green",
  FL0: "Foothills", FL1: "Foothills", FL2: "Foothills",
  FL3: "Foothills", FL4: "Foothills", FLA: "Foothills",
};

/**
 * Resolve the campus server-side from buildingId rather than trusting the
 * event's denormalized `campus` field, which is client-writable.
 */
export function resolveCampus(event) {
  const fromBuilding = BUILDING_CAMPUS[String(event?.buildingId ?? "").toUpperCase()];
  if (fromBuilding) return fromBuilding;
  // Fall back to the stored value only if it is one of the accepted campuses.
  return VALID_CAMPUSES.includes(event?.campus) ? event.campus : null;
}

/** project_id → internal; ach_external → external. */
export function revenueTypeFor(paymentMethod) {
  if (paymentMethod === "project_id") return "internal";
  if (paymentMethod === "ach_external") return "external";
  return null;
}

/**
 * The amount to roll up: actual once known, otherwise the estimate.
 * Returns null when neither is a usable number.
 */
export function revenueAmountFor(event) {
  for (const value of [event?.actualRevenue, event?.estimatedRevenue]) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
}

/** The month an event's revenue belongs to, taken from its start date. */
export function monthPartsFor(event) {
  const match = String(event?.startDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month, monthKey: `${match[1]}-${match[2]}` };
}

/** Deterministic — the same event always maps to the same document. */
export function revenueDocId(eventId) {
  return `eventrev_catering_${eventId}`;
}

/**
 * Build the event_revenue document for a catering event, or explain why it
 * cannot be rolled up yet.
 *
 * @returns {{ ok: true, docId: string, data: object } | { ok: false, reason: string }}
 */
export function buildRevenueDoc(event) {
  if (!event?.id) return { ok: false, reason: "event has no id" };

  // Only confirmed or closed events contribute revenue. A submitted request is
  // still a proposal and a cancelled one never happened.
  if (!["confirmed"].includes(event.requestStatus)) {
    return { ok: false, reason: `requestStatus is "${event.requestStatus}", not confirmed` };
  }

  const type = revenueTypeFor(event.paymentMethod);
  if (!type) return { ok: false, reason: `unmapped paymentMethod "${event.paymentMethod ?? ""}"` };

  const campus = resolveCampus(event);
  if (!campus) return { ok: false, reason: `cannot resolve campus from building "${event.buildingId ?? ""}"` };

  const months = monthPartsFor(event);
  if (!months) return { ok: false, reason: `invalid startDate "${event.startDate ?? ""}"` };

  const revenue = revenueAmountFor(event);
  if (revenue === null) return { ok: false, reason: "no estimated or actual revenue recorded" };

  return {
    ok: true,
    docId: revenueDocId(event.id),
    data: {
      campus,
      year: months.year,
      month: months.month,
      monthKey: months.monthKey,
      type,
      revenue,
      // Provenance. `source` is what the Event Revenue view filters on so these
      // rows do not double-count against the uploaded spreadsheet totals.
      source: CATERING_REVENUE_SOURCE,
      sourceEventId: event.id,
      eventName: event.eventName ?? "",
      // Recorded for traceability. Splitting across projects is deliberately
      // not attempted — event_revenue has no project dimension.
      projectIds: Array.isArray(event.projectIds) ? event.projectIds : [],
      isEstimate: event.actualRevenue === null || event.actualRevenue === undefined || event.actualRevenue === "",
    },
  };
}

/**
 * True when an event should have no revenue row at all — cancelled, or moved
 * back out of confirmed. The handler deletes any existing row in that case, so
 * un-confirming an event withdraws its revenue rather than stranding it.
 */
export function shouldRemoveRevenue(event) {
  return event?.requestStatus !== "confirmed";
}
