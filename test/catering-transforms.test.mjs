import test from "node:test";
import assert from "node:assert/strict";

import {
  campusForBuilding, cleanString, deriveServiceFlag, mapLifecycleStatus,
  mapPaymentMethod, mapRequestStatus, normalizeMealPeriod, normalizeTime,
  parseCateringServices, parseDate, parseNumber, parseProjectIds, parseYesNo,
  resolveRoomKey, transformEventRow,
} from "../scripts/lib/cateringTransforms.mjs";
import { parseCsv, parseCsvRows } from "../scripts/lib/csv.mjs";

// ── Primitives ───────────────────────────────────────────────────────────────

test("parseYesNo only treats affirmative values as true", () => {
  assert.equal(parseYesNo("Yes"), true);
  assert.equal(parseYesNo("yes"), true);
  assert.equal(parseYesNo("No"), false);
  assert.equal(parseYesNo(""), false);
  assert.equal(parseYesNo(undefined), false);
});

test("parseNumber strips currency formatting and rejects junk", () => {
  assert.equal(parseNumber("300"), 300);
  assert.equal(parseNumber("$1,500"), 1500);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("TBD"), null);
});

test("deriveServiceFlag is true for real instructions, false for negatives", () => {
  assert.equal(deriveServiceFlag("Check trash cans twice a day"), true);
  assert.equal(deriveServiceFlag("Security required from 8 am to 5 pm. $45/hr"), true);
  assert.equal(deriveServiceFlag("Yes"), true);
  assert.equal(deriveServiceFlag("No"), false);
  assert.equal(deriveServiceFlag("N/A"), false);
  assert.equal(deriveServiceFlag(""), false);
});

test("parseProjectIds splits the multi-value source column", () => {
  assert.deepEqual(parseProjectIds("PRJ000565231 , PRJ00054123"), ["PRJ000565231", "PRJ00054123"]);
  assert.deepEqual(parseProjectIds("PRJ000056321"), ["PRJ000056321"]);
  assert.deepEqual(parseProjectIds(""), []);
});

test("cleanString normalizes nullish input", () => {
  assert.equal(cleanString(null), "");
  assert.equal(cleanString("  x  "), "x");
});

// ── Dates and times ──────────────────────────────────────────────────────────

test("parseDate converts US dates to ISO and passes ISO through", () => {
  assert.equal(parseDate("7/22/2026"), "2026-07-22");
  assert.equal(parseDate("12/1/2026"), "2026-12-01");
  assert.equal(parseDate("7/17/26"), "2026-07-17");
  assert.equal(parseDate("2026-07-22"), "2026-07-22");
  assert.equal(parseDate(""), "");
  assert.equal(parseDate("sometime"), "");
});

test("normalizeTime handles the mixed formats in the source column", () => {
  assert.equal(normalizeTime("8:00 AM"), "08:00");
  assert.equal(normalizeTime("2:30 PM"), "14:30");
  assert.equal(normalizeTime("12:00 AM"), "00:00");
  assert.equal(normalizeTime("12:30 PM"), "12:30");
  assert.equal(normalizeTime("8:00:00"), "08:00");
  assert.equal(normalizeTime("13:00:00"), "13:00");
  assert.equal(normalizeTime(""), "");
  assert.equal(normalizeTime("noon"), "");
});

// ── Enums ────────────────────────────────────────────────────────────────────

test("normalizeMealPeriod recognizes Coffee Break and falls back to other", () => {
  assert.equal(normalizeMealPeriod("Coffee Break"), "coffee_break");
  assert.equal(normalizeMealPeriod("Breakfast"), "breakfast");
  assert.equal(normalizeMealPeriod("Lunch"), "lunch");
  assert.equal(normalizeMealPeriod("Afternoon Tea"), "other");
  assert.equal(normalizeMealPeriod(""), "");
});

test("parseCateringServices splits the multi-value schedule column", () => {
  assert.deepEqual(
    parseCateringServices("Coffee Break , Lunch , Reception"),
    ["coffee_break", "lunch", "reception"]
  );
  assert.deepEqual(parseCateringServices(""), []);
});

