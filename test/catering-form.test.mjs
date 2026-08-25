import test from "node:test";
import assert from "node:assert/strict";

import {
  STEP_IDS, capacityPlaceholder, clearDraft, deriveFlag, emptyIntakeForm, emptyMeal,
  emptyRoomBooking, eventToForm,
  emptyScheduleDay, isStepValid, loadDraft, parseProjectIdsText, primaryRoomBooking,
  saveDraft, toEventDoc, toRoomBookingDocs, toScheduleDayDocs, validateAll, validateStep,
} from "../src/catering/formState.js";
import { REQUESTER_EDITABLE_FIELDS, STAFF_ONLY_FIELDS } from "../src/catering/schema.js";

const USER = { uid: "uid123", email: "planner@ucar.edu", displayName: "Test Planner" };

function completeForm() {
  const form = emptyIntakeForm(USER);
  form.eventName = "CESM Working Group";
  form.startDate = "2026-08-10";
  form.endDate = "2026-08-11";
  form.expectedAttendance = "60";
  form.rooms = [{
    ...emptyRoomBooking(true),
    buildingId: "CG1", roomId: "CG1-2122",
    setupType: "Classroom", startTime: "08:00", endTime: "17:00",
    expectedHeadcount: "60",
  }];
  form.paymentMethod = "project_id";
  form.projectIdRows = [
    { localId: "pid_1", value: "PRJ000000001", amount: "50" },
    { localId: "pid_2", value: "PRJ000000002", amount: "50" },
  ];
  form.projectAllocationUnit = "%";
  form.securityNotes = "Guard 8am-5pm";
  form.scheduleDays = [{
    ...emptyScheduleDay(),
    date: "2026-08-10",
    startTime: "08:00",
    endTime: "17:00",
    cateringServicesNeeded: ["coffee_break", "lunch"],
    meals: [{ ...emptyMeal(), mealPeriod: "lunch", time: "12:00", menuSelection: "Taco bar", headcount: "60" }],
  }];
  return form;
}

// ── Validation ───────────────────────────────────────────────────────────────

test("a blank form fails the basics step with specific field errors", () => {
  const errors = validateStep("basics", emptyIntakeForm());
  assert.ok(errors.eventName);
  assert.ok(errors.plannerName);
  assert.ok(errors.startDate);
  assert.ok(errors.expectedAttendance);
});

test("a complete form passes every step", () => {
  const form = completeForm();
  for (const stepId of STEP_IDS) {
    assert.equal(isStepValid(stepId, form), true, `step "${stepId}" should be valid`);
  }
  assert.deepEqual(validateAll(form), {});
});

test("planner email must be well formed", () => {
  const form = completeForm();
  form.plannerEmail = "not-an-email";
  assert.ok(validateStep("basics", form).plannerEmail);
});

test("optional contact emails are validated only when filled in", () => {
  const form = completeForm();
  assert.equal(validateStep("basics", form).onsiteContactEmail, undefined);
  form.onsiteContactEmail = "nope";
  assert.ok(validateStep("basics", form).onsiteContactEmail);
});

test("end date cannot precede start date", () => {
  const form = completeForm();
  form.endDate = "2026-08-01";
  assert.ok(validateStep("basics", form).endDate);
});

test("a schedule day cannot end before it starts", () => {
  const form = completeForm();
  form.scheduleDays[0].endTime = "07:00";
  assert.ok(validateStep("schedule", form)["scheduleDays.0.endTime"]);
});

test("a schedule day cannot precede the event start date", () => {
  const form = completeForm();
  form.scheduleDays[0].date = "2026-01-01";
  assert.ok(validateStep("schedule", form)["scheduleDays.0.date"]);
});

test("at least one event day is required", () => {
  const form = completeForm();
  form.scheduleDays = [];
  assert.ok(validateStep("schedule", form).scheduleDays);
});

test("a meal must have a recognized period", () => {
  const form = completeForm();
  form.scheduleDays[0].meals[0].mealPeriod = "";
  assert.ok(validateStep("meals", form)["scheduleDays.0.meals.0.mealPeriod"]);

  form.scheduleDays[0].meals[0].mealPeriod = "brunch";
  assert.ok(validateStep("meals", form)["scheduleDays.0.meals.0.mealPeriod"]);
});

test("choosing Project ID payment requires at least one project ID", () => {
  const form = completeForm();
  form.projectIdRows = [{ localId: "pid_1", value: "", amount: "" }];
  assert.ok(validateStep("logistics", form).projectIdRows);

  form.paymentMethod = "ach_external";
  assert.equal(validateStep("logistics", form).projectIdRows, undefined);
});

