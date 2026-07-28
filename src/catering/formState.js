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
  PAYMENT_METHOD, REQUESTER_CREATE_STATUS, SERVICE_FIELDS,
} from "./schema.js";

export const STEPS = [
  { id: "basics",    label: "Event basics" },
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

    // Logistics
    buildingId: "",
    primaryRoomId: "",
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
    projectIdsText: "",
    paymentNotes: "",
  };
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

  if (stepId === "logistics") {
    if (!isBlank(form.paymentMethod) && !Object.values(PAYMENT_METHOD).includes(form.paymentMethod)) {
      errors.paymentMethod = "Choose a payment method.";
    }
    if (form.paymentMethod === PAYMENT_METHOD.PROJECT_ID && isBlank(form.projectIdsText)) {
      errors.projectIdsText = "Enter at least one project ID.";
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

/** "PRJ1, PRJ2" → ["PRJ1", "PRJ2"] */
export function parseProjectIdsText(text) {
  return trimmed(text).split(",").map((s) => s.trim()).filter(Boolean);
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
export function toEventDoc(form, uid) {
  const doc = {
    createdBy: uid,
    requestStatus:   REQUESTER_CREATE_STATUS,
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

    buildingId:    trimmed(form.buildingId) || null,
    primaryRoomId: trimmed(form.primaryRoomId) || null,
    // Derived from buildingId purely as a query convenience. Phase 4's rollup
    // must re-derive it server-side rather than trusting this value.
    campus:        BUILDING_CAMPUS[trimmed(form.buildingId).toUpperCase()] ?? null,

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
    projectIds:    parseProjectIdsText(form.projectIdsText),
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
