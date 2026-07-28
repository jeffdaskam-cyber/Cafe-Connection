import test from "node:test";
import assert from "node:assert/strict";

import { buildRecap, recapStoragePath } from "../api/_lib/cateringRecap.mjs";
import { planWorkFor } from "../api/_lib/cateringReconcile.mjs";

const EVENT = {
  id: "evt1",
  eventName: "CESM Workshop",
  startDate: "2026-09-14",
  endDate: "2026-09-15",
  startTime: "08:00",
  organization: "UCAR",
  lcpo: "Event Services",
  campus: "Center Green",
  expectedAttendance: 40,
  actualAttendance: 37,
  plannerName: "Ada Lovelace",
  plannerEmail: "ada@ucar.edu",
  needsCatering: true,
  needsAlcohol: false,
  securityNotes: "Guard 8am-5pm, $45/hr",
  paymentMethod: "project_id",
  projectIds: ["PRJ001", "PRJ002"],
  paymentNotes: "Split payment 50/50",
  estimatedRevenue: 8400,
  actualRevenue: 7950,
};

const DAYS = [
  {
    id: "d2", date: "2026-09-15", startTime: "08:00", endTime: "12:00",
    cateringServicesNeeded: ["coffee_break"],
    meals: [{ id: "m2", mealPeriod: "coffee_break", time: "10:00", menuSelection: "CTW" }],
  },
  {
    id: "d1", date: "2026-09-14", startTime: "08:00", endTime: "17:00",
    cateringServicesNeeded: ["lunch"],
    meals: [{ id: "m1", mealPeriod: "lunch", time: "12:00", headcount: 40, menuSelection: "Taco bar", location: "Lobby" }],
  },
];

const ROOMS = [
  { id: "r2", roomId: "CG1-2126", isPrimary: false, notes: "Breakout" },
  { id: "r1", roomId: "CG1-2122", isPrimary: true, startTime: "07:30", endTime: "17:30",
    setupType: "Classroom", expectedHeadcount: 40 },
];

function sectionNamed(recap, heading) {
  return recap.sections.find((s) => s.heading === heading);
}
function valueFor(section, label) {
  return section?.rows.find(([l]) => l === label)?.[1];
}

// ── Content fidelity ─────────────────────────────────────────────────────────

test("the recap carries the event's own values, unchanged", () => {
  const recap = buildRecap(EVENT, DAYS, ROOMS);
  const event = sectionNamed(recap, "Event");
  assert.equal(valueFor(event, "Event name"), "CESM Workshop");
  assert.equal(valueFor(event, "Dates"), "2026-09-14 – 2026-09-15");
  assert.equal(valueFor(event, "Expected attendance"), "40");
  assert.equal(valueFor(event, "Actual attendance"), "37");
  assert.equal(valueFor(event, "Campus"), "Center Green");
  assert.equal(valueFor(event, "Organization"), "UCAR / Event Services");
});

test("financials are formatted but not recomputed", () => {
  const fin = sectionNamed(buildRecap(EVENT, DAYS, ROOMS), "Financials");
  assert.equal(valueFor(fin, "Payment method"), "Project ID");
  assert.equal(valueFor(fin, "Project ID(s)"), "PRJ001, PRJ002");
  assert.equal(valueFor(fin, "Payment notes"), "Split payment 50/50");
  assert.equal(valueFor(fin, "Estimated revenue"), "$8,400.00");
  assert.equal(valueFor(fin, "Actual revenue"), "$7,950.00");
});

test("schedule days are ordered by date with their meals beneath", () => {
  const schedule = sectionNamed(buildRecap(EVENT, DAYS, ROOMS), "Schedule & meals");
  const labels = schedule.rows.map(([l]) => l);
  assert.deepEqual(labels, [
    "2026-09-14", "    Lunch",
    "2026-09-15", "    Coffee break",
  ], "input was supplied out of order and must be sorted");

  assert.match(schedule.rows[1][1], /12:00/);
  assert.match(schedule.rows[1][1], /40 guests/);
  assert.match(schedule.rows[1][1], /Taco bar/);
  assert.match(schedule.rows[1][1], /\(Lobby\)/);
});

test("the primary room is listed first", () => {
  const rooms = sectionNamed(buildRecap(EVENT, DAYS, ROOMS), "Rooms");
  assert.equal(rooms.rows[0][0], "CG1-2122");
  assert.match(rooms.rows[0][1], /07:30–17:30/);
  assert.match(rooms.rows[0][1], /Classroom/);
  assert.match(rooms.rows[0][1], /\(primary\)/);
  assert.equal(rooms.rows[1][0], "CG1-2126");
});