test("a percentage split must add up to 100%", () => {
  const form = completeForm();
  form.projectAllocationUnit = "%";
  form.projectIdRows = [
    { localId: "pid_1", value: "PRJ000000001", amount: "60" },
    { localId: "pid_2", value: "PRJ000000002", amount: "30" },
  ];
  assert.ok(validateStep("logistics", form).projectAllocations, "90% is short of 100%");

  form.projectIdRows[1].amount = "40";
  assert.equal(validateStep("logistics", form).projectAllocations, undefined, "now totals 100%");
});

test("a dollar split is captured without a total check", () => {
  const form = completeForm();
  form.projectAllocationUnit = "$";
  form.projectIdRows = [
    { localId: "pid_1", value: "PRJ000000001", amount: "500" },
    { localId: "pid_2", value: "PRJ000000002", amount: "250" },
  ];
  assert.equal(validateStep("logistics", form).projectAllocations, undefined);
});

test("a single project ID needs no allocation", () => {
  const form = completeForm();
  form.projectIdRows = [{ localId: "pid_1", value: "PRJ000000001", amount: "" }];
  assert.equal(validateStep("logistics", form).projectAllocations, undefined);
  assert.equal(validateStep("logistics", form).projectIdRows, undefined);
});

test("an agenda link must be a full URL", () => {
  const form = completeForm();
  form.agendaLink = "example.com/agenda";
  assert.ok(validateStep("logistics", form).agendaLink);
  form.agendaLink = "https://example.com/agenda";
  assert.equal(validateStep("logistics", form).agendaLink, undefined);
});

// ── Mapping to Firestore ─────────────────────────────────────────────────────

test("toEventDoc emits only fields the security rules allow a requester to write", () => {
  const doc = toEventDoc(completeForm(), USER.uid);
  const alwaysAllowed = ["createdBy", "requestStatus", "lifecycleStatus"];
  const permitted = new Set([...REQUESTER_EDITABLE_FIELDS, ...alwaysAllowed]);

  const disallowed = Object.keys(doc).filter((k) => !permitted.has(k));
  assert.deepEqual(disallowed, [],
    `toEventDoc writes fields outside the requester allowlist: ${disallowed.join(", ")}`);
});

test("toEventDoc never emits a staff-only field", () => {
  const doc = toEventDoc(completeForm(), USER.uid);
  for (const field of STAFF_ONLY_FIELDS) {
    if (["requestStatus", "lifecycleStatus"].includes(field)) continue; // set on create only
    assert.equal(field in doc, false, `toEventDoc must not write ${field}`);
  }
  assert.equal("estimatedRevenue" in doc, false);
  assert.equal("actualRevenue" in doc, false);
});

test("toEventDoc submits as submitted/open owned by the caller", () => {
  const doc = toEventDoc(completeForm(), USER.uid);
  assert.equal(doc.createdBy, USER.uid);
  assert.equal(doc.requestStatus, "submitted");
  assert.equal(doc.lifecycleStatus, "open");
});

test("toEventDoc derives campus from the booked room's building", () => {
  const form = completeForm();
  assert.equal(toEventDoc(form, USER.uid).campus, "Center Green");
  form.rooms[0].buildingId = "ML";
  assert.equal(toEventDoc(form, USER.uid).campus, "Mesa Lab");
  form.rooms = [];
  assert.equal(toEventDoc(form, USER.uid).campus, null);
});

test("toEventDoc splits project IDs and derives service flags", () => {
  const doc = toEventDoc(completeForm(), USER.uid);
  assert.deepEqual(doc.projectIds, ["PRJ000000001", "PRJ000000002"]);
  assert.equal(doc.securityNotes, "Guard 8am-5pm");
  assert.equal(doc.needsSecurity, true);
  assert.equal(doc.custodialNotes, "");
  assert.equal(doc.needsCustodial, false);
});

test("toEventDoc records a per-project split only when several projects share the charge", () => {
  const doc = toEventDoc(completeForm(), USER.uid);
  assert.deepEqual(doc.projectAllocations, [
    { projectId: "PRJ000000001", unit: "%", amount: 50 },
    { projectId: "PRJ000000002", unit: "%", amount: 50 },
  ]);

  const single = completeForm();
  single.projectIdRows = [{ localId: "pid_1", value: "PRJ000000001", amount: "" }];
  assert.deepEqual(toEventDoc(single, USER.uid).projectIds, ["PRJ000000001"]);
  assert.deepEqual(toEventDoc(single, USER.uid).projectAllocations, [],
    "a single project ID carries no split");
});

