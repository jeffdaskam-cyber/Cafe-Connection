/**
 * Catering Companion — schema constants.
 *
 * Single source of truth for collection paths, enum values, and the
 * requester-editable field allowlist. Imported by the client (Phase 2+), the
 * seed/migration scripts, and the rules unit tests, so that the allowlist
 * enforced in firestore.rules and the one the UI honors cannot drift apart.
 *
 * Field names are reconciled against the AppSheet source — see
 * docs/catering/DATA_MODEL.md. Pure module: no env, no browser globals.
 */

// ── Collections ──────────────────────────────────────────────────────────────
export const COLLECTIONS = {
  EVENTS:           "catering_events",
  SCHEDULE_DAYS:    "catering_schedule_days",   // subcollection of an event
  MEAL_SELECTIONS:  "catering_meal_selections", // subcollection of a schedule day
  EVENT_ROOMS:      "catering_event_rooms",     // subcollection of an event
  ROOMS:            "rooms",
  BUILDINGS:        "buildings",
};

// ── Status enums ─────────────────────────────────────────────────────────────
// Two orthogonal axes, per DATA_MODEL.md §3. AppSheet's "Request Status" is an
// approval state; its "Status" is a lifecycle state. A confirmed event stays
// open until it is closed out after the fact.
export const REQUEST_STATUS = {
  DRAFT:     "draft",
  SUBMITTED: "submitted",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
};
export const REQUEST_STATUSES = Object.values(REQUEST_STATUS);

export const LIFECYCLE_STATUS = {
  OPEN:   "open",
  CLOSED: "closed",
};
export const LIFECYCLE_STATUSES = Object.values(LIFECYCLE_STATUS);

// The only requestStatus a requester may create a record in. Everything past
// this point is a staff transition (see firestore.rules).
export const REQUESTER_CREATE_STATUS = REQUEST_STATUS.SUBMITTED;

// Requesters may edit their own event only before staff confirm it.
export const REQUESTER_EDITABLE_REQUEST_STATUSES = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.SUBMITTED,
];

// ── Payment ──────────────────────────────────────────────────────────────────
// Values chosen to match the existing event_revenue.type contract: project_id
// rolls up as "internal", ach_external as "external".
export const PAYMENT_METHOD = {
  PROJECT_ID:   "project_id",
  ACH_EXTERNAL: "ach_external",
};
export const PAYMENT_METHODS = Object.values(PAYMENT_METHOD);

// How a split across several project IDs is expressed. A single shared unit
// applies to the whole split — planners cannot mix dollars and percentages in
// one event. Percentage splits are enforced to total 100%; dollar splits are
// captured as entered.
export const PROJECT_ALLOCATION_UNIT = {
  PERCENT: "%",
  DOLLAR:  "$",
};
export const PROJECT_ALLOCATION_UNITS = Object.values(PROJECT_ALLOCATION_UNIT);

// ── Meal periods ─────────────────────────────────────────────────────────────
// "coffee_break" is a real period in the source data that the build plan's
// enum omitted.
export const MEAL_PERIODS = [
  "breakfast",
  "coffee_break",
  "lunch",
  "dinner",
  "reception",
  "other",
];

// ── Campuses ─────────────────────────────────────────────────────────────────
// Must match the values the existing firestore.rules isValidCampus() accepts,
// because Phase 4 rolls catering revenue into event_revenue.
export const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

// Buildings carry no campus in the AppSheet source; this mapping supplies it.
export const BUILDING_CAMPUS = {
  ML:  "Mesa Lab",
  CG1: "Center Green",
  CG2: "Center Green",
  FL0: "Foothills",
  FL1: "Foothills",
  FL2: "Foothills",
  FL3: "Foothills",
  FL4: "Foothills",
  FLA: "Foothills",
};

// ── Service fields ───────────────────────────────────────────────────────────
// Free text in the source, carrying real operational instructions. Each stores
// the verbatim text plus a boolean derived from it for filtering and for the
// intake form's conditional sections. The text is authoritative; the boolean
// is always derived, never authored on its own.
export const SERVICE_FIELDS = [
  { notes: "securityNotes",       flag: "needsSecurity"       },
  { notes: "custodialNotes",      flag: "needsCustodial"      },
  { notes: "accessDoorsNotes",    flag: "needsAccessDoors"    },
  { notes: "sustainabilityNotes", flag: "needsSustainability" },
];

// ── Requester-editable fields ────────────────────────────────────────────────
// Enumerated explicitly rather than allow-by-default, per build plan §3.
// firestore.rules mirrors this list; the rules unit tests assert they match.
//
// Deliberately EXCLUDED: estimatedRevenue, actualRevenue, requestStatus,
// lifecycleStatus, createdBy, createdAt, campus, migratedFromAppSheet, and the
// notification/recap bookkeeping fields. Those are staff- or server-only.
export const REQUESTER_EDITABLE_FIELDS = [
  // Contact details
  "plannerName",
  "plannerEmail",
  "plannerPhone",
  "onsiteContactName",
  "onsiteContactEmail",
  "onsiteContactPhone",
  "secondaryContactName",
  "secondaryContactEmail",
  "secondaryContactPhone",
  "organization",
  "lcpo",
  // Event basics
  "eventName",
  "startDate",
  "endDate",
  "startTime",
  "expectedAttendance",
  // Requested logistics
  "needsCatering",
  "needsAlcohol",
  "deliveryMethod",
  "lunchOnOwnCount",
  "setupNotes",
  "airwallClosureTimeline",
  "agendaType",
  "agendaLink",
  "agendaFileUrl",
  "specialRequests",
  // Service notes and their derived flags
  ...SERVICE_FIELDS.flatMap((f) => [f.notes, f.flag]),
  // Location. Rooms are booked in a separate calendar system before this form
  // is filled in, so these record an existing booking rather than a request.
  // Denormalized from the catering_event_rooms subcollection for list queries;
  // that subcollection is the authoritative record.
  "buildingId",
  "primaryRoomId",
  "roomIds",
  // Derived from buildingId, which is already requester-editable, so allowing
  // it grants no additional authority — it exists to make campus-filtered
  // queries cheap. Phase 4's revenue rollup must re-derive campus server-side
  // from buildingId rather than trusting this value.
  "campus",
  // Payment intent — amounts are staff-only
  "paymentMethod",
  "projectIds",
  // Per-project split: [{ projectId, unit, amount }]. Present only when an event
  // charges more than one project. Amounts are the planner's intended split, not
  // revenue — the finance rollup stays server-side.
  "projectAllocations",
  "paymentNotes",
  // Audit
  "updatedAt",
];

// Fields a requester must never write, on create or update. Enforced in rules;
// listed here so the UI and tests can assert the same boundary.
export const STAFF_ONLY_FIELDS = [
  "estimatedRevenue",
  "actualRevenue",
  "requestStatus",
  "lifecycleStatus",
  "requestStatusHistory",
  "lifecycleStatusHistory",
  "lastNotifiedStatus",
  "lastNotifiedAt",
  "recapUrl",
  "recapGeneratedAt",
  "migratedFromAppSheet",
  "needsReview",
];
