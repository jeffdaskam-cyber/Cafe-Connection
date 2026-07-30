import test from "node:test";
import assert from "node:assert/strict";

import {
  QUEUE_FILTER_DEFAULTS, filterEvents, groupScheduleByDate, isoDateOffset,
  mealTotalsForDay, needsAttention, queueCounts, sortEventsByDate,
} from "../src/catering/staffFilters.js";

const EVENTS = [
  {
    id: "e1", eventName: "CESM Workshop", plannerName: "Ada Lovelace",
    plannerEmail: "ada@ucar.edu", requestStatus: "submitted", lifecycleStatus: "open",
    startDate: "2026-09-10", buildingId: "CG1", primaryRoomId: "CG1-2122",
    roomIds: ["CG1-2122"], expectedAttendance: 40, projectIds: ["PRJ001"],
  },
  {
    id: "e2", eventName: "Board Meeting", plannerName: "Grace Hopper",
    plannerEmail: "grace@ucar.edu", requestStatus: "confirmed", lifecycleStatus: "open",
    startDate: "2026-09-20", buildingId: "ML", primaryRoomId: "ML-40",
    roomIds: ["ML-40"], expectedAttendance: 12, projectIds: ["PRJ002"],
  },
  {
    id: "e3", eventName: "Retro Event", plannerName: "Alan Turing",
    requestStatus: "confirmed", lifecycleStatus: "closed",
    startDate: "2026-06-01", buildingId: "FL2", roomIds: ["FL2-1002"],
    needsReview: true, reviewNotes: ["unresolved room \"Full Auditorium\""],
  },
  {
    id: "e4", eventName: "Undated Idea", requestStatus: "draft",
    lifecycleStatus: "open", startDate: "", buildingId: "", roomIds: [],
  },
];

// ── Filtering ────────────────────────────────────────────────────────────────

test("the default filter shows only submitted requests", () => {
  const rows = filterEvents(EVENTS, QUEUE_FILTER_DEFAULTS);
  assert.deepEqual(rows.map((e) => e.id), ["e1"]);
});

test("'all' status returns everything", () => {
  const rows = filterEvents(EVENTS, { ...QUEUE_FILTER_DEFAULTS, requestStatus: "all" });
  assert.equal(rows.length, 4);
});

test("'needs attention' covers submitted requests and migration flags", () => {
  const rows = filterEvents(EVENTS, { ...QUEUE_FILTER_DEFAULTS, requestStatus: "needs_attention" });
  assert.deepEqual(rows.map((e) => e.id).sort(), ["e1", "e3"]);

  assert.equal(needsAttention(EVENTS[0]), true);  // submitted
  assert.equal(needsAttention(EVENTS[2]), true);  // needsReview
  assert.equal(needsAttention(EVENTS[1]), false); // confirmed and clean
});

test("lifecycle filter separates open from closed", () => {
  const open = filterEvents(EVENTS, { requestStatus: "all", lifecycleStatus: "open" });
  assert.deepEqual(open.map((e) => e.id), ["e1", "e2", "e4"]);

  const closed = filterEvents(EVENTS, { requestStatus: "all", lifecycleStatus: "closed" });
  assert.deepEqual(closed.map((e) => e.id), ["e3"]);
});

test("building filter matches the primary building and any booked room", () => {
  assert.deepEqual(
    filterEvents(EVENTS, { requestStatus: "all", buildingId: "CG1" }).map((e) => e.id),
    ["e1"]
  );
  assert.deepEqual(
    filterEvents(EVENTS, { requestStatus: "all", buildingId: "FL2" }).map((e) => e.id),
    ["e3"],
    "matched via roomIds even though buildingId is FL2"
  );
  assert.deepEqual(
    filterEvents(EVENTS, { requestStatus: "all", buildingId: "CG2" }).map((e) => e.id),
    []
  );
});

test("date range filters on the event start date", () => {
  assert.deepEqual(
    filterEvents(EVENTS, { requestStatus: "all", from: "2026-09-01" }).map((e) => e.id),
    ["e1", "e2"]
  );
  assert.deepEqual(
    filterEvents(EVENTS, { requestStatus: "all", to: "2026-09-15" }).map((e) => e.id),
    ["e1", "e3"]
  );
  assert.deepEqual(
    filterEvents(EVENTS, { requestStatus: "all", from: "2026-09-01", to: "2026-09-15" })
      .map((e) => e.id),
    ["e1"]
  );
});

test("an undated event is excluded only when a range is set", () => {
  assert.ok(filterEvents(EVENTS, { requestStatus: "all" }).some((e) => e.id === "e4"));
  assert.ok(!filterEvents(EVENTS, { requestStatus: "all", from: "2026-01-01" })
    .some((e) => e.id === "e4"));
});

