import test from "node:test";
import assert from "node:assert/strict";

import {
  CATERING_REVENUE_SOURCE, buildRevenueDoc, monthPartsFor, resolveCampus,
  revenueAmountFor, revenueDocId, revenueTypeFor, shouldRemoveRevenue,
} from "../api/_lib/cateringRevenue.mjs";

function confirmedEvent(overrides = {}) {
  return {
    id: "evt123",
    eventName: "CESM Workshop",
    requestStatus: "confirmed",
    lifecycleStatus: "open",
    paymentMethod: "project_id",
    buildingId: "CG1",
    campus: "Center Green",
    startDate: "2026-09-14",
    estimatedRevenue: 4200,
    projectIds: ["PRJ001", "PRJ002"],
    ...overrides,
  };
}

// ── Type mapping ─────────────────────────────────────────────────────────────

test("payment method maps to the existing event_revenue type contract", () => {
  assert.equal(revenueTypeFor("project_id"), "internal");
  assert.equal(revenueTypeFor("ach_external"), "external");
  assert.equal(revenueTypeFor(""), null);
  assert.equal(revenueTypeFor(undefined), null);
  assert.equal(revenueTypeFor("cash"), null);
});

// ── Campus ───────────────────────────────────────────────────────────────────

test("campus is resolved server-side from buildingId, not the stored value", () => {
  // The event's `campus` field is client-writable, so a mismatched value must
  // not win over the building mapping.
  assert.equal(resolveCampus({ buildingId: "ML", campus: "Foothills" }), "Mesa Lab");
  assert.equal(resolveCampus({ buildingId: "CG2" }), "Center Green");
  assert.equal(resolveCampus({ buildingId: "fla" }), "Foothills");
});

test("campus falls back to a valid stored value when the building is unknown", () => {
  assert.equal(resolveCampus({ buildingId: "", campus: "Mesa Lab" }), "Mesa Lab");
  assert.equal(resolveCampus({ buildingId: "ZZ9", campus: "Foothills" }), "Foothills");
  assert.equal(resolveCampus({ buildingId: "ZZ9", campus: "Narnia" }), null);
  assert.equal(resolveCampus({}), null);
});

// ── Amount ───────────────────────────────────────────────────────────────────

test("actual revenue wins over the estimate", () => {
  assert.equal(revenueAmountFor({ estimatedRevenue: 100, actualRevenue: 250 }), 250);
  assert.equal(revenueAmountFor({ estimatedRevenue: 100 }), 100);
  assert.equal(revenueAmountFor({ estimatedRevenue: 100, actualRevenue: null }), 100);
  assert.equal(revenueAmountFor({ estimatedRevenue: 100, actualRevenue: "" }), 100);
});

test("a zero actual amount is respected rather than falling back", () => {
  assert.equal(revenueAmountFor({ estimatedRevenue: 500, actualRevenue: 0 }), 0);
});

test("amounts are rounded to cents and junk is rejected", () => {
  assert.equal(revenueAmountFor({ actualRevenue: 1234.567 }), 1234.57);
  assert.equal(revenueAmountFor({ actualRevenue: "2500.50" }), 2500.5);
  assert.equal(revenueAmountFor({ actualRevenue: "TBD" }), null);
  assert.equal(revenueAmountFor({}), null);
});

// ── Month ────────────────────────────────────────────────────────────────────

test("month parts come from the event start date", () => {
  assert.deepEqual(monthPartsFor({ startDate: "2026-09-14" }),
    { year: 2026, month: 9, monthKey: "2026-09" });
  assert.deepEqual(monthPartsFor({ startDate: "2026-12-01" }),
    { year: 2026, month: 12, monthKey: "2026-12" });
});

test("an unparseable or impossible start date yields no month", () => {
  assert.equal(monthPartsFor({ startDate: "" }), null);
  assert.equal(monthPartsFor({ startDate: "9/14/2026" }), null);
  assert.equal(monthPartsFor({ startDate: "2026-13-01" }), null);
  assert.equal(monthPartsFor({}), null);
});

// ── Document identity ────────────────────────────────────────────────────────

