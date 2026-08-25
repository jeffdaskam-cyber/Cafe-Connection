/**
 * IntakeForm.jsx — the multi-step catering request form.
 *
 * Steps: Event basics → Rooms → Schedule → Meals → Logistics → Review.
 * Form state lives in one object here; the shape, validation, and Firestore
 * mapping are all in formState.js so they can be tested without React.
 *
 * In-progress work is mirrored to localStorage on every change, so a refresh
 * mid-request does not lose it.
 */
import { useEffect, useMemo, useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme.js";
import {
  MEAL_PERIODS, ORGANIZATIONS, PAYMENT_METHOD, PROJECT_ALLOCATION_UNIT, REQUEST_STATUS,
} from "./schema.js";
import {
  STEPS, STEP_IDS, emptyIntakeForm, emptyMeal, emptyProjectId, emptyRoomBooking,
  emptyScheduleDay, browserStorage, capacityPlaceholder, clearDraft, groupMenuItems, loadDraft,
  saveDraft, summarizeMenuItems, validateAll, validateStep,
} from "./formState.js";
import {
  createCateringEvent, fetchBuildings, fetchMenuItems, fetchRooms, updateCateringEvent,
} from "./data.js";
import {
  Banner, Button, Card, Checkbox, Field, Input, SectionTitle, Select, Textarea, TimeSelect,
} from "./ui.jsx";
import BreakMenuPicker from "./BreakMenuPicker.jsx";

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

export default function IntakeForm({ user, existing = null, onDone, onCancel }) {
  // Editing an already-submitted or confirmed event changes its content in
  // place — the approval status is staff-owned and stays put. A brand-new
  // request or a saved draft can still be submitted from here.
  const editing = Boolean(existing);
  const alreadySubmitted = [
    REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.CONFIRMED, REQUEST_STATUS.CANCELLED,
  ].includes(existing?.requestStatus);
  // localStorage only backs a brand-new request; an edit works against the
  // stored event, so it must not read or clobber the new-request draft.
  const storageEnabled = !editing;

  const [stepIndex, setStepIndex] = useState(0);
  // The furthest step the planner has advanced to, so already-visited tabs stay
  // clickable — you can jump back to review a tab and then straight forward to
  // where you left off. An existing event is fully filled in, so every tab is
  // reachable from the start.
  const [maxStepReached, setMaxStepReached] = useState(editing ? STEPS.length - 1 : 0);
  const [form, setForm] = useState(() =>
    existing?.form ?? loadDraft(browserStorage()) ?? emptyIntakeForm(user));
  const [eventId, setEventId] = useState(existing?.id ?? null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [buildings, setBuildings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [restoredDraft] = useState(() => storageEnabled && loadDraft(browserStorage()) !== null);
  const busy = saving || submitting;

  const step = STEPS[stepIndex];
  const errors = useMemo(() => validateStep(step.id, form), [step.id, form]);
  const visibleErrors = showErrors ? errors : {};

  useEffect(() => {
    Promise.all([fetchBuildings(), fetchRooms(), fetchMenuItems()])
      .then(([b, r, m]) => { setBuildings(b); setRooms(r); setMenuItems(m); })
      .catch((err) => console.error("[catering] reference data load failed:", err));
  }, []);

  // Split the flat catalog into the three lists the Break picker offers, once.
  const menuCatalog = useMemo(() => groupMenuItems(menuItems), [menuItems]);

  useEffect(() => {
    if (storageEnabled) saveDraft(form, browserStorage());
  }, [form, storageEnabled]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const updateProjectId = (localId, patch) => setForm((f) => ({
    ...f,
    projectIdRows: f.projectIdRows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
  }));
  const addProjectId = () => setForm((f) => ({
    ...f, projectIdRows: [...f.projectIdRows, emptyProjectId()],
  }));
  const removeProjectId = (localId) => setForm((f) => ({
    ...f, projectIdRows: f.projectIdRows.filter((r) => r.localId !== localId),
  }));

  const updateDay = (index, patch) => setForm((f) => ({
    ...f,
    scheduleDays: f.scheduleDays.map((d, i) => (i === index ? { ...d, ...patch } : d)),
  }));

  const updateMeal = (dayIndex, mealIndex, patch) => setForm((f) => ({
    ...f,
    scheduleDays: f.scheduleDays.map((d, i) =>
      i === dayIndex
        ? { ...d, meals: d.meals.map((m, j) => (j === mealIndex ? { ...m, ...patch } : m)) }
        : d
    ),
  }));

  function goNext() {
    if (Object.keys(errors).length) { setShowErrors(true); return; }
    setShowErrors(false);
    const next = Math.min(stepIndex + 1, STEPS.length - 1);
    setStepIndex(next);
    setMaxStepReached((m) => Math.max(m, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setShowErrors(false);
    setStepIndex((i) => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Jump straight to an already-reached tab from the step bar. Navigation
  // between visited tabs is free — no validation wall — so a planner can revisit
  // and tweak an earlier tab, then click back to where they were.
  function goToStep(index) {
    if (index === stepIndex || index > maxStepReached) return;
    setShowErrors(false);
    setStepIndex(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancel() {
    // Discard the in-progress new request, otherwise the next visit would
    // reopen it. Editing an existing event has nothing to discard.
    if (storageEnabled) clearDraft(browserStorage());
    onCancel?.();
  }

  function failed(err, verb) {
    console.error(`[catering] ${verb} failed:`, err);
    setSubmitError(
      err?.code === "permission-denied"
        ? "The server rejected the change. Refresh and try again — if this continues, contact Event Services."
        : err?.message || `Something went wrong ${verb} your request.`
    );
  }

  // Persist the current form. `submit` finishes a request (or saves changes to
  // one already submitted); otherwise it saves a draft. Returns the event ID.
  async function persist({ submit }) {
    if (eventId) {
      await updateCateringEvent(eventId, form, user, { submit: submit && !alreadySubmitted });
      return eventId;
    }
    const status = submit ? REQUEST_STATUS.SUBMITTED : REQUEST_STATUS.DRAFT;
    const id = await createCateringEvent(form, user, { status });
    setEventId(id);
    return id;
  }

  // Save progress and leave — from any step, with only a light check so an
  // in-progress request is never lost to a validation wall.
  async function handleSaveAndLeave() {
    if (!form.eventName.trim()) {
      setShowErrors(true);
      setSubmitError("Add an event name before saving.");
      if (stepIndex !== 0) setStepIndex(0);
      return;
    }
    setSaving(true);
    setSubmitError("");
    try {
      const id = await persist({ submit: false });
      if (storageEnabled) clearDraft(browserStorage());
      onDone?.(id, alreadySubmitted ? "saved" : "draft");
    } catch (err) {
      failed(err, "saving");
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const allErrors = validateAll(form);
    if (Object.keys(allErrors).length) {
      const firstBad = STEP_IDS.findIndex((id) => Object.keys(validateStep(id, form)).length);
      if (firstBad >= 0) setStepIndex(firstBad);
      setShowErrors(true);
      setSubmitError(`Please fix the highlighted fields before ${alreadySubmitted ? "saving" : "submitting"}.`);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const id = await persist({ submit: true });
      if (storageEnabled) clearDraft(browserStorage());
      onDone?.(id, alreadySubmitted ? "saved" : "submitted");
    } catch (err) {
      failed(err, alreadySubmitted ? "saving" : "submitting");
      setSubmitting(false);
    }
  }

  const updateRoom = (index, patch) => setForm((f) => ({
    ...f,
    rooms: f.rooms.map((r, i) => (i === index ? { ...r, ...patch } : r)),
  }));

  return (
    <div>
      <StepBar stepIndex={stepIndex} maxStepReached={maxStepReached} onStepClick={goToStep} />

      {restoredDraft && stepIndex === 0 && (
        <Banner tone="info" title="Draft restored">
          We picked up where you left off. Nothing has been submitted yet.
        </Banner>
      )}

      {editing && stepIndex === 0 && (
        <Banner tone="info" title={alreadySubmitted ? "Editing your event" : "Continuing your draft"}>
          {alreadySubmitted
            ? "You can update this event at any time — even after Event Services confirm it. Save your changes when you're done."
            : "Pick up where you left off. Save a draft to keep working later, or submit when you're ready."}
        </Banner>
      )}

      <Card>
        {step.id === "basics" && (
          <>
            <SectionTitle>Event basics</SectionTitle>
            <Field label="Event name" required error={visibleErrors.eventName}>
              <Input value={form.eventName} invalid={Boolean(visibleErrors.eventName)}
                onChange={(e) => set({ eventName: e.target.value })}
                placeholder="e.g. CESM Working Group" />
            </Field>

            <Row>
              <Field label="Start date" required error={visibleErrors.startDate}>
                <Input type="date" value={form.startDate} invalid={Boolean(visibleErrors.startDate)}
                  onChange={(e) => set({ startDate: e.target.value })} />
              </Field>
              <Field label="End date" error={visibleErrors.endDate}
                hint="Leave blank for a single-day event.">
                <Input type="date" value={form.endDate} invalid={Boolean(visibleErrors.endDate)}
                  onChange={(e) => set({ endDate: e.target.value })} />
              </Field>
              <Field label="Start time">
                <TimeSelect value={form.startTime}
                  onChange={(e) => set({ startTime: e.target.value })} />
              </Field>
            </Row>

            <Row>
              <Field label="Organization">
                <Select value={form.organization} onChange={(e) => set({ organization: e.target.value })}>
                  <option value="">Choose…</option>
                  {ORGANIZATIONS.map((org) => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Lab / Program">
                <Input value={form.lcpo} onChange={(e) => set({ lcpo: e.target.value })}
                  placeholder="e.g. Event Services" />
              </Field>
              <Field label="Expected attendance" required error={visibleErrors.expectedAttendance}>
                <Input type="number" min="0" value={form.expectedAttendance}
                  invalid={Boolean(visibleErrors.expectedAttendance)}
                  onChange={(e) => set({ expectedAttendance: e.target.value })} />
              </Field>
            </Row>

            <SectionTitle style={{ marginTop: 28 }}>Event planner</SectionTitle>
            <Row>
              <Field label="Name" required error={visibleErrors.plannerName}>
                <Input value={form.plannerName} invalid={Boolean(visibleErrors.plannerName)}
                  onChange={(e) => set({ plannerName: e.target.value })} />
              </Field>
              <Field label="Email" required error={visibleErrors.plannerEmail}>
                <Input type="email" value={form.plannerEmail} invalid={Boolean(visibleErrors.plannerEmail)}
                  onChange={(e) => set({ plannerEmail: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={form.plannerPhone} onChange={(e) => set({ plannerPhone: e.target.value })} />
              </Field>
            </Row>

            <SectionTitle style={{ marginTop: 28 }}>On-site contact</SectionTitle>
            <Row>
              <Field label="Name">
                <Input value={form.onsiteContactName}
                  onChange={(e) => set({ onsiteContactName: e.target.value })} />
              </Field>
              <Field label="Email" error={visibleErrors.onsiteContactEmail}>
                <Input type="email" value={form.onsiteContactEmail}
                  invalid={Boolean(visibleErrors.onsiteContactEmail)}
                  onChange={(e) => set({ onsiteContactEmail: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={form.onsiteContactPhone}
                  onChange={(e) => set({ onsiteContactPhone: e.target.value })} />
              </Field>
            </Row>

            <SectionTitle style={{ marginTop: 28 }}>Secondary contact</SectionTitle>
            <Row>
              <Field label="Name">
                <Input value={form.secondaryContactName}
                  onChange={(e) => set({ secondaryContactName: e.target.value })} />
              </Field>
              <Field label="Email" error={visibleErrors.secondaryContactEmail}>
                <Input type="email" value={form.secondaryContactEmail}
                  invalid={Boolean(visibleErrors.secondaryContactEmail)}
                  onChange={(e) => set({ secondaryContactEmail: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={form.secondaryContactPhone}
                  onChange={(e) => set({ secondaryContactPhone: e.target.value })} />
              </Field>
            </Row>
          </>
        )}

        {step.id === "schedule" && (
          <>
            <SectionTitle>Event days</SectionTitle>
            <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 20, lineHeight: 1.6 }}>
              Add one row per day of your event, with the times the space is needed
              and which catering services you expect that day.
            </p>

            {visibleErrors.scheduleDays && (
              <Banner tone="error">{visibleErrors.scheduleDays}</Banner>
            )}

            {form.scheduleDays.map((day, i) => (
              <RepeatRow key={day.localId} title={`Day ${i + 1}`}
                onRemove={form.scheduleDays.length > 1
                  ? () => set({ scheduleDays: form.scheduleDays.filter((_, idx) => idx !== i) })
                  : null}>
                <Row>
                  <Field label="Date" required error={visibleErrors[`scheduleDays.${i}.date`]}>
                    <Input type="date" value={day.date}
                      invalid={Boolean(visibleErrors[`scheduleDays.${i}.date`])}
                      onChange={(e) => updateDay(i, { date: e.target.value })} />
                  </Field>
                  <Field label="Start time">
                    <TimeSelect value={day.startTime}
                      onChange={(e) => updateDay(i, { startTime: e.target.value })} />
                  </Field>
                  <Field label="End time" error={visibleErrors[`scheduleDays.${i}.endTime`]}>
                    <TimeSelect value={day.endTime}
                      invalid={Boolean(visibleErrors[`scheduleDays.${i}.endTime`])}
                      onChange={(e) => updateDay(i, { endTime: e.target.value })} />
                  </Field>
                </Row>

                <Field label="Catering services needed" group>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, paddingTop: 4 }}>
                    {MEAL_PERIODS.filter((p) => p !== "other").map((period) => (
                      <label key={period} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 12, color: COLORS.TEXT_PRIMARY, cursor: "pointer",
                      }}>
                        <input type="checkbox"
                          checked={day.cateringServicesNeeded.includes(period)}
                          onChange={(e) => updateDay(i, {
                            cateringServicesNeeded: e.target.checked
                              ? [...day.cateringServicesNeeded, period]
                              : day.cateringServicesNeeded.filter((p) => p !== period),
                          })}
                          style={{ width: 14, height: 14, accentColor: COLORS.AQUA, cursor: "pointer" }} />
                        {MEAL_PERIOD_LABELS[period]}
                      </label>
                    ))}
                  </div>
                </Field>

                <Field label="Notes for this day">
                  <Textarea rows={2} value={day.notes}
                    onChange={(e) => updateDay(i, { notes: e.target.value })} />
                </Field>
              </RepeatRow>
            ))}

            <Button variant="ghost"
              onClick={() => set({ scheduleDays: [...form.scheduleDays, emptyScheduleDay()] })}>
              + Add another day
            </Button>
          </>
        )}

        {step.id === "meals" && (
          <>
            <SectionTitle>Meal selections</SectionTitle>
            <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 20, lineHeight: 1.6 }}>
              Add the specific meals you want for each day. Menus can be finalized
              with Event Services later — a rough idea is enough to submit.
            </p>

            {form.scheduleDays.map((day, i) => (
              <div key={day.localId} style={{ marginBottom: 28 }}>
                <div style={{
                  fontSize: 12, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_SECONDARY,
                  borderBottom: `1px solid ${COLORS.BORDER}`, paddingBottom: 8, marginBottom: 14,
                }}>
                  Day {i + 1}{day.date ? ` — ${day.date}` : ""}
                </div>

                {day.meals.length === 0 && (
                  <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 12 }}>
                    No meals added for this day.
                  </p>
                )}

                {day.meals.map((meal, j) => (
                  <RepeatRow key={meal.localId} title={`Meal ${j + 1}`}
                    onRemove={() => updateDay(i, { meals: day.meals.filter((_, idx) => idx !== j) })}>
                    <Row>
                      <Field label="Meal period" required
                        error={visibleErrors[`scheduleDays.${i}.meals.${j}.mealPeriod`]}>
                        <Select value={meal.mealPeriod}
                          invalid={Boolean(visibleErrors[`scheduleDays.${i}.meals.${j}.mealPeriod`])}
                          onChange={(e) => updateMeal(i, j, { mealPeriod: e.target.value })}>
                          <option value="">Choose…</option>
                          {MEAL_PERIODS.map((p) => (
                            <option key={p} value={p}>{MEAL_PERIOD_LABELS[p]}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Time">
                        <TimeSelect value={meal.time}
                          onChange={(e) => updateMeal(i, j, { time: e.target.value })} />
                      </Field>
                      <Field label="Headcount"
                        error={visibleErrors[`scheduleDays.${i}.meals.${j}.headcount`]}>
                        <Input type="number" min="0" value={meal.headcount}
                          invalid={Boolean(visibleErrors[`scheduleDays.${i}.meals.${j}.headcount`])}
                          onChange={(e) => updateMeal(i, j, { headcount: e.target.value })} />
                      </Field>
                    </Row>
                    {meal.mealPeriod === "coffee_break" ? (
                      <BreakMenuPicker
                        menuItems={meal.menuItems || []}
                        headcount={meal.headcount}
                        catalog={menuCatalog}
                        onChange={(menuItems) => updateMeal(i, j, { menuItems })} />
                    ) : (
                      <Field label="Menu selection">
                        <Textarea rows={2} value={meal.menuSelection}
                          onChange={(e) => updateMeal(i, j, { menuSelection: e.target.value })}
                          placeholder="e.g. Continental breakfast, coffee and tea" />
                      </Field>
                    )}
                    <Field label="Service location">
                      <Input value={meal.location}
                        onChange={(e) => updateMeal(i, j, { location: e.target.value })}
                        placeholder="e.g. Lobby" />
                    </Field>
                  </RepeatRow>
                ))}

                <Button variant="ghost"
                  onClick={() => updateDay(i, { meals: [...day.meals, emptyMeal()] })}>
                  + Add meal to day {i + 1}
                </Button>
              </div>
            ))}
          </>
        )}

        {step.id === "rooms" && (
          <>
            <SectionTitle>Booked rooms</SectionTitle>
            <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 20, lineHeight: 1.6 }}>
              Add the room (or rooms) you have already reserved for this event.
              Rooms are booked through the Google calendar system. Please ensure
              you have your meeting space reserved before proceeding with this form.
            </p>

            {visibleErrors.rooms && <Banner tone="error">{visibleErrors.rooms}</Banner>}

            {form.rooms.map((room, i) => {
              const availableRooms = room.buildingId
                ? rooms.filter((r) => r.buildingId === room.buildingId)
                : rooms;
              return (
                <RepeatRow key={room.localId} title={`Room ${i + 1}`}
                  onRemove={form.rooms.length > 1
                    ? () => set({ rooms: form.rooms.filter((_, idx) => idx !== i) })
                    : null}>
                  <Row>
                    <Field label="Building" required error={visibleErrors[`rooms.${i}.buildingId`]}>
                      <Select value={room.buildingId}
                        invalid={Boolean(visibleErrors[`rooms.${i}.buildingId`])}
                        onChange={(e) => updateRoom(i, { buildingId: e.target.value, roomId: "" })}>
                        <option value="">Choose…</option>
                        {buildings.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Room" required error={visibleErrors[`rooms.${i}.roomId`]}>
                      <Select value={room.roomId}
                        invalid={Boolean(visibleErrors[`rooms.${i}.roomId`])}
                        onChange={(e) => updateRoom(i, { roomId: e.target.value })}>
                        <option value="">Choose…</option>
                        {/* Name only. Capacity appears as the Headcount
                            placeholder once a room is picked, so repeating it
                            here just made the list harder to scan. */}
                        {availableRooms.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Headcount in this room"
                      error={visibleErrors[`rooms.${i}.expectedHeadcount`]}>
                      {/* The selected room's capacity shows as the placeholder:
                          grey guidance until the planner types, and never a
                          submitted value. */}
                      <Input type="number" min="0" value={room.expectedHeadcount}
                        placeholder={capacityPlaceholder(rooms, room.roomId)}
                        invalid={Boolean(visibleErrors[`rooms.${i}.expectedHeadcount`])}
                        onChange={(e) => updateRoom(i, { expectedHeadcount: e.target.value })} />
                    </Field>
                  </Row>

                  <Row>
                    <Field label="Room start time">
                      <TimeSelect value={room.startTime}
                        onChange={(e) => updateRoom(i, { startTime: e.target.value })} />
                    </Field>
                    <Field label="Room end time" error={visibleErrors[`rooms.${i}.endTime`]}>
                      <TimeSelect value={room.endTime}
                        invalid={Boolean(visibleErrors[`rooms.${i}.endTime`])}
                        onChange={(e) => updateRoom(i, { endTime: e.target.value })} />
                    </Field>
                    <Field label="Setup style">
                      <Input value={room.setupType}
                        onChange={(e) => updateRoom(i, { setupType: e.target.value })}
                        placeholder="e.g. Classroom, 12 rounds of 6" />
                    </Field>
                  </Row>

                  <Field label="Notes for this room">
                    <Textarea rows={2} value={room.notes}
                      onChange={(e) => updateRoom(i, { notes: e.target.value })} />
                  </Field>

                  <label style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 12, color: COLORS.TEXT_PRIMARY, cursor: "pointer",
                  }}>
                    <input type="checkbox" checked={Boolean(room.calendarReserved)}
                      onChange={(e) => updateRoom(i, { calendarReserved: e.target.checked })}
                      style={{ accentColor: COLORS.AQUA, cursor: "pointer" }} />
                    Room Reserved in Google Calendar
                  </label>
                </RepeatRow>
              );
            })}

            <Button variant="ghost"
              onClick={() => set({ rooms: [...form.rooms, emptyRoomBooking(false)] })}>
              + Add another room
            </Button>
          </>
        )}

        {step.id === "logistics" && (
          <>
            <SectionTitle>Setup</SectionTitle>
            <Field label="Overall setup notes"
              hint="Anything spanning the whole event. Per-room setup lives on the Rooms step.">
              <Textarea value={form.setupNotes} onChange={(e) => set({ setupNotes: e.target.value })}
                placeholder="e.g. Registration table in the lobby from 7:30am" />
            </Field>

            <SectionTitle style={{ marginTop: 28 }}>Services</SectionTitle>
            <Checkbox label="Catering needed" checked={form.needsCatering}
              onChange={(e) => set({ needsCatering: e.target.checked })} />
            <Checkbox label="Alcohol will be served" checked={form.needsAlcohol}
              onChange={(e) => set({ needsAlcohol: e.target.checked })} />

            <Field label="Security needs"
              hint="Describe what you need — hours, coverage, anything already arranged.">
              <Textarea rows={2} value={form.securityNotes}
                onChange={(e) => set({ securityNotes: e.target.value })} />
            </Field>
            <Field label="Custodial needs">
              <Textarea rows={2} value={form.custodialNotes}
                onChange={(e) => set({ custodialNotes: e.target.value })} />
            </Field>
            <Field label="Access / doors">
              <Textarea rows={2} value={form.accessDoorsNotes}
                onChange={(e) => set({ accessDoorsNotes: e.target.value })}
                placeholder="e.g. East doors unlocked 8am–5pm" />
            </Field>
            <Field label="Sustainability">
              <Textarea rows={2} value={form.sustainabilityNotes}
                onChange={(e) => set({ sustainabilityNotes: e.target.value })} />
            </Field>

            <Row>
              <Field label="Delivery method">
                <Input value={form.deliveryMethod}
                  onChange={(e) => set({ deliveryMethod: e.target.value })} />
              </Field>
              <Field label="Lunch on own / count & call">
                <Input value={form.lunchOnOwnCount}
                  onChange={(e) => set({ lunchOnOwnCount: e.target.value })} />
              </Field>
              <Field label="Airwall closure timeline">
                <Input value={form.airwallClosureTimeline}
                  onChange={(e) => set({ airwallClosureTimeline: e.target.value })} />
              </Field>
            </Row>

            <Field label="Agenda link" error={visibleErrors.agendaLink}>
              <Input value={form.agendaLink} invalid={Boolean(visibleErrors.agendaLink)}
                onChange={(e) => set({ agendaLink: e.target.value, agendaType: e.target.value ? "Link" : "" })}
                placeholder="https://…" />
            </Field>
            <Field label="Special requests">
              <Textarea value={form.specialRequests}
                onChange={(e) => set({ specialRequests: e.target.value })} />
            </Field>

            <SectionTitle style={{ marginTop: 28 }}>Payment</SectionTitle>
            <Field label="Payment method" error={visibleErrors.paymentMethod}>
              <Select value={form.paymentMethod} invalid={Boolean(visibleErrors.paymentMethod)}
                onChange={(e) => set({ paymentMethod: e.target.value })}>
                <option value="">Choose…</option>
                <option value={PAYMENT_METHOD.PROJECT_ID}>Project ID</option>
                <option value={PAYMENT_METHOD.ACH_EXTERNAL}>ACH (External)</option>
              </Select>
            </Field>

            {form.paymentMethod === PAYMENT_METHOD.PROJECT_ID && (
              <ProjectIdFields
                rows={form.projectIdRows}
                unit={form.projectAllocationUnit}
                error={visibleErrors.projectIdRows}
                allocationError={visibleErrors.projectAllocations}
                onChangeRow={updateProjectId}
                onAdd={addProjectId}
                onRemove={removeProjectId}
                onUnitChange={(unit) => set({ projectAllocationUnit: unit })}
              />
            )}

            <Field label="Payment notes" hint="e.g. how a split payment should be divided.">
              <Input value={form.paymentNotes} onChange={(e) => set({ paymentNotes: e.target.value })} />
            </Field>
          </>
        )}

        {step.id === "review" && (
          <ReviewStep form={form} buildings={buildings} rooms={rooms} onEdit={goToStep} />
        )}

        {submitError && <Banner tone="error" title="Submission failed">{submitError}</Banner>}

        <div style={{
          display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          marginTop: 28, paddingTop: 20, borderTop: `1px solid ${COLORS.BORDER}`,
        }}>
          <Button variant="ghost"
            onClick={stepIndex === 0 ? handleCancel : goBack} disabled={busy}>
            {stepIndex === 0 ? "Cancel" : "← Back"}
          </Button>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Save progress and leave, available from any step. */}
            <Button variant="ghost" onClick={handleSaveAndLeave} disabled={busy}>
              {saving ? "Saving…" : alreadySubmitted ? "Save & leave" : "Save draft & leave"}
            </Button>
            {step.id === "review" ? (
              <Button onClick={handleSubmit} disabled={busy}>
                {submitting
                  ? (alreadySubmitted ? "Saving…" : "Submitting…")
                  : (alreadySubmitted ? "Save changes" : "Submit request")}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={busy}>Next →</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function Row({ children }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
      gap: 16,
    }}>
      {children}
    </div>
  );
}

function RepeatRow({ title, onRemove, children }) {
  return (
    <div style={{
      border: `1px solid ${COLORS.BORDER}`, borderRadius: RADIUS.MD,
      padding: 16, marginBottom: 16, background: COLORS.BG_SURFACE_ALT,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_SECONDARY,
          textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </span>
        {onRemove && (
          <button onClick={onRemove} style={{
            background: "none", border: "none", color: COLORS.ERROR,
            fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, cursor: "pointer",
            fontFamily: FONT.FAMILY,
          }}>
            Remove
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Project-ID entry for the Payment section.
 *
 * One input per project ID with an "Add" button beneath, matching how a single
 * charge is usually attributed to a single project. Adding a second ID turns the
 * charge into a split: a shared %/$ unit appears and every row gains an amount
 * field to its right, so the planner can say how the charge divides.
 */
function ProjectIdFields({
  rows, unit, error, allocationError,
  onChangeRow, onAdd, onRemove, onUnitChange,
}) {
  const multiple = rows.length > 1;
  return (
    <Field label="Project ID(s)" error={error}
      hint={multiple ? undefined : "Add another project ID to split the charge across projects."}>
      {multiple && (
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          gap: 8, marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, color: COLORS.TEXT_MUTED }}>Split by</span>
          <Select value={unit} onChange={(e) => onUnitChange(e.target.value)}
            style={{ width: "auto" }} aria-label="Split unit">
            <option value={PROJECT_ALLOCATION_UNIT.PERCENT}>Percent (%)</option>
            <option value={PROJECT_ALLOCATION_UNIT.DOLLAR}>Dollar ($)</option>
          </Select>
        </div>
      )}

      {rows.map((row, i) => (
        <div key={row.localId}
          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <Input value={row.value} invalid={Boolean(error)}
            onChange={(e) => onChangeRow(row.localId, { value: e.target.value })}
            placeholder="PRJ000000001" style={{ flex: 1 }}
            aria-label={`Project ID ${i + 1}`} />

          {multiple && (
            <div style={{ position: "relative", width: 140, flexShrink: 0 }}>
              <span aria-hidden="true" style={{
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                fontSize: 13, color: COLORS.TEXT_MUTED, pointerEvents: "none",
              }}>{unit}</span>
              <Input type="number" min="0" step="any" value={row.amount}
                invalid={Boolean(allocationError)}
                onChange={(e) => onChangeRow(row.localId, { amount: e.target.value })}
                placeholder={unit === PROJECT_ALLOCATION_UNIT.PERCENT ? "0" : "0.00"}
                style={{ paddingLeft: 22 }}
                aria-label={`Amount for project ID ${i + 1}`} />
            </div>
          )}

          {rows.length > 1 && (
            <button type="button" onClick={() => onRemove(row.localId)}
              aria-label={`Remove project ID ${i + 1}`}
              style={{
                background: "none", border: "none", color: COLORS.ERROR,
                fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, cursor: "pointer",
                fontFamily: FONT.FAMILY, flexShrink: 0,
              }}>
              Remove
            </button>
          )}
        </div>
      ))}

      {allocationError && (
        <span role="alert" style={{
          display: "block", fontSize: 11, color: COLORS.ERROR, marginTop: 4, marginBottom: 4,
        }}>
          {allocationError}
        </span>
      )}

      <Button variant="ghost" onClick={onAdd}>+ Add project ID</Button>
    </Field>
  );
}

function StepBar({ stepIndex, maxStepReached, onStepClick }) {
  return (
    <ol style={{ display: "flex", gap: 8, listStyle: "none", marginBottom: 20, flexWrap: "wrap" }}>
      {STEPS.map((s, i) => {
        // A visited tab (current, or anything up to the furthest reached) reads
        // as "done"; tabs past that point are still to come.
        const state = i === stepIndex ? "current"
          : i <= maxStepReached ? "done" : "todo";
        const color = state === "current" ? COLORS.AQUA
          : state === "done" ? COLORS.SUCCESS : COLORS.TEXT_DISABLED;
        // Any reached tab other than the current one can be clicked to jump to.
        const clickable = i !== stepIndex && i <= maxStepReached;
        return (
          <li key={s.id} aria-current={state === "current" ? "step" : undefined}>
            <button type="button"
              onClick={clickable ? () => onStepClick(i) : undefined}
              disabled={!clickable}
              aria-label={`Step ${i + 1}: ${s.label}`}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, color,
                border: `1px solid ${color}55`, borderRadius: RADIUS.PILL,
                padding: "5px 12px",
                background: state === "current" ? `${COLORS.AQUA}10` : "transparent",
                fontFamily: FONT.FAMILY,
                cursor: clickable ? "pointer" : "default",
              }}>
              <span>{state === "done" ? "✓" : i + 1}</span>
              {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Review-line summary of the project IDs: a plain list, or, for a split, each ID
 * with its share, e.g. "PRJ1 (50%), PRJ2 (50%)".
 */
function describeProjectIds(form) {
  const filled = (form.projectIdRows || []).filter((r) => String(r.value).trim());
  if (filled.length === 0) return "—";
  if (filled.length === 1) return filled[0].value.trim();
  return filled.map((r) => {
    const id = r.value.trim();
    const amount = String(r.amount ?? "").trim();
    if (!amount) return id;
    const share = form.projectAllocationUnit === PROJECT_ALLOCATION_UNIT.DOLLAR
      ? `$${amount}` : `${amount}%`;
    return `${id} (${share})`;
  }).join(", ");
}

/**
 * Formats a `YYYY-MM-DD` schedule date as "Weekday M/D" (e.g. "Tuesday 8/25").
 * Parses the parts directly so the label doesn't drift a day across time zones.
 */
function formatMealDayLabel(dateStr) {
  if (!dateStr) return "—";
  const [y, mo, dy] = dateStr.split("-").map(Number);
  if (!y || !mo || !dy) return dateStr;
  const weekday = new Date(y, mo - 1, dy).toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${mo}/${dy}`;
}

function ReviewStep({ form, buildings, rooms, onEdit }) {
  const totalMeals = form.scheduleDays.reduce((n, d) => n + (d.meals?.length || 0), 0);
  const bookedRooms = (form.rooms || []).filter((r) => r.roomId);
  const nameFor = (list, id) => list.find((x) => x.id === id)?.name || id;
  const projectIdsDisplay = describeProjectIds(form);

  return (
    <>
      <SectionTitle>Review your request</SectionTitle>
      <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 20, lineHeight: 1.6 }}>
        Event Services will confirm details and assign the final room. You can
        keep editing this request at any time — even after it&apos;s confirmed.
      </p>

      <ReviewBlock title="Event basics" onEdit={() => onEdit(0)} rows={[
        ["Event", form.eventName],
        ["Dates", [form.startDate, form.endDate].filter(Boolean).join(" → ") || "—"],
        ["Attendance", form.expectedAttendance || "—"],
        ["Organization", [form.organization, form.lcpo].filter(Boolean).join(" / ") || "—"],
        ["Planner", [form.plannerName, form.plannerEmail].filter(Boolean).join(" · ") || "—"],
      ]} />

      <ReviewBlock title={`Schedule — ${form.scheduleDays.length} day(s)`} onEdit={() => onEdit(2)}
        rows={form.scheduleDays.map((d, i) => [
          `Day ${i + 1}`,
          [d.date, [d.startTime, d.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ") || "—",
        ])} />

      <ReviewBlock title={`Meals — ${totalMeals} total`} onEdit={() => onEdit(3)}
        rows={form.scheduleDays.flatMap((d) =>
          (d.meals || []).map((m) => {
            // Coffee Break stores structured selections; menuSelection is only
            // derived from them on save, so summarize here for the live preview.
            const menu = (m.menuItems && m.menuItems.length)
              ? summarizeMenuItems(m.menuItems)
              : m.menuSelection;
            return [
              formatMealDayLabel(d.date),
              [
                [MEAL_PERIOD_LABELS[m.mealPeriod] || m.mealPeriod || "—", m.time].filter(Boolean).join(" "),
                m.location,
              ].filter(Boolean).join(" - ")
                + (menu ? ` · ${menu}` : ""),
            ];
          })
        )} />

      <ReviewBlock title={`Booked rooms — ${bookedRooms.length}`} onEdit={() => onEdit(1)}
        rows={bookedRooms.map((r) => [
          nameFor(buildings, r.buildingId),
          [
            nameFor(rooms, r.roomId),
            [r.startTime, r.endTime].filter(Boolean).join("–"),
            r.setupType,
            r.isPrimary && bookedRooms.length > 1 ? "(primary)" : "",
          ].filter(Boolean).join(" · "),
        ])} />

      <ReviewBlock title="Logistics" onEdit={() => onEdit(4)} rows={[
        ["Alcohol", form.needsAlcohol ? "Yes" : "No"],
        ["Payment", form.paymentMethod === PAYMENT_METHOD.PROJECT_ID ? "Project ID"
          : form.paymentMethod === PAYMENT_METHOD.ACH_EXTERNAL ? "ACH (External)" : "—"],
        ["Project ID(s)", projectIdsDisplay],
      ]} />
    </>
  );
}

function ReviewBlock({ title, rows, onEdit }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        borderBottom: `1px solid ${COLORS.BORDER}`, paddingBottom: 6, marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_SECONDARY,
          textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </span>
        <button onClick={onEdit} style={{
          background: "none", border: "none", color: COLORS.AQUA,
          fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, cursor: "pointer", fontFamily: FONT.FAMILY,
        }}>
          Edit
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>None added.</div>
      ) : (
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, auto) 1fr", gap: "6px 16px", fontSize: 12 }}>
          {rows.map(([label, value], i) => (
            <div key={i} style={{ display: "contents" }}>
              <dt style={{ color: COLORS.TEXT_MUTED }}>{label}</dt>
              <dd style={{ color: COLORS.TEXT_PRIMARY }}>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

