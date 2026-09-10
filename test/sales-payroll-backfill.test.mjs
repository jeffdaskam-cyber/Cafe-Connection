/**
 * Selection and matching rules for the payroll backfill.
 *
 * These decide which production documents get written and which archived
 * report each one is filled from, so they are pinned here rather than left to
 * a dry run to reveal.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  campusFromObjectName, classifyGap, dayKey, groupReportsBySourceFile,
  matchesDocument, needsCreditCardBackfill, needsPayrollBackfill,
  sourceFileFromObjectName, uploadedAtFromObjectName,
} from "../scripts/lib/salesPayroll.mjs";

test("an absent payroll field and an explicit null both count as missing", () => {
  // Written before the parser read the TENDERS section.
  assert.equal(needsPayrollBackfill({ campus: "Mesa Lab" }), true);
  // Every PDF upload: parsePdf returns payroll: null and the handler stores it.
  assert.equal(needsPayrollBackfill({ campus: "Mesa Lab", payroll: null }), true);
});

test("a real zero is a day with no payroll-deduct sales, not a gap", () => {
  assert.equal(needsPayrollBackfill({ campus: "Foothills", payroll: 0 }), false);
  assert.equal(needsPayrollBackfill({ campus: "Foothills", payroll: 1234.5 }), false);
});

test("campuses outside the cafes are left alone", () => {
  // ES Admin carries no POS payroll-deduct tender.
  assert.equal(needsPayrollBackfill({ campus: "ES Admin", payroll: null }), false);
  assert.equal(needsPayrollBackfill({ payroll: null }), false);
});

test("an absent credit_card field and an explicit null both count as missing", () => {
  // Written before the parser read the TENDERS section.
  assert.equal(needsCreditCardBackfill({ campus: "Center Green" }), true);
  // A PDF upload, an unreadable TENDERS section, or — before the parser drew
  // the distinction — a day that simply took no card payment.
  assert.equal(needsCreditCardBackfill({ campus: "Center Green", credit_card: null }), true);
});

test("a real zero is a day with no card tenders, not a gap", () => {
  // This is the whole point of the parser fix: once a genuine 0 is recorded as
  // 0, re-running the backfill must leave it alone rather than rewrite it.
  assert.equal(needsCreditCardBackfill({ campus: "Center Green", credit_card: 0 }), false);
  assert.equal(needsCreditCardBackfill({ campus: "Mesa Lab", credit_card: 3861 }), false);
});

test("credit_card gaps are scoped to the cafe campuses too", () => {
  assert.equal(needsCreditCardBackfill({ campus: "ES Admin", credit_card: null }), false);
  assert.equal(needsCreditCardBackfill({ credit_card: null }), false);
});

test("the upload timestamp prefix is stripped to recover source_file", () => {
  assert.equal(
    sourceFileFromObjectName("reports/Mesa_Lab/1756915200000_Daily Sales 9-3-26.xlsx"),
    "Daily Sales 9-3-26.xlsx"
  );
  // A name with underscores of its own keeps them.
  assert.equal(
    sourceFileFromObjectName("reports/Center_Green/1756915200000_period_report_aug.xlsx"),
    "period_report_aug.xlsx"
  );
  // No timestamp prefix — take the basename as-is.
  assert.equal(sourceFileFromObjectName("reports/Foothills/legacy.xlsx"), "legacy.xlsx");
  assert.equal(uploadedAtFromObjectName("reports/Mesa_Lab/1757001600000_Daily.xlsx"), 1757001600000);
  assert.equal(uploadedAtFromObjectName("reports/Mesa_Lab/legacy.xlsx"), 0);
});

test("the upload folder recovers the campus", () => {
  assert.equal(campusFromObjectName("reports/Center_Green/1_Daily.xlsx"), "Center Green");
  assert.equal(campusFromObjectName("reports/Mesa_Lab/1_Daily.xlsx"), "Mesa Lab");
  assert.equal(campusFromObjectName("reports/Unknown_Place/1_Daily.xlsx"), null);
  assert.equal(campusFromObjectName("Daily.xlsx"), null);
});

test("every report sharing a source_file is kept, newest first", () => {
  // The InfoGenesis export carries one recurring name, so a whole run of days
  // across campuses shares a single source_file. Collapsing them to the newest
  // object would reparse one day's file for every document that shares its name.
  const groups = groupReportsBySourceFile([
    "reports/Mesa_Lab/1756915200000_Daily.xlsx",
    "reports/Foothills/1757001600000_Daily.xlsx",
    "reports/Mesa_Lab/1756828800000_Daily.xlsx",
    "reports/Center_Green/1756742400000_Weekly.xlsx",
  ]);
  assert.deepEqual(groups.get("Daily.xlsx"), [
    "reports/Foothills/1757001600000_Daily.xlsx",
    "reports/Mesa_Lab/1756915200000_Daily.xlsx",
    "reports/Mesa_Lab/1756828800000_Daily.xlsx",
  ]);
  assert.deepEqual(groups.get("Weekly.xlsx"), ["reports/Center_Green/1756742400000_Weekly.xlsx"]);
});

test("gaps that cannot be filled are classified rather than guessed at", () => {
  const doc = { source_file: "Daily.xlsx" };
  assert.equal(classifyGap(doc, ["reports/Mesa_Lab/1_Daily.xlsx"]), null);
  assert.equal(classifyGap({}, ["reports/Mesa_Lab/1_Daily.xlsx"]), "no-source-file");
  assert.equal(classifyGap(doc, []), "file-not-in-storage");
  // PDFs have no readable TENDERS section — re-uploading as .xlsx is the fix.
  assert.equal(classifyGap(doc, ["reports/Mesa_Lab/1_Daily.pdf"]), "not-excel");
  // One Excel among PDFs is still usable.
  assert.equal(
    classifyGap(doc, ["reports/Mesa_Lab/1_Daily.pdf", "reports/Mesa_Lab/2_Daily.xlsx"]),
    null
  );
});

test("a report must agree on day, campus and totals before it supplies payroll", () => {
  const doc = { campus: "Mesa Lab", net_revenue: 2090, total_checks: 200 };
  const metrics = {
    date: "2026-09-03", detectedCampus: "Mesa Lab", net_revenue: 2090, total_checks: 200,
  };
  const opts = { docDate: "2026-09-03", objectCampus: "Mesa Lab" };
  assert.equal(matchesDocument(doc, metrics, opts), true);

  // Another day's report — the case a shared source_file used to produce.
  assert.equal(
    matchesDocument(doc, { ...metrics, date: "2026-09-04" }, opts), false
  );
  // Another campus's report, even with identical totals.
  assert.equal(
    matchesDocument(doc, { ...metrics, detectedCampus: "Foothills" },
      { docDate: "2026-09-03", objectCampus: "Foothills" }), false
  );
  // Totals that disagree mean the document was written from something else.
  assert.equal(matchesDocument(doc, { ...metrics, net_revenue: 2091 }, opts), false);
  assert.equal(matchesDocument(doc, { ...metrics, total_checks: 201 }, opts), false);
  // Sub-cent float drift is not a disagreement.
  assert.equal(matchesDocument(doc, { ...metrics, net_revenue: 2090.004 }, opts), true);
});

test("a report whose Profit Center line did not parse falls back to its folder", () => {
  const doc = { campus: "Foothills", net_revenue: 1000, total_checks: 100 };
  const metrics = {
    date: "2026-09-02", detectedCampus: null, net_revenue: 1000, total_checks: 100,
  };
  assert.equal(
    matchesDocument(doc, metrics, { docDate: "2026-09-02", objectCampus: "Foothills" }), true
  );
  // With neither signal the campus is unverifiable, so the figure is refused.
  assert.equal(
    matchesDocument(doc, metrics, { docDate: "2026-09-02", objectCampus: null }), false
  );
});

test("parsed reports are keyed by the day and campus they describe", () => {
  assert.equal(dayKey("2026-09-03", "Mesa Lab"), "2026-09-03|Mesa Lab");
  assert.notEqual(dayKey("2026-09-03", "Mesa Lab"), dayKey("2026-09-03", "Foothills"));
});