test("toEventDoc defaults a single-day event's end date to its start date", () => {
  const form = completeForm();
  form.endDate = "";
  assert.equal(toEventDoc(form, USER.uid).endDate, "2026-08-10");
});

test("toEventDoc coerces attendance to a number and blanks to null", () => {
  const form = completeForm();
  assert.equal(toEventDoc(form, USER.uid).expectedAttendance, 60);
  form.expectedAttendance = "";
  assert.equal(toEventDoc(form, USER.uid).expectedAttendance, null);
});

test("toScheduleDayDocs nests meals under their day", () => {
  const days = toScheduleDayDocs(completeForm());
  assert.equal(days.length, 1);
  assert.equal(days[0].data.date, "2026-08-10");
  assert.deepEqual(days[0].data.cateringServicesNeeded, ["coffee_break", "lunch"]);
  assert.equal(days[0].meals.length, 1);
  assert.equal(days[0].meals[0].data.mealPeriod, "lunch");
  assert.equal(days[0].meals[0].data.headcount, 60);
});

test("eventToForm rebuilds editable form state from a saved event", () => {
  const form = completeForm();
  const doc = toEventDoc(form, USER.uid);
  const days = toScheduleDayDocs(form).map((d) => ({
    ...d.data, meals: d.meals.map((m) => m.data),
  }));
  const rooms = toRoomBookingDocs(form).map((r) => r.data);

  const rebuilt = eventToForm(doc, days, rooms);

  // Numbers come back as strings for the inputs; project IDs rebuild into rows.
  assert.equal(rebuilt.eventName, "CESM Working Group");
  assert.equal(rebuilt.expectedAttendance, "60");
  assert.equal(rebuilt.projectAllocationUnit, "%");
  assert.deepEqual(rebuilt.projectIdRows.map((r) => [r.value, r.amount]), [
    ["PRJ000000001", "50"],
    ["PRJ000000002", "50"],
  ]);
  assert.equal(rebuilt.scheduleDays.length, 1);
  assert.deepEqual(rebuilt.scheduleDays[0].cateringServicesNeeded, ["coffee_break", "lunch"]);
  assert.equal(rebuilt.scheduleDays[0].meals[0].mealPeriod, "lunch");
  assert.equal(rebuilt.scheduleDays[0].meals[0].headcount, "60");
  assert.equal(rebuilt.rooms[0].roomId, "CG1-2122");
  assert.equal(rebuilt.rooms[0].isPrimary, true);

  // A saved event round-trips: re-mapping the rebuilt form reproduces the doc.
  assert.deepEqual(toEventDoc(rebuilt, USER.uid), doc);
});

test("eventToForm falls back to one empty day and room for a bare event", () => {
  const rebuilt = eventToForm({ eventName: "Sparse" }, [], []);
  assert.equal(rebuilt.scheduleDays.length, 1);
  assert.equal(rebuilt.rooms.length, 1);
  assert.equal(rebuilt.rooms[0].isPrimary, true);
  assert.equal(rebuilt.organization, "UCAR");
  assert.equal(rebuilt.needsCatering, true);
});

// ── Coffee Break structured menu selections ──────────────────────────────────

function coffeeBreakForm() {
  const form = completeForm();
  form.scheduleDays[0].meals = [{
    ...emptyMeal(),
    mealPeriod: "coffee_break",
    time: "10:00",
    headcount: "40",
    menuItems: [
      {
        localId: "mi_1", itemId: "cb-pkg-mediterranean", category: "package",
        subcategory: "", name: "Mediterranean", price: "11.25", quantity: "40",
        beverage: "Coffee, Tea, & Water",
      },
      {
        localId: "mi_2", itemId: "cb-am-bagels-spreads", category: "a_la_carte",
        subcategory: "morning", name: "Assorted Bagels with Spreads", price: "4.5",
        quantity: "20", beverage: "",
      },
    ],
  }];
  return form;
}

test("toScheduleDayDocs writes structured menuItems and derives menuSelection", () => {
  const days = toScheduleDayDocs(coffeeBreakForm());
  const meal = days[0].meals[0].data;

  assert.equal(meal.menuItems.length, 2);
  assert.equal(meal.menuItems[0].itemId, "cb-pkg-mediterranean");
  assert.equal(meal.menuItems[0].price, 11.25);
  assert.equal(meal.menuItems[0].quantity, 40);
  assert.equal(meal.menuItems[0].beverage, "Coffee, Tea, & Water");
  // à la carte carries a subcategory and no beverage.
  assert.equal(meal.menuItems[1].subcategory, "morning");
  assert.equal(meal.menuItems[1].beverage, null);
  // menuSelection is derived so downstream readers (recap, schedule) still work.
  assert.equal(
    meal.menuSelection,
    "Mediterranean (Coffee, Tea, & Water) × 40; Assorted Bagels with Spreads × 20",
  );
});