test("a room that never resolved shows its raw value rather than a blank", () => {
  const recap = buildRecap(EVENT, [], [{ id: "r", roomId: null, rawRoom: "Full Auditorium" }]);
  assert.equal(sectionNamed(recap, "Rooms").rows[0][0], "Full Auditorium");
});

test("service notes are carried verbatim", () => {
  const services = sectionNamed(buildRecap(EVENT, DAYS, ROOMS), "Services");
  assert.equal(valueFor(services, "Security"), "Guard 8am-5pm, $45/hr");
  assert.equal(valueFor(services, "Alcohol"), "No");
});

// ── Empty handling ───────────────────────────────────────────────────────────

test("empty values are dropped rather than printed blank", () => {
  const sparse = buildRecap({ id: "e", eventName: "Bare", startDate: "2026-01-01" }, [], []);
  for (const section of sparse.sections) {
    for (const [, value] of section.rows) {
      assert.notEqual(value, "", "no blank rows");
    }
  }
});

test("sections with no content are omitted entirely", () => {
  const sparse = buildRecap({ id: "e", eventName: "Bare", startDate: "2026-01-01" }, [], []);
  assert.equal(sectionNamed(sparse, "Rooms"), undefined);
  assert.equal(sectionNamed(sparse, "Contacts"), undefined);
  assert.ok(sectionNamed(sparse, "Event"), "the Event section always has content");
});

test("a single-day event shows one date", () => {
  const recap = buildRecap({ ...EVENT, endDate: "2026-09-14" }, [], []);
  assert.equal(recap.subtitle, "2026-09-14");
});

test("an event with no dates says so instead of rendering blank", () => {
  const recap = buildRecap({ id: "e", eventName: "Undated" }, [], []);
  assert.equal(recap.subtitle, "Dates not recorded");
});

test("buildRecap refuses an event with no id", () => {
  assert.throws(() => buildRecap({ eventName: "x" }), /needs an event with an id/);
});

test("the storage path is deterministic so regenerating overwrites", () => {
  assert.equal(recapStoragePath("evt1"), "catering_recaps/evt1.pdf");
  assert.equal(recapStoragePath("evt1"), recapStoragePath("evt1"));
});

// ── Cron work planning ───────────────────────────────────────────────────────

test("a confirmed, un-notified event with an amount needs notify and revenue", () => {
  const work = planWorkFor(
    { id: "e", requestStatus: "confirmed", lifecycleStatus: "open",
      paymentMethod: "project_id", buildingId: "CG1", startDate: "2026-09-14",
      estimatedRevenue: 100 },
    false
  );
  assert.deepEqual(work.map((w) => w.kind).sort(), ["notify", "revenue"]);
});

test("nothing is planned once an event is fully reconciled", () => {
  const work = planWorkFor(
    { id: "e", requestStatus: "confirmed", lifecycleStatus: "open",
      paymentMethod: "project_id", buildingId: "CG1", startDate: "2026-09-14",
      estimatedRevenue: 100, lastNotifiedStatus: "confirmed:open" },
    true
  );
  assert.deepEqual(work, []);
});

test("a closed event with no recap is scheduled for one", () => {
  const work = planWorkFor(
    { id: "e", requestStatus: "confirmed", lifecycleStatus: "closed",
      paymentMethod: "project_id", buildingId: "CG1", startDate: "2026-09-14",
      actualRevenue: 100, lastNotifiedStatus: "confirmed:closed" },
    true
  );
  assert.deepEqual(work.map((w) => w.kind), ["recap"]);
});

test("a closed event that already has a recap is left alone", () => {
  const work = planWorkFor(
    { id: "e", requestStatus: "confirmed", lifecycleStatus: "closed",
      paymentMethod: "project_id", buildingId: "CG1", startDate: "2026-09-14",
      actualRevenue: 100, lastNotifiedStatus: "confirmed:closed",
      recapUrl: "https://example.com/r.pdf" },
    true
  );
  assert.deepEqual(work, []);
});

test("a cancelled event is not notified and gets no revenue row", () => {
  const work = planWorkFor(
    { id: "e", requestStatus: "cancelled", lifecycleStatus: "open",
      paymentMethod: "project_id", buildingId: "CG1", startDate: "2026-09-14",
      estimatedRevenue: 100 },
    false
  );
  assert.deepEqual(work, []);
});

test("a confirmed event with no amount is notified but not rolled up", () => {
  const work = planWorkFor(
    { id: "e", requestStatus: "confirmed", lifecycleStatus: "open",
      paymentMethod: "project_id", buildingId: "CG1", startDate: "2026-09-14" },
    false
  );
  assert.deepEqual(work.map((w) => w.kind), ["notify"]);
});
