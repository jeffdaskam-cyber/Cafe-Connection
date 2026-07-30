/**
 * Catering Companion — AppSheet → Firestore transforms.
 *
 * Pure functions shared by the seed and migration scripts. No Firestore, no
 * I/O, so they are unit tested directly (test/catering-transforms.test.mjs).
 *
 * The AppSheet source is messy in known ways — see docs/catering/DATA_MODEL.md
 * §7. The guiding rule here is: never invent data. When a value cannot be
 * resolved, keep the raw text and flag the record for staff review rather than
 * guessing or silently dropping it.
 */

import {
  BUILDING_CAMPUS,
  LIFECYCLE_STATUS,
  MEAL_PERIODS,
  PAYMENT_METHOD,
  REQUEST_STATUS,
  SERVICE_FIELDS,
} from "../../src/catering/schema.js";

// ── Primitives ───────────────────────────────────────────────────────────────

export function cleanString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** AppSheet Yes/No columns. Anything not recognizably affirmative is false. */
export function parseYesNo(value) {
  const v = cleanString(value).toLowerCase();
  return v === "yes" || v === "true" || v === "y";
}

export function parseNumber(value) {
  const v = cleanString(value).replace(/[$,]/g, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Service fields hold free text, not booleans. The derived flag is true when
 * there is any content that isn't an explicit negative — so "Check trash cans
 * twice a day" and "Yes" both flag true, while "" and "No" do not.
 */
export function deriveServiceFlag(text) {
  const v = cleanString(text).toLowerCase();
  if (v === "") return false;
  return v !== "no" && v !== "n/a" && v !== "na" && v !== "none";
}

/** "PRJ000565231 , PRJ00054123" → ["PRJ000565231", "PRJ00054123"] */
export function parseProjectIds(value) {
  return cleanString(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Coffee Break , Lunch , Reception" → ["coffee_break", "lunch", "reception"] */
export function parseCateringServices(value) {
  return cleanString(value)
    .split(",")
    .map((s) => normalizeMealPeriod(s))
    .filter(Boolean);
}

// ── Dates and times ──────────────────────────────────────────────────────────

/** "7/22/2026" → "2026-07-22". Returns "" for unparseable input. */
export function parseDate(value) {
  const v = cleanString(value);
  if (v === "") return "";
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return v;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!us) return "";
  const [, m, d, rawYear] = us;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * The source mixes "8:00 AM", "8:00:00" and "13:00:00" in the same column.
 * Normalizes all of them to 24-hour "HH:MM". Returns "" if unparseable.
 */
export function normalizeTime(value) {
  const v = cleanString(value).toUpperCase();
  if (v === "") return "";

  const meridiem = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (meridiem) {
    const [, h, min, , ampm] = meridiem;
    let hour = Number(h) % 12;
    if (ampm === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${min}`;
  }

  const military = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (military) {
    const [, h, min] = military;
    const hour = Number(h);
    if (hour > 23) return "";
    return `${String(hour).padStart(2, "0")}:${min}`;
  }

  return "";
}

// ── Enums ────────────────────────────────────────────────────────────────────

export function normalizeMealPeriod(value) {
  const v = cleanString(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "") return "";
  return MEAL_PERIODS.includes(v) ? v : "other";
}

/**
 * AppSheet "Request Status" → requestStatus. Only "Confirmed" appears in the
 * source sample; the remaining values are the documented workflow states.
 * Unrecognized input maps to 'submitted' and is reported by the caller.
 */
export function mapRequestStatus(value) {
  const v = cleanString(value).toLowerCase();
  const known = {
    draft:     REQUEST_STATUS.DRAFT,
    submitted: REQUEST_STATUS.SUBMITTED,
    pending:   REQUEST_STATUS.SUBMITTED,
    confirmed: REQUEST_STATUS.CONFIRMED,
    approved:  REQUEST_STATUS.CONFIRMED,
    cancelled: REQUEST_STATUS.CANCELLED,
    canceled:  REQUEST_STATUS.CANCELLED,
  };
  return known[v] ?? null;
}

/** AppSheet "Status" → lifecycleStatus. */
export function mapLifecycleStatus(value) {
  const v = cleanString(value).toLowerCase();
  if (v === "open")   return LIFECYCLE_STATUS.OPEN;
  if (v === "closed") return LIFECYCLE_STATUS.CLOSED;
  return null;
}

/** "Project ID" → project_id; "ACH (External)" → ach_external. */
export function mapPaymentMethod(value) {
  const v = cleanString(value).toLowerCase();
  if (v === "") return null;
  if (v.includes("project")) return PAYMENT_METHOD.PROJECT_ID;
  if (v.includes("ach") || v.includes("external")) return PAYMENT_METHOD.ACH_EXTERNAL;
  return null;
}

// ── Reference data ───────────────────────────────────────────────────────────

/** Buildings carry no campus in the source; this supplies it. */
export function campusForBuilding(buildingKey) {
  return BUILDING_CAMPUS[cleanString(buildingKey).toUpperCase()] ?? null;
}

/**
 * Resolve a free-text Room value from the Events sheet against the real Room
 * Key set.
 *
 * Tries, in order: exact match, case-insensitive match, and a building-
 * qualified match for bare room numbers ("2122" + CG1 → "CG1-2122"). Anything
 * still unresolved is returned with resolved:false so the caller can keep the
 * raw string and flag the record — see DATA_MODEL.md §7. Deliberately does NOT
 * fuzzy-match: "CG-2126" is a plausible typo for "CG1-2126", but guessing risks
 * assigning an event to the wrong room.
 */
export function resolveRoomKey(rawRoom, knownRoomKeys, buildingId) {
  const raw = cleanString(rawRoom);
  if (raw === "") return { roomId: null, resolved: false, raw };

  const keys = Array.from(knownRoomKeys);
  if (keys.includes(raw)) return { roomId: raw, resolved: true, raw };

  const ci = keys.find((k) => k.toLowerCase() === raw.toLowerCase());
  if (ci) return { roomId: ci, resolved: true, raw };

  const building = cleanString(buildingId).toUpperCase();
  if (building && /^\d+$/.test(raw)) {
    const qualified = `${building}-${raw}`;
    const match = keys.find((k) => k.toLowerCase() === qualified.toLowerCase());
    if (match) return { roomId: match, resolved: true, raw };
  }

  return { roomId: null, resolved: false, raw };
}

// ── Event transform ──────────────────────────────────────────────────────────

/**
 * Map one AppSheet Events row to a catering_events document.
 *
 * `row` is keyed by the sheet's literal column headers. Returns the document
 * plus a `review` array naming every field that could not be resolved; the
 * caller sets needsReview from it.
 */
export function transformEventRow(row, { knownRoomKeys = [], migratedBy = "migration" } = {}) {
  const get = (col) => cleanString(row[col]);
  const review = [];

  const buildingId = get("Building").toUpperCase();
  const campus = buildingId ? campusForBuilding(buildingId) : null;
  if (buildingId && !campus) review.push(`unknown building "${buildingId}"`);

  const room = resolveRoomKey(get("Room"), knownRoomKeys, buildingId);
  if (room.raw !== "" && !room.resolved) review.push(`unresolved room "${room.raw}"`);

  const requestStatus = mapRequestStatus(get("Request Status"));
  if (get("Request Status") !== "" && requestStatus === null) {
    review.push(`unknown Request Status "${get("Request Status")}"`);
  }

  const lifecycleStatus = mapLifecycleStatus(get("Status"));
  if (get("Status") !== "" && lifecycleStatus === null) {
    review.push(`unknown Status "${get("Status")}"`);
  }

  const paymentMethod = mapPaymentMethod(get("Payment Method"));
  if (get("Payment Method") !== "" && paymentMethod === null) {
    review.push(`unknown Payment Method "${get("Payment Method")}"`);
  }

  const doc = {
    // Provenance
    legacyKey:     get("UniqueKey"),
    legacyEventId: get("Event ID"),
    migratedFromAppSheet: true,
    createdBy:     migratedBy,

    // Identity
    eventName:    get("Event Name"),
    submittedAt:  parseDate(get("Submission Date")),
    startDate:    parseDate(get("Event Start Date")),
    endDate:      parseDate(get("Event End Date")),
    startTime:    normalizeTime(get("Event Start Time")),

    // Planner and contacts
    organization:          get("Organization"),
    lcpo:                  get("Lab/Program"),
    plannerName:           get("Event Planner Name"),
    plannerEmail:          get("Event Planner Email"),
    plannerPhone:          get("Event Planner Phone"),
    onsiteContactName:     get("On-site Contact Name"),
    onsiteContactEmail:    get("On-site Contact Email"),
    onsiteContactPhone:    get("On-site Contact Phone"),
    secondaryContactName:  get("Secondary Contact"),
    secondaryContactPhone: get("Secondary Contact Phone"),
    secondaryContactEmail: get("Secondary Contact Email"),

    // Location
    buildingId:    buildingId || null,
    primaryRoomId: room.roomId,
    rawRoom:       room.resolved ? null : (room.raw || null),
    campus,

    // Attendance and logistics
    expectedAttendance:     parseNumber(get("Attendance")),
    needsCatering:          parseYesNo(get("Catering")),
    needsAlcohol:           parseYesNo(get("Alcohol")),
    deliveryMethod:         get("Delivery Method"),
    lunchOnOwnCount:        get("Lunch on Own/Count & Call"),
    setupNotes:             get("Setup"),
    airwallClosureTimeline: get("Airwall Closure Timeline"),
    agendaType:             get("Agenda Type"),
    agendaLink:             get("Agenda Link"),
    agendaFileUrl:          get("Agenda File"),
    specialRequests:        get("Special Requests"),

    // Financials — amounts are staff-entered, never migrated
    paymentMethod,
    projectIds:   parseProjectIds(get("Project ID")),
    paymentNotes: get("Payment Notes"),

    // Status. Migrated records land closed per the Phase 1 decision, unless
    // the source explicitly says otherwise.
    requestStatus:   requestStatus ?? REQUEST_STATUS.SUBMITTED,
    lifecycleStatus: lifecycleStatus ?? LIFECYCLE_STATUS.CLOSED,
  };

  // Service fields: verbatim text plus derived flag.
  const serviceSource = {
    securityNotes:       get("Security"),
    custodialNotes:      get("Custodial"),
    accessDoorsNotes:    get("Access/Doors"),
    sustainabilityNotes: get("Sustainability"),
  };
  for (const { notes, flag } of SERVICE_FIELDS) {
    doc[notes] = serviceSource[notes] ?? "";
    doc[flag]  = deriveServiceFlag(doc[notes]);
  }

  doc.needsReview = review.length > 0;
  doc.reviewNotes = review;

  return { doc, review };
}