test("a Coffee Break meal round-trips through eventToForm exactly", () => {
  const form = coffeeBreakForm();
  const doc = toEventDoc(form, USER.uid);
  const days = toScheduleDayDocs(form).map((d) => ({
    ...d.data, meals: d.meals.map((m) => m.data),
  }));
  const rooms = toRoomBookingDocs(form).map((r) => r.data);

  const rebuilt = eventToForm(doc, days, rooms);
  const meal = rebuilt.scheduleDays[0].meals[0];

  assert.equal(meal.mealPeriod, "coffee_break");
  assert.equal(meal.menuItems.length, 2);
  assert.deepEqual(
    meal.menuItems.map((i) => [i.itemId, i.category, i.subcategory, i.name, i.price, i.quantity, i.beverage]),
    [
      ["cb-pkg-mediterranean", "package", "", "Mediterranean", "11.25", "40", "Coffee, Tea, & Water"],
      ["cb-am-bagels-spreads", "a_la_carte", "morning", "Assorted Bagels with Spreads", "4.5", "20", ""],
    ],
  );

  // Re-mapping the rebuilt form reproduces the stored schedule-day docs.
  const rebuiltDays = toScheduleDayDocs(rebuilt).map((d) => ({
    ...d.data, meals: d.meals.map((m) => m.data),
  }));
  assert.deepEqual(rebuiltDays, days);
});

test("a meal with no menuItems keeps its free-text menuSelection", () => {
  const days = toScheduleDayDocs(completeForm());
  const meal = days[0].meals[0].data;
  assert.equal(meal.menuSelection, "Taco bar");
  assert.deepEqual(meal.menuItems, []);
});

test("parseProjectIdsText and deriveFlag handle edge input", () => {
  assert.deepEqual(parseProjectIdsText(" A , B ,, "), ["A", "B"]);
  assert.deepEqual(parseProjectIdsText(""), []);
  assert.equal(deriveFlag("No"), false);
  assert.equal(deriveFlag("N/A"), false);
  assert.equal(deriveFlag(""), false);
  assert.equal(deriveFlag("Extra pickup"), true);
});

// ── Draft persistence ────────────────────────────────────────────────────────

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

test("a draft round-trips through storage", () => {
  const storage = fakeStorage();
  const form = completeForm();
  assert.equal(saveDraft(form, storage), true);
  const loaded = loadDraft(storage);
  assert.equal(loaded.eventName, "CESM Working Group");
  assert.equal(loaded.scheduleDays[0].meals[0].menuSelection, "Taco bar");
});

test("clearDraft removes the stored draft", () => {
  const storage = fakeStorage();
  saveDraft(completeForm(), storage);
  clearDraft(storage);
  assert.equal(loadDraft(storage), null);
});

test("loadDraft rejects corrupt or stale shapes instead of throwing", () => {
  const storage = fakeStorage();
  storage.setItem("cateringIntakeDraft", "{not json");
  assert.equal(loadDraft(storage), null);

  storage.setItem("cateringIntakeDraft", JSON.stringify({ eventName: "x" }));
  assert.equal(loadDraft(storage), null, "a draft with no scheduleDays array is stale");

  storage.setItem("cateringIntakeDraft", JSON.stringify([1, 2, 3]));
  assert.equal(loadDraft(storage), null);
});

test("draft persistence survives unavailable storage", () => {
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("denied"); },
  };
  assert.equal(saveDraft(completeForm(), broken), false);
  assert.equal(loadDraft(broken), null);
  assert.doesNotThrow(() => clearDraft(broken));
  assert.equal(loadDraft(null), null);
});

// ── Booked rooms ─────────────────────────────────────────────────────────────
// Rooms are reserved in a separate calendar system before this form is filled
// in, so a room recorded here is an existing booking, not a request.

test("the rooms step requires a building and a room", () => {
  const form = completeForm();
  form.rooms = [{ ...emptyRoomBooking(true) }];
  const errors = validateStep("rooms", form);
  assert.ok(errors["rooms.0.buildingId"]);
  assert.ok(errors["rooms.0.roomId"]);
});

test("at least one booked room is required", () => {
  const form = completeForm();
  form.rooms = [];
  assert.ok(validateStep("rooms", form).rooms);
});