test("status columns map to two independent axes", () => {
  assert.equal(mapRequestStatus("Confirmed"), "confirmed");
  assert.equal(mapRequestStatus("Cancelled"), "cancelled");
  assert.equal(mapRequestStatus("Whatever"), null);
  assert.equal(mapLifecycleStatus("Open"), "open");
  assert.equal(mapLifecycleStatus("Closed"), "closed");
  assert.equal(mapLifecycleStatus("Whatever"), null);
});

test("mapPaymentMethod matches the existing event_revenue type contract", () => {
  assert.equal(mapPaymentMethod("Project ID"), "project_id");
  assert.equal(mapPaymentMethod("ACH (External)"), "ach_external");
  assert.equal(mapPaymentMethod(""), null);
});

// ── Reference data ───────────────────────────────────────────────────────────

test("campusForBuilding covers all nine buildings and rejects unknowns", () => {
  assert.equal(campusForBuilding("ML"), "Mesa Lab");
  assert.equal(campusForBuilding("CG1"), "Center Green");
  assert.equal(campusForBuilding("CG2"), "Center Green");
  assert.equal(campusForBuilding("FL0"), "Foothills");
  assert.equal(campusForBuilding("FLA"), "Foothills");
  assert.equal(campusForBuilding("cg1"), "Center Green");
  assert.equal(campusForBuilding("XX"), null);
});

test("resolveRoomKey resolves exact, case-insensitive, and building-qualified", () => {
  const known = ["CG1-2122", "CG1-1210-South-Auditorium"];
  assert.equal(resolveRoomKey("CG1-2122", known, "CG1").roomId, "CG1-2122");
  assert.equal(resolveRoomKey("cg1-2122", known, "CG1").roomId, "CG1-2122");
  assert.equal(resolveRoomKey("2122", known, "CG1").roomId, "CG1-2122");
});

test("resolveRoomKey refuses to guess and preserves the raw value", () => {
  const known = ["CG1-2126", "CG1-2122"];
  // "CG-2126" is a plausible typo for CG1-2126, but guessing could assign the
  // wrong room — it must stay unresolved.
  const typo = resolveRoomKey("CG-2126", known, "CG1");
  assert.equal(typo.resolved, false);
  assert.equal(typo.roomId, null);
  assert.equal(typo.raw, "CG-2126");

  // Building/room mismatch: bare "2122" under CG2 must not resolve to CG1-2122.
  assert.equal(resolveRoomKey("2122", known, "CG2").resolved, false);

  assert.equal(resolveRoomKey("Full Auditorium", known, "CG1").resolved, false);
  assert.equal(resolveRoomKey("", known, "CG1").resolved, false);
});

// ── Event transform ──────────────────────────────────────────────────────────

const SAMPLE_ROW = {
  UniqueKey: "290fea88",
  "Event ID": "12345678",
  "Event Name": "Jeff's Party",
  "Submission Date": "7/16/2026",
  "Request Status": "Confirmed",
  "Event Start Date": "7/27/2026",
  "Event End Date": "7/29/2026",
  "Event Start Time": "12:19 PM",
  Organization: "UCAR",
  "Lab/Program": "ES",
  "Event Planner Name": "Test Planner",
  "Event Planner Email": "planner@ucar.edu",
  Building: "CG1",
  Room: "CG1-1210-South-Auditorium",
  Attendance: "75",
  Catering: "Yes",
  Alcohol: "Yes",
  Security: "Security required from 8 am to 5 pm. Cost is $45/hr",
  Custodial: "",
  "Payment Method": "Project ID",
  "Project ID": "PRJ000565231 , PRJ00054123",
  "Payment Notes": "Split payment 50/50",
  Status: "Open",
};

