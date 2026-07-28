/**
 * IntakeForm.jsx — the multi-step catering request form.
 *
 * Steps: Event basics → Schedule → Meals → Logistics → Review.
 * Form state lives in one object here; the shape, validation, and Firestore
 * mapping are all in formState.js so they can be tested without React.
 *
 * In-progress work is mirrored to localStorage on every change, so a refresh
 * mid-request does not lose it.
 */
import { useEffect, useMemo, useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme.js";
import { MEAL_PERIODS, PAYMENT_METHOD } from "./schema.js";
import {
  STEPS, emptyIntakeForm, emptyMeal, emptyScheduleDay,
  browserStorage, clearDraft, loadDraft, saveDraft, validateStep,
} from "./formState.js";
import { fetchBuildings, fetchRooms, submitCateringRequest } from "./data.js";
import {
  Banner, Button, Card, Checkbox, Field, Input, SectionTitle, Select, Textarea,
} from "./ui.jsx";

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

export default function IntakeForm({ user, onSubmitted, onCancel }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(() => loadDraft(browserStorage()) ?? emptyIntakeForm(user));
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [buildings, setBuildings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [restoredDraft] = useState(() => loadDraft(browserStorage()) !== null);

  const step = STEPS[stepIndex];
  const errors = useMemo(() => validateStep(step.id, form), [step.id, form]);
  const visibleErrors = showErrors ? errors : {};

  useEffect(() => {
    Promise.all([fetchBuildings(), fetchRooms()])
      .then(([b, r]) => { setBuildings(b); setRooms(r); })
      .catch((err) => console.error("[catering] reference data load failed:", err));
  }, []);

  useEffect(() => { saveDraft(form, browserStorage()); }, [form]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

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
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setShowErrors(false);
    setStepIndex((i) => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancel() {
    // Discard the in-progress request, otherwise the next visit would reopen it.
    clearDraft(browserStorage());
    onCancel?.();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const eventId = await submitCateringRequest(form, user);
      clearDraft(browserStorage());
      onSubmitted?.(eventId);
    } catch (err) {
      console.error("[catering] submit failed:", err);
      setSubmitError(
        err?.code === "permission-denied"
          ? "Your request was rejected by the server. Refresh and try again — if this continues, contact Event Services."
          : err?.message || "Something went wrong submitting your request."
      );
      setSubmitting(false);
    }
  }

  const roomsForBuilding = form.buildingId
    ? rooms.filter((r) => r.buildingId === form.buildingId)
    : rooms;

  return (
    <div>
      <StepBar stepIndex={stepIndex} />

      {restoredDraft && stepIndex === 0 && (
        <Banner tone="info" title="Draft restored">
          We picked up where you left off. Nothing has been submitted yet.
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
                <Input type="time" value={form.startTime}
                  onChange={(e) => set({ startTime: e.target.value })} />
              </Field>
            </Row>

            <Row>
              <Field label="Organization">
                <Input value={form.organization} onChange={(e) => set({ organization: e.target.value })} />
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
                    <Input type="time" value={day.startTime}
                      onChange={(e) => updateDay(i, { startTime: e.target.value })} />
                  </Field>
                  <Field label="End time" error={visibleErrors[`scheduleDays.${i}.endTime`]}>
                    <Input type="time" value={day.endTime}
                      invalid={Boolean(visibleErrors[`scheduleDays.${i}.endTime`])}
                      onChange={(e) => updateDay(i, { endTime: e.target.value })} />
                  </Field>
                </Row>

                <Field label="Catering services needed">
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
                        <Input type="time" value={meal.time}
                          onChange={(e) => updateMeal(i, j, { time: e.target.value })} />
                      </Field>
                      <Field label="Headcount"
                        error={visibleErrors[`scheduleDays.${i}.meals.${j}.headcount`]}>
                        <Input type="number" min="0" value={meal.headcount}
                          invalid={Boolean(visibleErrors[`scheduleDays.${i}.meals.${j}.headcount`])}
                          onChange={(e) => updateMeal(i, j, { headcount: e.target.value })} />
                      </Field>
                    </Row>
                    <Field label="Menu selection">
                      <Textarea rows={2} value={meal.menuSelection}
                        onChange={(e) => updateMeal(i, j, { menuSelection: e.target.value })}
                        placeholder="e.g. Continental breakfast, coffee and tea" />
                    </Field>
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

        {step.id === "logistics" && (
          <>
            <SectionTitle>Space</SectionTitle>
            <Row>
              <Field label="Building">
                <Select value={form.buildingId}
                  onChange={(e) => set({ buildingId: e.target.value, primaryRoomId: "" })}>
                  <option value="">No preference</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Requested room"
                hint="Event Services confirm the final room assignment.">
                <Select value={form.primaryRoomId}
                  onChange={(e) => set({ primaryRoomId: e.target.value })}>
                  <option value="">No preference</option>
                  {roomsForBuilding.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.capacity ? ` — seats ${r.capacity}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </Row>
            <Field label="Room setup">
              <Textarea value={form.setupNotes} onChange={(e) => set({ setupNotes: e.target.value })}
                placeholder="e.g. Classroom style, 12 rounds of 6" />
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
            <Row>
              <Field label="Payment method" error={visibleErrors.paymentMethod}>
                <Select value={form.paymentMethod} invalid={Boolean(visibleErrors.paymentMethod)}
                  onChange={(e) => set({ paymentMethod: e.target.value })}>
                  <option value="">Choose…</option>
                  <option value={PAYMENT_METHOD.PROJECT_ID}>Project ID</option>
                  <option value={PAYMENT_METHOD.ACH_EXTERNAL}>ACH (External)</option>
                </Select>
              </Field>
              <Field label="Project ID(s)" error={visibleErrors.projectIdsText}
                hint="Separate multiple project IDs with commas.">
                <Input value={form.projectIdsText} invalid={Boolean(visibleErrors.projectIdsText)}
                  onChange={(e) => set({ projectIdsText: e.target.value })}
                  placeholder="PRJ000000001, PRJ000000002" />
              </Field>
            </Row>
            <Field label="Payment notes" hint="e.g. how a split payment should be divided.">
              <Input value={form.paymentNotes} onChange={(e) => set({ paymentNotes: e.target.value })} />
            </Field>
          </>
        )}

        {step.id === "review" && (
          <ReviewStep form={form} buildings={buildings} rooms={rooms} onEdit={setStepIndex} />
        )}

        {submitError && <Banner tone="error" title="Submission failed">{submitError}</Banner>}

        <div style={{
          display: "flex", justifyContent: "space-between", gap: 12,
          marginTop: 28, paddingTop: 20, borderTop: `1px solid ${COLORS.BORDER}`,
        }}>
          <Button variant="ghost"
            onClick={stepIndex === 0 ? handleCancel : goBack} disabled={submitting}>
            {stepIndex === 0 ? "Cancel" : "← Back"}
          </Button>
          {step.id === "review" ? (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          ) : (
            <Button onClick={goNext}>Next →</Button>
          )}
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

function StepBar({ stepIndex }) {
  return (
    <ol style={{ display: "flex", gap: 8, listStyle: "none", marginBottom: 20, flexWrap: "wrap" }}>
      {STEPS.map((s, i) => {
        const state = i === stepIndex ? "current" : i < stepIndex ? "done" : "todo";
        const color = state === "current" ? COLORS.AQUA
          : state === "done" ? COLORS.SUCCESS : COLORS.TEXT_DISABLED;
        return (
          <li key={s.id} aria-current={state === "current" ? "step" : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, fontWeight: FONT.WEIGHT_BOLD, color,
              border: `1px solid ${color}55`, borderRadius: RADIUS.PILL,
              padding: "5px 12px",
              background: state === "current" ? `${COLORS.AQUA}10` : "transparent",
            }}>
            <span>{state === "done" ? "✓" : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewStep({ form, buildings, rooms, onEdit }) {
  const buildingName = buildings.find((b) => b.id === form.buildingId)?.name || form.buildingId || "No preference";
  const roomName = rooms.find((r) => r.id === form.primaryRoomId)?.name || form.primaryRoomId || "No preference";
  const totalMeals = form.scheduleDays.reduce((n, d) => n + (d.meals?.length || 0), 0);

  return (
    <>
      <SectionTitle>Review your request</SectionTitle>
      <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 20, lineHeight: 1.6 }}>
        Event Services will confirm details and assign the final room. You can
        still edit this request until they confirm it.
      </p>

      <ReviewBlock title="Event basics" onEdit={() => onEdit(0)} rows={[
        ["Event", form.eventName],
        ["Dates", [form.startDate, form.endDate].filter(Boolean).join(" → ") || "—"],
        ["Attendance", form.expectedAttendance || "—"],
        ["Organization", [form.organization, form.lcpo].filter(Boolean).join(" / ") || "—"],
        ["Planner", [form.plannerName, form.plannerEmail].filter(Boolean).join(" · ") || "—"],
      ]} />

      <ReviewBlock title={`Schedule — ${form.scheduleDays.length} day(s)`} onEdit={() => onEdit(1)}
        rows={form.scheduleDays.map((d, i) => [
          `Day ${i + 1}`,
          [d.date, [d.startTime, d.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ") || "—",
        ])} />

      <ReviewBlock title={`Meals — ${totalMeals} total`} onEdit={() => onEdit(2)}
        rows={form.scheduleDays.flatMap((d, i) =>
          (d.meals || []).map((m) => [
            `Day ${i + 1} · ${MEAL_PERIOD_LABELS[m.mealPeriod] || m.mealPeriod || "—"}`,
            [m.time, m.menuSelection].filter(Boolean).join(" · ") || "—",
          ])
        )} />

      <ReviewBlock title="Logistics" onEdit={() => onEdit(3)} rows={[
        ["Building", buildingName],
        ["Room", roomName],
        ["Alcohol", form.needsAlcohol ? "Yes" : "No"],
        ["Payment", form.paymentMethod === PAYMENT_METHOD.PROJECT_ID ? "Project ID"
          : form.paymentMethod === PAYMENT_METHOD.ACH_EXTERNAL ? "ACH (External)" : "—"],
        ["Project ID(s)", form.projectIdsText || "—"],
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

