/**
 * Selection and file-matching rules for the payroll backfill.
 *
 * These decide which production documents get written and which archived
 * report each one is filled from, so they are pinned here rather than left to
 * a dry run to reveal.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyGap, indexReportsBySourceFile, needsPayrollBackfill,
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
});

test("re-uploads resolve to the newest copy", () => {
  // The same report uploaded twice: a correction after the first parse.
  const index = indexReportsBySourceFile([
    "reports/Mesa_Lab/1756915200000_Daily.xlsx",
    "reports/Mesa_Lab/1757001600000_Daily.xlsx",
    "reports/Mesa_Lab/1756828800000_Daily.xlsx",
  ]);
  assert.equal(index.get("Daily.xlsx"), "reports/Mesa_Lab/1757001600000_Daily.xlsx");
  assert.equal(uploadedAtFromObjectName("reports/Mesa_Lab/1757001600000_Daily.xlsx"), 1757001600000);
  assert.equal(uploadedAtFromObjectName("reports/Mesa_Lab/legacy.xlsx"), 0);
});

test("gaps that cannot be filled are classified rather than guessed at", () => {
  const doc = { source_file: "Daily.xlsx" };
  assert.equal(classifyGap(doc, "reports/Mesa_Lab/1_Daily.xlsx"), null);
  assert.equal(classifyGap({}, "reports/Mesa_Lab/1_Daily.xlsx"), "no-source-file");
  assert.equal(classifyGap(doc, null), "file-not-in-storage");
  // PDFs have no readable TENDERS section — re-uploading as .xlsx is the fix.
  assert.equal(classifyGap(doc, "reports/Mesa_Lab/1_Daily.pdf"), "not-excel");
});