test("transformEventRow maps a clean row without flagging review", () => {
  const { doc, review } = transformEventRow(SAMPLE_ROW, {
    knownRoomKeys: ["CG1-1210-South-Auditorium"],
  });

  assert.equal(review.length, 0);
  assert.equal(doc.needsReview, false);
  assert.equal(doc.eventName, "Jeff's Party");
  assert.equal(doc.startDate, "2026-07-27");
  assert.equal(doc.startTime, "12:19");
  assert.equal(doc.campus, "Center Green");
  assert.equal(doc.expectedAttendance, 75);
  assert.equal(doc.requestStatus, "confirmed");
  assert.equal(doc.lifecycleStatus, "open");
  assert.equal(doc.migratedFromAppSheet, true);
});

test("transformEventRow keeps service text verbatim and derives the flag", () => {
  const { doc } = transformEventRow(SAMPLE_ROW, { knownRoomKeys: ["CG1-1210-South-Auditorium"] });
  assert.equal(doc.securityNotes, "Security required from 8 am to 5 pm. Cost is $45/hr");
  assert.equal(doc.needsSecurity, true);
  assert.equal(doc.custodialNotes, "");
  assert.equal(doc.needsCustodial, false);
});

test("transformEventRow splits project IDs and keeps payment notes", () => {
  const { doc } = transformEventRow(SAMPLE_ROW, { knownRoomKeys: ["CG1-1210-South-Auditorium"] });
  assert.deepEqual(doc.projectIds, ["PRJ000565231", "PRJ00054123"]);
  assert.equal(doc.paymentNotes, "Split payment 50/50");
  assert.equal(doc.paymentMethod, "project_id");
});

test("transformEventRow never emits revenue fields", () => {
  const { doc } = transformEventRow(SAMPLE_ROW, { knownRoomKeys: ["CG1-1210-South-Auditorium"] });
  assert.equal("estimatedRevenue" in doc, false);
  assert.equal("actualRevenue" in doc, false);
});

test("transformEventRow flags an unresolved room and keeps the raw value", () => {
  const { doc, review } = transformEventRow(
    { ...SAMPLE_ROW, Room: "Full Auditorium" },
    { knownRoomKeys: ["CG1-1210-South-Auditorium"] }
  );
  assert.equal(doc.needsReview, true);
  assert.equal(doc.primaryRoomId, null);
  assert.equal(doc.rawRoom, "Full Auditorium");
  assert.match(review.join(" "), /unresolved room/);
});

test("transformEventRow flags an unknown building rather than inventing a campus", () => {
  const { doc, review } = transformEventRow(
    { ...SAMPLE_ROW, Building: "ZZ9", Room: "" },
    { knownRoomKeys: [] }
  );
  assert.equal(doc.campus, null);
  assert.equal(doc.needsReview, true);
  assert.match(review.join(" "), /unknown building/);
});

test("transformEventRow defaults a migrated event to closed", () => {
  const { doc } = transformEventRow({ ...SAMPLE_ROW, Status: "" }, { knownRoomKeys: [] });
  assert.equal(doc.lifecycleStatus, "closed");
});

// ── CSV reader ───────────────────────────────────────────────────────────────

test("parseCsv keys rows by header and pads short rows", () => {
  const rows = parseCsv("a,b,c\n1,2,3\n4,5\n");
  assert.deepEqual(rows[0], { a: "1", b: "2", c: "3" });
  assert.deepEqual(rows[1], { a: "4", b: "5", c: "" });
});

test("parseCsv handles quoted fields, embedded commas, and doubled quotes", () => {
  const rows = parseCsv('a,b\n"Coffee, Tea, & Water","He said ""hi"""\n');
  assert.equal(rows[0].a, "Coffee, Tea, & Water");
  assert.equal(rows[0].b, 'He said "hi"');
});

test("parseCsvRows keeps newlines inside quoted fields", () => {
  const rows = parseCsvRows('a,b\n"line1\nline2",x\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "line1\nline2");
});

test("parseCsv strips a UTF-8 BOM from Sheets exports", () => {
  assert.deepEqual(parseCsv("﻿a,b\n1,2\n")[0], { a: "1", b: "2" });
});
