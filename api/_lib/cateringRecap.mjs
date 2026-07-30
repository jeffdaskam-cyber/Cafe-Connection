/**
 * Catering event recap — pure data model.
 *
 * Turns an event plus its subcollections into the ordered sections the PDF
 * renders. Separated from rendering so the content is unit tested without
 * producing a document (test/catering-recap.test.mjs).
 *
 * The recap is built ONLY from the event's own stored fields — no derived
 * pricing, no external lookups — so "the recap matches the source data" is a
 * property of this mapping rather than something to eyeball in a PDF.
 */

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

function money(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeRange(start, end) {
  return [start, end].filter(Boolean).join("–");
}

/** Rows with an empty value are dropped so the recap has no blank lines. */
function rows(pairs) {
  return pairs.filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([label, value]) => [label, String(value)]);
}

/**
 * @param event         the catering_events document
 * @param scheduleDays  schedule days, each with a `meals` array
 * @param eventRooms    booked room records
 */
export function buildRecap(event, scheduleDays = [], eventRooms = []) {
  if (!event?.id) throw new Error("buildRecap needs an event with an id");

  const title = event.eventName || "Untitled event";
  const dateRange = [event.startDate, event.endDate].filter(Boolean);
  const subtitle = dateRange.length === 2 && dateRange[0] !== dateRange[1]
    ? `${dateRange[0]} – ${dateRange[1]}`
    : (dateRange[0] || "Dates not recorded");

  const sections = [];

  sections.push({
    heading: "Event",
    rows: rows([
      ["Event name", title],
      ["Dates", subtitle],
      ["Start time", event.startTime],
      ["Organization", [event.organization, event.lcpo].filter(Boolean).join(" / ")],
      ["Campus", event.campus],
      ["Expected attendance", event.expectedAttendance],
      ["Actual attendance", event.actualAttendance],
    ]),
  });

  sections.push({
    heading: "Contacts",
    rows: rows([
      ["Planner", [event.plannerName, event.plannerEmail, event.plannerPhone].filter(Boolean).join(" · ")],
      ["On-site", [event.onsiteContactName, event.onsiteContactEmail, event.onsiteContactPhone].filter(Boolean).join(" · ")],
      ["Secondary", [event.secondaryContactName, event.secondaryContactEmail].filter(Boolean).join(" · ")],
    ]),
  });

  const roomRows = [...eventRooms]
    .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)))
    .map((room) => [
      room.roomId || room.rawRoom || "Room not recorded",
      [
        timeRange(room.startTime, room.endTime),
        room.setupType,
        room.expectedHeadcount != null ? `${room.expectedHeadcount} in room` : "",
        room.isPrimary ? "(primary)" : "",
        room.notes,
      ].filter(Boolean).join(" · "),
    ]);
  sections.push({ heading: "Rooms", rows: roomRows });

  const scheduleRows = [];
  for (const day of [...scheduleDays].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")))) {
    scheduleRows.push([
      day.date || "Date not recorded",
      [
        timeRange(day.startTime, day.endTime),
        (day.cateringServicesNeeded || []).map((p) => MEAL_PERIOD_LABELS[p] || p).join(", "),
        day.notes,
      ].filter(Boolean).join(" · "),
    ]);
    for (const meal of day.meals || []) {
      scheduleRows.push([
        `    ${MEAL_PERIOD_LABELS[meal.mealPeriod] || meal.mealPeriod || "Meal"}`,
        [
          meal.time,
          meal.headcount != null ? `${meal.headcount} guests` : "",
          meal.menuSelection,
          meal.location ? `(${meal.location})` : "",
        ].filter(Boolean).join(" · "),
      ]);
    }
  }
  sections.push({ heading: "Schedule & meals", rows: scheduleRows });

  sections.push({
    heading: "Services",
    rows: rows([
      ["Catering", event.needsCatering ? "Yes" : "No"],
      ["Alcohol", event.needsAlcohol ? "Yes" : "No"],
      ["Setup", event.setupNotes],
      ["Security", event.securityNotes],
      ["Custodial", event.custodialNotes],
      ["Access / doors", event.accessDoorsNotes],
      ["Sustainability", event.sustainabilityNotes],
      ["Special requests", event.specialRequests],
    ]),
  });

  sections.push({
    heading: "Financials",
    rows: rows([
      ["Payment method", event.paymentMethod === "project_id" ? "Project ID"
        : event.paymentMethod === "ach_external" ? "ACH (External)" : ""],
      ["Project ID(s)", (event.projectIds || []).join(", ")],
      ["Payment notes", event.paymentNotes],
      ["Estimated revenue", money(event.estimatedRevenue)],
      ["Actual revenue", money(event.actualRevenue)],
    ]),
  });

  return {
    title,
    subtitle,
    eventId: event.id,
    // Sections with no content are dropped rather than printed empty.
    sections: sections.filter((s) => s.rows.length > 0),
  };
}

/** Storage path for an event's recap. Deterministic, so re-closing overwrites. */
export function recapStoragePath(eventId) {
  return `catering_recaps/${eventId}.pdf`;
}