test("the document ID is deterministic, which is what makes the write idempotent", () => {
  assert.equal(revenueDocId("evt123"), "eventrev_catering_evt123");
  assert.equal(revenueDocId("evt123"), revenueDocId("evt123"));
  assert.notEqual(revenueDocId("evt123"), revenueDocId("evt124"));
});

// ── Building the document ────────────────────────────────────────────────────

test("a confirmed internal event produces a correctly-typed entry", () => {
  const result = buildRevenueDoc(confirmedEvent());
  assert.equal(result.ok, true);
  assert.equal(result.docId, "eventrev_catering_evt123");
  assert.deepEqual(result.data, {
    campus: "Center Green",
    year: 2026,
    month: 9,
    monthKey: "2026-09",
    type: "internal",
    revenue: 4200,
    source: "catering",
    sourceEventId: "evt123",
    eventName: "CESM Workshop",
    projectIds: ["PRJ001", "PRJ002"],
    isEstimate: true,
  });
});

test("an ACH event is typed external", () => {
  const result = buildRevenueDoc(confirmedEvent({ paymentMethod: "ach_external" }));
  assert.equal(result.data.type, "external");
});

test("a split-payment event produces ONE entry carrying every project ID", () => {
  const result = buildRevenueDoc(confirmedEvent({
    projectIds: ["PRJ001", "PRJ002", "PRJ003"],
    actualRevenue: 9000,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.revenue, 9000, "revenue is not divided across projects");
  assert.deepEqual(result.data.projectIds, ["PRJ001", "PRJ002", "PRJ003"]);
});

test("recording an actual amount clears the estimate flag", () => {
  assert.equal(buildRevenueDoc(confirmedEvent()).data.isEstimate, true);
  assert.equal(buildRevenueDoc(confirmedEvent({ actualRevenue: 3900 })).data.isEstimate, false);
});

test("every rollup is tagged so the Event Revenue view can exclude it", () => {
  assert.equal(buildRevenueDoc(confirmedEvent()).data.source, CATERING_REVENUE_SOURCE);
});

// ── Refusals ─────────────────────────────────────────────────────────────────

test("an unconfirmed event is not rolled up", () => {
  for (const status of ["submitted", "draft", "cancelled"]) {
    const result = buildRevenueDoc(confirmedEvent({ requestStatus: status }));
    assert.equal(result.ok, false, `${status} must not roll up`);
    assert.match(result.reason, /not confirmed/);
  }
});

test("an event with no amount is skipped rather than written as zero", () => {
  const result = buildRevenueDoc(
    confirmedEvent({ estimatedRevenue: null, actualRevenue: null })
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /no estimated or actual revenue/);
});

test("an unmapped payment method is refused", () => {
  const result = buildRevenueDoc(confirmedEvent({ paymentMethod: "" }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /unmapped paymentMethod/);
});

test("an unresolvable campus is refused rather than guessed", () => {
  const result = buildRevenueDoc(confirmedEvent({ buildingId: "ZZ9", campus: null }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /cannot resolve campus/);
});

test("an invalid start date is refused", () => {
  const result = buildRevenueDoc(confirmedEvent({ startDate: "" }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /invalid startDate/);
});

test("an event with no id is refused", () => {
  assert.equal(buildRevenueDoc({}).ok, false);
  assert.equal(buildRevenueDoc(null).ok, false);
});

// ── Withdrawal ───────────────────────────────────────────────────────────────

test("revenue is withdrawn when an event is no longer confirmed", () => {
  assert.equal(shouldRemoveRevenue({ requestStatus: "cancelled" }), true);
  assert.equal(shouldRemoveRevenue({ requestStatus: "submitted" }), true);
  assert.equal(shouldRemoveRevenue({ requestStatus: "confirmed" }), false);
});

test("closing a confirmed event keeps its revenue", () => {
  const closed = confirmedEvent({ lifecycleStatus: "closed", actualRevenue: 3800 });
  assert.equal(shouldRemoveRevenue(closed), false);
  assert.equal(buildRevenueDoc(closed).data.revenue, 3800);
});
