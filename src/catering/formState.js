/**
 * Catering Companion — intake form model.
 *
 * Pure state shape, validation, and Firestore mapping for the multi-step
 * request form. No React, no Firebase, so the whole model is unit tested
 * (test/catering-form.test.mjs).
 *
 * Field names follow docs/catering/DATA_MODEL.md. Anything written here must
 * appear in REQUESTER_EDITABLE_FIELDS, or the security rules will reject the
 * update — the tests assert that.
 */

import {
  BUILDING_CAMPUS, LIFECYCLE_STATUS, MEAL_PERIODS,
  PAYMENT_METHOD, PROJECT_ALLOCATION_UNIT, REQUESTER_CREATE_STATUS, SERVICE_FIELDS,
} from "./schema.js";

export const STEPS = [
  { id: "basics",    label: "Event basics" },
  { id: "rooms",     label: "Rooms"        },
  { id: "schedule",  label: "Schedule"     },
  { id: "meals",     label: "Meals"        },
  { id: "logistics", label: "Logistics"    },
  { id: "review",    label: "Review"       },
];

export const STEP_IDS = STEPS.map((s) => s.id);

let seq = 0;
/** Client-side key for repeatable rows. Not the Firestore document ID. */
export function nextLocalId(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function emptyScheduleDay() {
  return {
    localId: nextLocalId("day"),
    date: "",
    startTime: "",
    endTime: "",
    cateringServicesNeeded: [],
    notes: "",
    meals: [],
  };
}

/**
 * One project ID the event is charged to. `amount` is the planner's split for
 * this ID — a percentage or a dollar figure per the form's shared unit — and is
 * only meaningful once a second project ID is added.
 */
export function emptyProjectId() {
  return {
    localId: nextLocalId("pid"),
    value: "",
    amount: "",
  };
}

export function emptyMeal() {
  return {
    localId: nextLocalId("meal"),
    mealPeriod: "",
    time: "",
    menuSelection: "",
    location: "",
    headcount: "",
  };
}

/**
 * One room booking. Rooms are reserved in a separate calendar system before
 * this form is filled in, so these rows record bookings that already exist.
 */
export function emptyRoomBooking(isPrimary = false) {
  return {
    localId: nextLocalId("room"),
    buildingId: "",
    roomId: "",
    setupType: "",
    startTime: "",
    endTime: "",
    expectedHeadcount: "",
    isPrimary,
    calendarReserved: false,
    notes: "",
  };
}

export function emptyIntakeForm(user = {}) {
  return {
    // Basics
    eventName: "",
    startDate: "",
    endDate: "",
    startTime: "",
    organization: "UCAR",
    lcpo: "",
    expectedAttendance: "",
    plannerName: user.displayName || "",
    plannerEmail: user.email || "",
    plannerPhone: "",
    onsiteContactName: "",
    onsiteContactEmail: "",
    onsiteContactPhone: "",
    secondaryContactName: "",
    secondaryContactEmail: "",
    secondaryContactPhone: "",

    // Schedule (each day carries its own meals)
    scheduleDays: [emptyScheduleDay()],

    // Rooms already booked for this event
    rooms: [emptyRoomBooking(true)],

    // Logistics
    setupNotes: "",
    needsCatering: true,
    needsAlcohol: false,
    deliveryMethod: "",
    lunchOnOwnCount: "",
    airwallClosureTimeline: "",
    agendaType: "",
    agendaLink: "",
    specialRequests: "",
    securityNotes: "",
    custodialNotes: "",
    accessDoorsNotes: "",
    sustainabilityNotes: "",

    // Payment
    paymentMethod: "",
    projectIdRows: [emptyProjectId()],
    projectAllocationUnit: PROJECT_ALLOCATION_UNIT.PERCENT,
    paymentNotes: "",
  };
}

/** Non-blank project IDs entered on the form, trimmed and in order. */
export function projectIdValues(form) {
  return (form.projectIdRows || []).map((r) => trimmed(r.value)).filter(Boolean);
}

// ── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * Errors for one step, keyed by field path. Empty object means the step is
 * valid. Paths for repeatable rows look like "scheduleDays.0.date".
 */
export function validateStep(stepId, form) {
  const errors = {};

  if (stepId === "basics") {
    if (isBlank(form.eventName))    errors.eventName = "Event name is required.";
    if (isBlank(form.plannerName))  errors.plannerName = "Planner name is required.";
    if (isBlank(form.plannerEmail)) errors.plannerEmail = "Planner email is required.";
    else if (!EMAIL_RE.test(form.plannerEmail.trim())) errors.plannerEmail = "Enter a valid email address.";
    if (!isBlank(form.onsiteContactEmail) && !EMAIL_RE.test(form.onsiteContactEmail.trim())) {
      errors.onsiteContactEmail = "Enter a valid email address.";
    }
    if (!isBlank(form.secondaryContactEmail) && !EMAIL_RE.test(form.secondaryContactEmail.trim())) {
      errors.secondaryContactEmail = "Enter a valid email address.";
    }
    if (isBlank(form.startDate)) errors.startDate = "Start date is required.";
    if (!isBlank(form.endDate) && !isBlank(form.startDate) && form.endDate < form.startDate) {
      errors.endDate = "End date cannot be before the start date.";
    }
    const attendance = Number(form.expectedAttendance);
    if (isBlank(form.expectedAttendance)) errors.expectedAttendance = "Expected attendance is required.";
    else if (!Number.isFinite(attendance) || attendance < 0) errors.expectedAttendance = "Enter a number.";
  }

  if (stepId === "schedule") {
    if (!form.scheduleDays?.length) {
      errors.scheduleDays = "Add at least one event day.";
    } else {
      form.scheduleDays.forEach((day, i) => {
        if (isBlank(day.date)) errors[`scheduleDays.${i}.date`] = "Date is required.";
        if (!isBlank(day.startTime) && !isBlank(day.endTime) && day.endTime <= day.startTime) {
          errors[`scheduleDays.${i}.endTime`] = "End time must be after the start time.";
        }
        if (!isBlank(form.startDate) && !isBlank(day.date) && day.date < form.startDate) {
          errors[`scheduleDays.${i}.date`] = "Day falls before the event start date.";
        }
      });
    }
  }

  if (stepId === "meals") {
    form.scheduleDays?.forEach((day, i) => {
      day.meals?.forEach((meal, j) => {
        const path = `scheduleDays.${i}.meals.${j}`;
        if (isBlank(meal.mealPeriod)) errors[`${path}.mealPeriod`] = "Choose a meal period.";
        else if (!MEAL_PERIODS.includes(meal.mealPeriod)) errors[`${path}.mealPeriod`] = "Unknown meal period.";
        if (!isBlank(meal.headcount) && !Number.isFinite(Number(meal.headcount))) {
          errors[`${path}.headcount`] = "Enter a number.";
        }
      });
    });
  }

  if (stepId === "rooms") {
    // The form is filled in after the room is booked elsewhere, so at least
    // one real booking is expected.
    if (!form.rooms?.length) {
      errors.rooms = "Add the room you have booked for this event.";
    } else {
      form.rooms.forEach((room, i) => {
        if (isBlank(room.buildingId)) errors[`rooms.${i}.buildingId`] = "Choose the building.";
        if (isBlank(room.roomId))     errors[`rooms.${i}.roomId`] = "Choose the room you booked.";
        if (!isBlank(room.startTime) && !isBlank(room.endTime) && room.endTime <= room.startTime) {
          errors[`rooms.${i}.endTime`] = "End time must be after the start time.";
        }
        if (!isBlank(room.expectedHeadcount) && !Number.isFinite(Number(room.expectedHeadcount))) {
          errors[`rooms.${i}.expectedHeadcount`] = "Enter a number.";
        }
      });
      if (form.rooms.length > 1 && form.rooms.filter((r) => r.isPrimary).length !== 1) {
        errors.rooms = "Mark exactly one room as the primary space.";
      }
    }
  }

  if (stepId === "logistics") {
    if (!isBlank(form.paymentMethod) && !Object.values(PAYMENT_METHOD).includes(form.paymentMethod)) {
      errors.paymentMethod = "Choose a payment method.";
    }
    if (form.paymentMethod === PAYMENT_METHOD.PROJECT_ID) {
      const ids = projectIdValues(form);
      if (ids.length === 0) {
        errors.projectIdRows = "Enter at least one project ID.";
      } else if (ids.length > 1 && form.projectAllocationUnit === PROJECT_ALLOCATION_UNIT.PERCENT) {
        // A percentage split has to describe the whole charge. Dollar splits are
        // captured as entered, since the event total is not known at intake.
        const sum = (form.projectIdRows || [])
          .filter((r) => !isBlank(r.value))
          .reduce((total, r) => total + (Number(r.amount) || 0), 0);
        if (Math.abs(sum - 100) > 0.01) {
          errors.projectAllocations = "Percentage allocations must add up to 100%.";
        }
      }
    }
    if (!isBlank(form.agendaLink) && !/^https?:\/\//i.test(form.agendaLink.trim())) {
      errors.agendaLink = "Enter a full URL starting with http:// or https://";
    }
  }

  return errors;
}

/** Validate every step. Used before submit and to mark step completeness. */
export function validateAll(form) {
  return STEP_IDS.reduce(
    (acc, stepId) => Object.assign(acc, validateStep(stepId, form)),
    {}
  );
}

export function isStepValid(stepId, form) {
  return Object.keys(validateStep(stepId, form)).length === 0;
}

// ── Mapping to Firestore ─────────────────────────────────────────────────────

function trimmed(v) {
  return isBlank(v) ? "" : String(v).trim();
}

function numberOrNull(v) {
  if (isBlank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "PRJ1, PRJ2" → ["PRJ1", "PRJ2"]. Kept to migrate older comma-joined drafts. */
export function parseProjectIdsText(text) {
  return trimmed(text).split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * The per-project split, or [] when there is no split to record.
 *
 * A split only exists once a second project ID is added, so a single-ID event
 * emits no allocations. Every entry carries the form's shared unit, so a reader
 * never has to reconcile mixed dollar and percentage rows.
 */
export function buildProjectAllocations(form) {
  const rows = (form.projectIdRows || []).filter((r) => !isBlank(r.value));
  if (rows.length <= 1) return [];
  const unit = form.projectAllocationUnit === PROJECT_ALLOCATION_UNIT.DOLLAR
    ? PROJECT_ALLOCATION_UNIT.DOLLAR
    : PROJECT_ALLOCATION_UNIT.PERCENT;
  return rows.map((r) => ({
    projectId: trimmed(r.value),
    unit,
    amount: numberOrNull(r.amount),
  }));
}

export function deriveFlag(text) {
  const v = trimmed(text).toLowerCase();
  if (v === "") return false;
  return v !== "no" && v !== "n/a" && v !== "na" && v !== "none";
}

/**
 * Build the catering_events document from form state.
 *
 * Only ever emits fields on the requester allowlist, so the same shape works
 * for both create and update. Revenue fields are never produced.
 */
/** The booking that represents the event's main space. */
export function primaryRoomBooking(form) {
  const rooms = (form.rooms || []).filter((r) => !isBlank(r.roomId));
  if (rooms.length === 0) return null;
  return rooms.find((r) => r.isPrimary) ?? rooms[0];
}

export function toEventDoc(form, uid, { status = REQUESTER_CREATE_STATUS } = {}) {
  const primary = primaryRoomBooking(form);
  const buildingId = trimmed(primary?.buildingId);
  const doc = {
    createdBy: uid,
    requestStatus:   status,
    lifecycleStatus: LIFECYCLE_STATUS.OPEN,

    eventName:    trimmed(form.eventName),
    startDate:    trimmed(form.startDate),
    endDate:      trimmed(form.endDate) || trimmed(form.startDate),
    startTime:    trimmed(form.startTime),
    organization: trimmed(form.organization),
    lcpo:         trimmed(form.lcpo),
    expectedAttendance: numberOrNull(form.expectedAttendance),

    plannerName:           trimmed(form.plannerName),
    plannerEmail:          trimmed(form.plannerEmail),
    plannerPhone:          trimmed(form.plannerPhone),
    onsiteContactName:     trimmed(form.onsiteContactName),
    onsiteContactEmail:    trimmed(form.onsiteContactEmail),
    onsiteContactPhone:    trimmed(form.onsiteContactPhone),
    secondaryContactName:  trimmed(form.secondaryContactName),
    secondaryContactEmail: trimmed(form.secondaryContactEmail),
    secondaryContactPhone: trimmed(form.secondaryContactPhone),

    // Denormalized from the room bookings below, which are authoritative.
    // Kept on the event so the staff queue and dashboards can filter without
    // a collection-group query.
    buildingId:    buildingId || null,
    primaryRoomId: trimmed(primary?.roomId) || null,
    roomIds:       (form.rooms || []).map((r) => trimmed(r.roomId)).filter(Boolean),
    // Derived from buildingId purely as a query convenience. Phase 4's rollup
    // must re-derive it server-side rather than trusting this value.
    campus:        BUILDING_CAMPUS[buildingId.toUpperCase()] ?? null,

    needsCatering:  Boolean(form.needsCatering),
    needsAlcohol:   Boolean(form.needsAlcohol),
    deliveryMethod: trimmed(form.deliveryMethod),
    lunchOnOwnCount: trimmed(form.lunchOnOwnCount),
    setupNotes:      trimmed(form.setupNotes),
    airwallClosureTimeline: trimmed(form.airwallClosureTimeline),
    agendaType:      trimmed(form.agendaType),
    agendaLink:      trimmed(form.agendaLink),
    agendaFileUrl:   "",
    specialRequests: trimmed(form.specialRequests),

    paymentMethod: trimmed(form.paymentMethod) || null,
    projectIds:    projectIdValues(form),
    projectAllocations: buildProjectAllocations(form),
    paymentNotes:  trimmed(form.paymentNotes),
  };

  // Service fields: verbatim text plus derived flag.
  for (const { notes, flag } of SERVICE_FIELDS) {
    doc[notes] = trimmed(form[notes]);
    doc[flag]  = deriveFlag(doc[notes]);
  }

  return doc;
}

/** Schedule day subcollection documents, each with its nested meals. */
export function toScheduleDayDocs(form) {
  return (form.scheduleDays || []).map((day) => ({
    localId: day.localId,
    data: {
      date:      trimmed(day.date),
      startTime: trimmed(day.startTime),
      endTime:   trimmed(day.endTime),
      cateringServicesNeeded: [...(day.cateringServicesNeeded || [])],
      notes:     trimmed(day.notes),
    },
    meals: (day.meals || []).map((meal) => ({
      localId: meal.localId,
      data: {
        mealPeriod:    trimmed(meal.mealPeriod),
        time:          trimmed(meal.time),
        menuSelection: trimmed(meal.menuSelection),
        location:      trimmed(meal.location),
        headcount:     numberOrNull(meal.headcount),
      },
    })),
  }));
}

/**
 * Room booking subcollection documents.
 *
 * These record rooms already reserved in the separate calendar system, so they
 * are written by the requester on submit rather than assigned by staff later.
 */
export function toRoomBookingDocs(form) {
  const rooms = (form.rooms || []).filter((r) => !isBlank(r.roomId));
  const primary = primaryRoomBooking(form);
  return rooms.map((room) => ({
    localId: room.localId,
    data: {
      buildingId:        trimmed(room.buildingId) || null,
      roomId:            trimmed(room.roomId),
      setupType:         trimmed(room.setupType),
      startTime:         trimmed(room.startTime),
      endTime:           trimmed(room.endTime),
      expectedHeadcount: numberOrNull(room.expectedHeadcount),
      isPrimary:         room.localId === primary?.localId,
      calendarReserved:  Boolean(room.calendarReserved),
      notes:             trimmed(room.notes),
    },
  }));
}

// ── Mapping from Firestore back into form state ───────────────────────────────
// The inverse of toEventDoc / toScheduleDayDocs / toRoomBookingDocs, so a saved
// event (a draft, or one already submitted or confirmed) can be reopened and
// edited. Numbers become strings because the inputs are text/number controls,
// and fresh localIds are minted for every repeatable row.

const str = (v) => (v === null || v === undefined ? "" : String(v));
const numStr = (v) => (v === null || v === undefined || v === "" ? "" : String(v));

export function eventToForm(event = {}, days = [], rooms = []) {
  const scheduleDays = (days || []).map((d) => ({
    localId: nextLocalId("day"),
    date:      str(d.date),
    startTime: str(d.startTime),
    endTime:   str(d.endTime),
    cateringServicesNeeded: [...(d.cateringServicesNeeded || [])],
    notes:     str(d.notes),
    meals: (d.meals || []).map((m) => ({
      localId: nextLocalId("meal"),
      mealPeriod:    str(m.mealPeriod),
      time:          str(m.time),
      menuSelection: str(m.menuSelection),
      location:      str(m.location),
      headcount:     numStr(m.headcount),
    })),
  }));

  const roomRows = (rooms || []).map((r) => ({
    localId: nextLocalId("room"),
    buildingId: str(r.buildingId),
    roomId:     str(r.roomId),
    setupType:  str(r.setupType),
    startTime:  str(r.startTime),
    endTime:    str(r.endTime),
    expectedHeadcount: numStr(r.expectedHeadcount),
    isPrimary:  Boolean(r.isPrimary),
    calendarReserved: Boolean(r.calendarReserved),
    notes:      str(r.notes),
  }));
  // Exactly one booking must be primary, matching the intake form's invariant.
  if (roomRows.length && !roomRows.some((r) => r.isPrimary)) roomRows[0].isPrimary = true;

  // Rebuild the project-ID rows from the flat projectIds plus any recorded
  // split. The shared unit comes from the split (all entries carry the same one)
  // and defaults to percentage when there is no split.
  const allocations = Array.isArray(event.projectAllocations) ? event.projectAllocations : [];
  const amountByProjectId = new Map(allocations.map((a) => [a.projectId, a.amount]));
  const projectAllocationUnit = allocations[0]?.unit === PROJECT_ALLOCATION_UNIT.DOLLAR
    ? PROJECT_ALLOCATION_UNIT.DOLLAR
    : PROJECT_ALLOCATION_UNIT.PERCENT;
  const projectIdRows = (event.projectIds || []).map((pid) => ({
    localId: nextLocalId("pid"),
    value:   str(pid),
    amount:  amountByProjectId.has(pid) ? numStr(amountByProjectId.get(pid)) : "",
  }));

  return {
    eventName:    str(event.eventName),
    startDate:    str(event.startDate),
    endDate:      str(event.endDate),
    startTime:    str(event.startTime),
    organization: str(event.organization) || "UCAR",
    lcpo:         str(event.lcpo),
    expectedAttendance: numStr(event.expectedAttendance),

    plannerName:           str(event.plannerName),
    plannerEmail:          str(event.plannerEmail),
    plannerPhone:          str(event.plannerPhone),
    onsiteContactName:     str(event.onsiteContactName),
    onsiteContactEmail:    str(event.onsiteContactEmail),
    onsiteContactPhone:    str(event.onsiteContactPhone),
    secondaryContactName:  str(event.secondaryContactName),
    secondaryContactEmail: str(event.secondaryContactEmail),
    secondaryContactPhone: str(event.secondaryContactPhone),

    scheduleDays: scheduleDays.length ? scheduleDays : [emptyScheduleDay()],
    rooms:        roomRows.length ? roomRows : [emptyRoomBooking(true)],

    setupNotes:      str(event.setupNotes),
    needsCatering:   event.needsCatering === undefined ? true : Boolean(event.needsCatering),
    needsAlcohol:    Boolean(event.needsAlcohol),
    deliveryMethod:  str(event.deliveryMethod),
    lunchOnOwnCount: str(event.lunchOnOwnCount),
    airwallClosureTimeline: str(event.airwallClosureTimeline),
    agendaType:      str(event.agendaType),
    agendaLink:      str(event.agendaLink),
    specialRequests: str(event.specialRequests),
    securityNotes:       str(event.securityNotes),
    custodialNotes:      str(event.custodialNotes),
    accessDoorsNotes:    str(event.accessDoorsNotes),
    sustainabilityNotes: str(event.sustainabilityNotes),

    paymentMethod: str(event.paymentMethod),
    projectIdRows: projectIdRows.length ? projectIdRows : [emptyProjectId()],
    projectAllocationUnit,
    paymentNotes:  str(event.paymentNotes),
  };
}

// ── Draft persistence ────────────────────────────────────────────────────────
// Keeps an in-progress request across a page refresh. Storage is best-effort:
// a full disk or private-mode restriction must never break the form.

export const DRAFT_STORAGE_KEY = "cateringIntakeDraft";

/** localStorage when it's available and permitted, otherwise null. */
export function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** True when an in-progress request is waiting to be resumed. */
export function hasDraft(storage = browserStorage()) {
  return loadDraft(storage) !== null;
}

export function saveDraft(form, storage) {
  try {
    storage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage) {
  try {
    const raw = storage?.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    // Guard against a stored shape from an older version of the form.
    if (!Array.isArray(parsed.scheduleDays)) return null;
    // Migrate a draft saved before project IDs became individual rows: the old
    // shape stored them comma-joined in `projectIdsText`.
    if (!Array.isArray(parsed.projectIdRows)) {
      const ids = parseProjectIdsText(parsed.projectIdsText || "");
      parsed.projectIdRows = ids.length
        ? ids.map((value) => ({ localId: nextLocalId("pid"), value, amount: "" }))
        : [emptyProjectId()];
    }
    if (!parsed.projectAllocationUnit) {
      parsed.projectAllocationUnit = PROJECT_ALLOCATION_UNIT.PERCENT;
    }
    delete parsed.projectIdsText;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(storage) {
  try {
    storage?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* best effort */
  }
}

/**
 * Placeholder text for the "Headcount in this room" field: the selected room's
 * capacity, as guidance before the planner types their own number.
 *
 * Returns "" when no room is selected or the room has no recorded capacity —
 * an empty placeholder renders as an empty field, which is the right nothing.
 * Deliberately not a default *value*: capacity is what the room holds, not what
 * the planner expects, and pre-filling it would submit a guess as a fact.
 */
export function capacityPlaceholder(rooms, roomId) {
  if (!roomId || !Array.isArray(rooms)) return "";
  const room = rooms.find((r) => r.id === roomId);
  const capacity = room?.capacity;
  return typeof capacity === "number" && capacity > 0 ? `Capacity ${capacity}` : "";
}