test("search covers event, planner, email, room, and project ID", () => {
  const find = (search) =>
    filterEvents(EVENTS, { requestStatus: "all", search }).map((e) => e.id);

  assert.deepEqual(find("cesm"), ["e1"]);
  assert.deepEqual(find("hopper"), ["e2"]);
  assert.deepEqual(find("ada@ucar.edu"), ["e1"]);
  assert.deepEqual(find("ML-40"), ["e2"]);
  assert.deepEqual(find("PRJ002"), ["e2"]);
  assert.deepEqual(find("   "), ["e1", "e2", "e3", "e4"], "blank search matches all");
});

test("filterEvents does not mutate its input", () => {
  const snapshot = JSON.stringify(EVENTS);
  filterEvents(EVENTS, { requestStatus: "all", search: "cesm" });
  assert.equal(JSON.stringify(EVENTS), snapshot);
});

test("filterEvents tolerates missing input", () => {
  assert.deepEqual(filterEvents(undefined, {}), []);
  assert.deepEqual(filterEvents([], {}), []);
});

// ── Sorting and counts ───────────────────────────────────────────────────────

test("sortEventsByDate orders by start date and puts undated events last", () => {
  assert.deepEqual(sortEventsByDate(EVENTS).map((e) => e.id), ["e3", "e1", "e2", "e4"]);
  assert.deepEqual(sortEventsByDate(EVENTS, "desc").map((e) => e.id), ["e2", "e1", "e3", "e4"]);
});

test("sortEventsByDate does not mutate its input", () => {
  const snapshot = JSON.stringify(EVENTS);
  sortEventsByDate(EVENTS, "desc");
  assert.equal(JSON.stringify(EVENTS), snapshot);
});

test("queueCounts summarizes the queue", () => {
  assert.deepEqual(queueCounts(EVENTS), {
    total: 4, submitted: 1, confirmed: 2, open: 3, needsReview: 1,
  });
});

// ── Daily schedule grouping ──────────────────────────────────────────────────

const DAYS = [
  { id: "d1", eventId: "e1", date: "2026-09-10", startTime: "13:00", endTime: "17:00",
    cateringServicesNeeded: ["lunch"] },
  { id: "d2", eventId: "e2", date: "2026-09-10", startTime: "08:00", endTime: "12:00",
    cateringServicesNeeded: ["breakfast", "coffee_break"] },
  { id: "d3", eventId: "e1", date: "2026-09-11", startTime: "09:00",
    cateringServicesNeeded: ["coffee_break"] },
  { id: "d4", eventId: "missing", date: "2026-09-10", startTime: "10:00" },
  { id: "d5", eventId: "e1", date: "", startTime: "10:00" },
];

const EVENTS_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

test("groupScheduleByDate groups by date and sorts entries by start time", () => {
  const grouped = groupScheduleByDate(DAYS, EVENTS_BY_ID);
  assert.deepEqual(grouped.map((g) => g.date), ["2026-09-10", "2026-09-11"]);
  assert.deepEqual(grouped[0].entries.map((e) => e.id), ["d2", "d1"]);
});

test("groupScheduleByDate joins in event context", () => {
  const [firstDay] = groupScheduleByDate(DAYS, EVENTS_BY_ID);
  const entry = firstDay.entries.find((e) => e.id === "d1");
  assert.equal(entry.eventName, "CESM Workshop");
  assert.equal(entry.plannerName, "Ada Lovelace");
  assert.equal(entry.primaryRoomId, "CG1-2122");
  assert.equal(entry.expectedAttendance, 40);
});

test("groupScheduleByDate drops days with no event or no date", () => {
  const grouped = groupScheduleByDate(DAYS, EVENTS_BY_ID);
  const allIds = grouped.flatMap((g) => g.entries.map((e) => e.id));
  assert.ok(!allIds.includes("d4"), "orphaned day is dropped rather than shown without context");
  assert.ok(!allIds.includes("d5"), "dateless day is dropped");
});

test("mealTotalsForDay aggregates events and headcount per period", () => {
  const [firstDay] = groupScheduleByDate(DAYS, EVENTS_BY_ID);
  const totals = mealTotalsForDay(firstDay.entries);
  const byPeriod = Object.fromEntries(totals.map((t) => [t.period, t]));

  assert.equal(byPeriod.lunch.events, 1);
  assert.equal(byPeriod.lunch.headcount, 40);
  assert.equal(byPeriod.breakfast.events, 1);
  assert.equal(byPeriod.breakfast.headcount, 12);
  assert.equal(byPeriod.coffee_break.headcount, 12);
});

test("mealTotalsForDay tolerates entries with no services", () => {
  assert.deepEqual(mealTotalsForDay([{ id: "x" }]), []);
  assert.deepEqual(mealTotalsForDay([]), []);
  assert.deepEqual(mealTotalsForDay(undefined), []);
});

// ── Date helper ──────────────────────────────────────────────────────────────

test("isoDateOffset shifts an ISO date by whole days", () => {
  assert.equal(isoDateOffset("2026-09-10", 14), "2026-09-24");
  assert.equal(isoDateOffset("2026-09-10", -1), "2026-09-09");
  assert.equal(isoDateOffset("2026-12-31", 1), "2027-01-01");
  assert.equal(isoDateOffset("not-a-date", 5), "");
});