test("a booked room cannot end before it starts", () => {
  const form = completeForm();
  form.rooms[0].endTime = "07:00";
  assert.ok(validateStep("rooms", form)["rooms.0.endTime"]);
});

test("exactly one room must be primary when several are booked", () => {
  const form = completeForm();
  form.rooms = [
    { ...emptyRoomBooking(true), buildingId: "CG1", roomId: "CG1-2122" },
    { ...emptyRoomBooking(true), buildingId: "CG1", roomId: "CG1-2126" },
  ];
  assert.ok(validateStep("rooms", form).rooms, "two primaries should fail");

  form.rooms[1].isPrimary = false;
  assert.equal(validateStep("rooms", form).rooms, undefined);
});

test("primaryRoomBooking picks the flagged room, else the first", () => {
  const form = completeForm();
  form.rooms = [
    { ...emptyRoomBooking(false), buildingId: "CG1", roomId: "CG1-2122" },
    { ...emptyRoomBooking(true), buildingId: "ML", roomId: "ML-40" },
  ];
  assert.equal(primaryRoomBooking(form).roomId, "ML-40");

  form.rooms.forEach((r) => { r.isPrimary = false; });
  assert.equal(primaryRoomBooking(form).roomId, "CG1-2122");

  form.rooms = [];
  assert.equal(primaryRoomBooking(form), null);
});

test("toEventDoc denormalizes booked rooms onto the event", () => {
  const form = completeForm();
  form.rooms = [
    { ...emptyRoomBooking(false), buildingId: "CG1", roomId: "CG1-2122" },
    { ...emptyRoomBooking(true), buildingId: "ML", roomId: "ML-40" },
  ];
  const doc = toEventDoc(form, USER.uid);
  assert.equal(doc.primaryRoomId, "ML-40");
  assert.equal(doc.buildingId, "ML");
  assert.deepEqual(doc.roomIds, ["CG1-2122", "ML-40"]);
});

test("toRoomBookingDocs emits one document per booked room", () => {
  const rooms = toRoomBookingDocs(completeForm());
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].data.roomId, "CG1-2122");
  assert.equal(rooms[0].data.buildingId, "CG1");
  assert.equal(rooms[0].data.setupType, "Classroom");
  assert.equal(rooms[0].data.expectedHeadcount, 60);
  assert.equal(rooms[0].data.isPrimary, true);
});

test("toRoomBookingDocs skips incomplete rows and marks one primary", () => {
  const form = completeForm();
  form.rooms = [
    { ...emptyRoomBooking(false), buildingId: "CG1", roomId: "CG1-2122" },
    { ...emptyRoomBooking(true), buildingId: "ML", roomId: "ML-40" },
    { ...emptyRoomBooking(false), buildingId: "CG1", roomId: "" },
  ];
  const docs = toRoomBookingDocs(form);
  assert.equal(docs.length, 2, "the row with no room is dropped");
  assert.deepEqual(docs.map((d) => d.data.isPrimary), [false, true]);
});

// ── Room capacity placeholder ───────────────────────────────────────────────

test("capacityPlaceholder shows the selected room's capacity", () => {
  const rooms = [
    { id: "CG1-1212-Center-Auditorium", capacity: 160 },
    { id: "CG2-2130", capacity: 6 },
  ];
  assert.equal(capacityPlaceholder(rooms, "CG1-1212-Center-Auditorium"), "Capacity 160");
  assert.equal(capacityPlaceholder(rooms, "CG2-2130"), "Capacity 6");
});

test("capacityPlaceholder is empty when there is nothing useful to show", () => {
  const rooms = [{ id: "A", capacity: 10 }, { id: "B", capacity: null }, { id: "C" }];
  assert.equal(capacityPlaceholder(rooms, ""), "", "no room selected");
  assert.equal(capacityPlaceholder(rooms, "unknown"), "", "room not in the list");
  assert.equal(capacityPlaceholder(rooms, "B"), "", "capacity null");
  assert.equal(capacityPlaceholder(rooms, "C"), "", "capacity missing");
  assert.equal(capacityPlaceholder(undefined, "A"), "", "rooms not loaded yet");
});

test("capacityPlaceholder never becomes a submitted value", () => {
  // A placeholder is guidance, not data: the form must still treat the field as
  // empty so an untouched headcount is not recorded as the room's capacity.
  const form = emptyIntakeForm();
  const [room] = form.rooms;
  assert.equal(room.expectedHeadcount, "", "a new room booking starts with no headcount");
});
