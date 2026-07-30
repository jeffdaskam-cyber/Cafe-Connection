/**
 * Catering Companion — staff queue filtering and grouping.
 *
 * Pure helpers for the staff console: no React, no Firebase, so the filter and
 * grouping behavior is unit tested directly (test/catering-staff.test.mjs).
 */

import { LIFECYCLE_STATUS, REQUEST_STATUS } from "./schema.js";

export const QUEUE_FILTER_DEFAULTS = {
  requestStatus: REQUEST_STATUS.SUBMITTED, // the queue's job is new requests
  lifecycleStatus: "all",
  buildingId: "all",
  from: "",
  to: "",
  search: "",
};

/** Options for the status dropdown, plus the two synthetic views. */
export const QUEUE_STATUS_OPTIONS = [
  { value: "all",                      label: "All statuses" },
  { value: "needs_attention",          label: "Needs attention" },
  { value: REQUEST_STATUS.SUBMITTED,   label: "Submitted" },
  { value: REQUEST_STATUS.CONFIRMED,   label: "Confirmed" },
  { value: REQUEST_STATUS.DRAFT,       label: "Draft" },
  { value: REQUEST_STATUS.CANCELLED,   label: "Cancelled" },
];

/**
 * An event needs staff attention when it is awaiting a decision, or when the
 * migration flagged it for review.
 */
export function needsAttention(event) {
  return (
    event.requestStatus === REQUEST_STATUS.SUBMITTED ||
    event.needsReview === true
  );
}

function matchesSearch(event, search) {
  const q = search.trim().toLowerCase();
  if (q === "") return true;
  return [
    event.eventName, event.plannerName, event.plannerEmail,
    event.lcpo, event.organization, event.primaryRoomId, event.buildingId,
    ...(event.projectIds || []),
  ].some((v) => String(v ?? "").toLowerCase().includes(q));
}

/** Apply the queue filters to a list of events. Does not mutate the input. */
export function filterEvents(events, filters = {}) {
  const f = { ...QUEUE_FILTER_DEFAULTS, ...filters };

  return (events || []).filter((event) => {
    if (f.requestStatus === "needs_attention") {
      if (!needsAttention(event)) return false;
    } else if (f.requestStatus !== "all" && event.requestStatus !== f.requestStatus) {
      return false;
    }

    if (f.lifecycleStatus !== "all" && event.lifecycleStatus !== f.lifecycleStatus) return false;

    if (f.buildingId !== "all") {
      const inPrimary = event.buildingId === f.buildingId;
      const inRooms = (event.roomIds || []).some((id) => String(id).startsWith(`${f.buildingId}-`));
      if (!inPrimary && !inRooms) return false;
    }

    // Date range compares against the event's start date. An event with no
    // start date is only excluded when a range is actually set.
    if (f.from && (!event.startDate || event.startDate < f.from)) return false;
    if (f.to && (!event.startDate || event.startDate > f.to)) return false;

    return matchesSearch(event, f.search);
  });
}

/** Newest first by start date, then by creation. Does not mutate the input. */
export function sortEventsByDate(events, direction = "asc") {
  const sign = direction === "desc" ? -1 : 1;
  return [...(events || [])].sort((a, b) => {
    const aDate = a.startDate || "";
    const bDate = b.startDate || "";
    if (aDate !== bDate) {
      // Events with no date sort last regardless of direction.
      if (aDate === "") return 1;
      if (bDate === "") return -1;
      return aDate < bDate ? -sign : sign;
    }
    return String(a.eventName || "").localeCompare(String(b.eventName || ""));
  });
}

/** Counts for the queue's summary chips. */
export function queueCounts(events) {
  const list = events || [];
  return {
    total:      list.length,
    submitted:  list.filter((e) => e.requestStatus === REQUEST_STATUS.SUBMITTED).length,
    confirmed:  list.filter((e) => e.requestStatus === REQUEST_STATUS.CONFIRMED).length,
    open:       list.filter((e) => e.lifecycleStatus === LIFECYCLE_STATUS.OPEN).length,
    needsReview: list.filter((e) => e.needsReview === true).length,
  };
}

/**
 * Group schedule days into a date-keyed day view for the cross-event schedule.
 *
 * `days` are schedule-day records carrying an `eventId`; `eventsById` supplies
 * the event context. Days whose event is missing are dropped rather than
 * rendered without context.
 */
export function groupScheduleByDate(days, eventsById = {}) {
  const byDate = new Map();

  for (const day of days || []) {
    const event = eventsById[day.eventId];
    if (!event) continue;
    if (!day.date) continue;

    if (!byDate.has(day.date)) byDate.set(day.date, []);
    byDate.get(day.date).push({
      ...day,
      eventName: event.eventName || "Untitled event",
      plannerName: event.plannerName || "",
      buildingId: event.buildingId || "",
      primaryRoomId: event.primaryRoomId || "",
      requestStatus: event.requestStatus,
      lifecycleStatus: event.lifecycleStatus,
      expectedAttendance: event.expectedAttendance ?? null,
    });
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, entries]) => ({
      date,
      entries: entries.sort((a, b) =>
        String(a.startTime || "").localeCompare(String(b.startTime || ""))
      ),
    }));
}

/** Totals per meal period across a day's entries — kitchen prep at a glance. */
export function mealTotalsForDay(entries) {
  const totals = new Map();
  for (const entry of entries || []) {
    for (const period of entry.cateringServicesNeeded || []) {
      const current = totals.get(period) || { period, events: 0, headcount: 0 };
      current.events += 1;
      current.headcount += Number(entry.expectedAttendance) || 0;
      totals.set(period, current);
    }
  }
  return [...totals.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/** ISO date N days from `from` (inclusive start), for the default range. */
export function isoDateOffset(fromIso, days) {
  const base = fromIso ? new Date(`${fromIso}T00:00:00Z`) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
