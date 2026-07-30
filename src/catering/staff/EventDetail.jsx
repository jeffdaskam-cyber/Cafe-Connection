/**
 * EventDetail.jsx — staff view of one catering event.
 *
 * Staff can confirm, close, reopen, or cancel; edit any event field; and
 * correct the recorded room bookings. Rooms are reserved in a separate calendar
 * system, so this edits an existing booking rather than assigning one.
 *
 * Staff enter the revenue amounts here; the derived event_revenue row is
 * written only by /api/catering, which this view triggers after
 * a confirm, close, or revenue edit.
 */
import { useEffect, useState } from "react";

import { COLORS, FONT, RADIUS } from "../../theme.js";
import { LIFECYCLE_STATUS, PAYMENT_METHOD, REQUEST_STATUS } from "../schema.js";
import {
  deleteRoomBooking, fetchEventRooms, fetchEventScheduleDays,
  generateRecap, notifyForEvent, resolveReviewFlag, rollUpEventRevenue,
  setLifecycleStatus, setRequestStatus, updateEventFields, updateRoomBooking,
} from "../staffData.js";
import {
  Banner, Button, Card, Field, Input, SectionTitle, Select, StatusBadge, Textarea,
} from "../ui.jsx";

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

export default function EventDetail({ event, user, rooms, buildings, onBack }) {
  const [days, setDays] = useState(null);
  const [bookedRooms, setBookedRooms] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rollup, setRollup] = useState(null);
  const [notice, setNotice] = useState(null);
  const [recap, setRecap] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});

  useEffect(() => {
    let live = true;
    Promise.all([fetchEventScheduleDays(event.id), fetchEventRooms(event.id)])
      .then(([d, r]) => { if (live) { setDays(d); setBookedRooms(r); } })
      .catch((err) => {
        console.error("[catering/staff] detail load failed:", err);
        if (live) { setDays([]); setError("Couldn't load the schedule and rooms for this event."); }
      });
    return () => { live = false; };
  }, [event.id]);

  /**
   * Reconcile the event_revenue row after a status change or revenue edit.
   * Never allowed to fail the action that triggered it — the nightly sweep in
   * Phase 5 is the backstop.
   */
  async function reconcileRevenue() {
    try {
      setRollup(await rollUpEventRevenue(event.id));
    } catch (err) {
      console.error("[catering/staff] revenue rollup failed:", err);
      setRollup({ action: "failed", reason: err.message });
    }
  }

  /**
   * Fire the side effects a status change implies: the recap first (so the
   * closing email can link to it), then the notification.
   *
   * Like the rollup, these never fail the status change that triggered them —
   * the nightly reconciliation sweep re-runs anything that did not land.
   */
  async function reconcileSideEffects({ withRecap = false } = {}) {
    if (withRecap) {
      try {
        setRecap(await generateRecap(event.id));
      } catch (err) {
        console.error("[catering/staff] recap generation failed:", err);
        setRecap({ action: "failed", reason: err.message });
      }
    }
    try {
      setNotice(await notifyForEvent(event.id));
    } catch (err) {
      console.error("[catering/staff] notification failed:", err);
      setNotice({ action: "failed", reason: err.message });
    }
  }

  async function run(label, fn, { reconcile = false, notify = false, recap: wantRecap = false } = {}) {
    setBusy(label);
    setError("");
    try {
      await fn();
      if (reconcile) await reconcileRevenue();
      if (notify) await reconcileSideEffects({ withRecap: wantRecap });
    } catch (err) {
      console.error(`[catering/staff] ${label} failed:`, err);
      setError(
        err?.code === "permission-denied"
          ? "You don't have permission to do that."
          : err?.message || "Something went wrong. Please try again."
      );
    } finally {
      setBusy("");
    }
  }

  function startEditing() {
    setDraft({
      eventName: event.eventName || "",
      startDate: event.startDate || "",
      endDate: event.endDate || "",
      expectedAttendance: event.expectedAttendance ?? "",
      actualAttendance: event.actualAttendance ?? "",
      estimatedRevenue: event.estimatedRevenue ?? "",
      actualRevenue: event.actualRevenue ?? "",
      plannerName: event.plannerName || "",
      plannerEmail: event.plannerEmail || "",
      plannerPhone: event.plannerPhone || "",
      lcpo: event.lcpo || "",
      setupNotes: event.setupNotes || "",
      securityNotes: event.securityNotes || "",
      custodialNotes: event.custodialNotes || "",
      accessDoorsNotes: event.accessDoorsNotes || "",
      sustainabilityNotes: event.sustainabilityNotes || "",
      specialRequests: event.specialRequests || "",
      paymentMethod: event.paymentMethod || "",
      projectIdsText: (event.projectIds || []).join(", "),
      paymentNotes: event.paymentNotes || "",
      staffNotes: event.staffNotes || "",
    });
    setEditing(true);
  }

  async function saveEdits() {
    const {
      projectIdsText, expectedAttendance, actualAttendance,
      estimatedRevenue, actualRevenue, ...rest
    } = draft;
    const num = (v) => (v === "" ? null : Number(v));

    await run("save", async () => {
      await updateEventFields(event.id, {
        ...rest,
        expectedAttendance: num(expectedAttendance),
        actualAttendance: num(actualAttendance),
        estimatedRevenue: num(estimatedRevenue),
        actualRevenue: num(actualRevenue),
        projectIds: projectIdsText.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setEditing(false);
    }, { reconcile: true });
  }

  const isConfirmed = event.requestStatus === REQUEST_STATUS.CONFIRMED;
  const isClosed = event.lifecycleStatus === LIFECYCLE_STATUS.CLOSED;

  return (
    <>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: COLORS.AQUA_DARK, cursor: "pointer",
        fontFamily: FONT.FAMILY, fontWeight: FONT.WEIGHT_BOLD, fontSize: 12,
        padding: 0, marginBottom: 16,
      }}>
        ← Back to queue
      </button>

      {error && <Banner tone="error" title="Action failed">{error}</Banner>}

      {rollup && <RevenueRollupBanner rollup={rollup} />}
      {recap && <RecapBanner recap={recap} />}
      {notice && <NotificationBanner notice={notice} />}

      {event.needsReview && (
        <Banner tone="warning" title="Migrated record needs review">
          {(event.reviewNotes || []).join("; ") || "This record was flagged during migration."}
          <div style={{ marginTop: 10 }}>
            <Button variant="ghost" disabled={busy === "resolve"}
              onClick={() => run("resolve", () => resolveReviewFlag(event.id))}>
              Mark as reviewed
            </Button>
          </div>
        </Banner>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20,
        }}>
          <div>
            <h1 style={{ fontSize: FONT.SIZE_LG, fontWeight: FONT.WEIGHT_BOLD, marginBottom: 6 }}>
              {event.eventName || "Untitled event"}
            </h1>
            <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>
              {[
                [event.startDate, event.endDate].filter(Boolean).join(" → "),
                event.plannerName,
                event.expectedAttendance ? `${event.expectedAttendance} guests` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <StatusBadge requestStatus={event.requestStatus} lifecycleStatus={event.lifecycleStatus} />
        </div>

        {/* ── Status actions ── */}
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap",
          paddingTop: 16, borderTop: `1px solid ${COLORS.BORDER}`,
        }}>
          {!isConfirmed && event.requestStatus !== REQUEST_STATUS.CANCELLED && (
            <Button disabled={Boolean(busy)}
              onClick={() => run("confirm",
                () => setRequestStatus(event, REQUEST_STATUS.CONFIRMED, user),
                { reconcile: true, notify: true })}>
              {busy === "confirm" ? "Confirming…" : "Confirm request"}
            </Button>
          )}
          {isConfirmed && !isClosed && (
            <Button disabled={Boolean(busy)}
              onClick={() => run("close",
                () => setLifecycleStatus(event, LIFECYCLE_STATUS.CLOSED, user),
                { reconcile: true, notify: true, recap: true })}>
              {busy === "close" ? "Closing…" : "Close event"}
            </Button>
          )}
          {isClosed && (
            <Button variant="ghost" disabled={Boolean(busy)}
              onClick={() => run("reopen", () => setLifecycleStatus(event, LIFECYCLE_STATUS.OPEN, user))}>
              Reopen
            </Button>
          )}
          {event.requestStatus !== REQUEST_STATUS.CANCELLED && (
            <Button variant="danger" disabled={Boolean(busy)}
              onClick={() => run("cancel",
                () => setRequestStatus(event, REQUEST_STATUS.CANCELLED, user), { reconcile: true })}>
              Cancel request
            </Button>
          )}
          {!editing && (
            <Button variant="ghost" onClick={startEditing} style={{ marginLeft: "auto" }}>
              Edit details
            </Button>
          )}
        </div>
      </Card>

      {editing ? (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Edit event</SectionTitle>
          <EditGrid>
            <Field label="Event name">
              <Input value={draft.eventName} onChange={(e) => setDraft({ ...draft, eventName: e.target.value })} />
            </Field>
            <Field label="Start date">
              <Input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            </Field>
            <Field label="End date">
              <Input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
            </Field>
            <Field label="Expected attendance">
              <Input type="number" min="0" value={draft.expectedAttendance}
                onChange={(e) => setDraft({ ...draft, expectedAttendance: e.target.value })} />
            </Field>
            <Field label="Actual attendance" hint="Recorded after the event.">
              <Input type="number" min="0" value={draft.actualAttendance}
                onChange={(e) => setDraft({ ...draft, actualAttendance: e.target.value })} />
            </Field>
            <Field label="Estimated revenue" hint="Used until an actual amount is recorded.">
              <Input type="number" min="0" step="0.01" value={draft.estimatedRevenue}
                onChange={(e) => setDraft({ ...draft, estimatedRevenue: e.target.value })} />
            </Field>
            <Field label="Actual revenue" hint="Recorded at close. Takes precedence.">
              <Input type="number" min="0" step="0.01" value={draft.actualRevenue}
                onChange={(e) => setDraft({ ...draft, actualRevenue: e.target.value })} />
            </Field>
            <Field label="Lab / Program">
              <Input value={draft.lcpo} onChange={(e) => setDraft({ ...draft, lcpo: e.target.value })} />
            </Field>
            <Field label="Planner name">
              <Input value={draft.plannerName} onChange={(e) => setDraft({ ...draft, plannerName: e.target.value })} />
            </Field>
            <Field label="Planner email">
              <Input value={draft.plannerEmail} onChange={(e) => setDraft({ ...draft, plannerEmail: e.target.value })} />
            </Field>
            <Field label="Planner phone">
              <Input value={draft.plannerPhone} onChange={(e) => setDraft({ ...draft, plannerPhone: e.target.value })} />
            </Field>
            <Field label="Payment method">
              <Select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>
                <option value="">—</option>
                <option value={PAYMENT_METHOD.PROJECT_ID}>Project ID</option>
                <option value={PAYMENT_METHOD.ACH_EXTERNAL}>ACH (External)</option>
              </Select>
            </Field>
            <Field label="Project ID(s)" hint="Comma separated.">
              <Input value={draft.projectIdsText} onChange={(e) => setDraft({ ...draft, projectIdsText: e.target.value })} />
            </Field>
            <Field label="Payment notes">
              <Input value={draft.paymentNotes} onChange={(e) => setDraft({ ...draft, paymentNotes: e.target.value })} />
            </Field>
          </EditGrid>

          {[
            ["setupNotes", "Setup notes"], ["securityNotes", "Security"],
            ["custodialNotes", "Custodial"], ["accessDoorsNotes", "Access / doors"],
            ["sustainabilityNotes", "Sustainability"], ["specialRequests", "Special requests"],
            ["staffNotes", "Internal staff notes"],
          ].map(([key, label]) => (
            <Field key={key} label={label}
              hint={key === "staffNotes" ? "Not shown to the requester." : undefined}>
              <Textarea rows={2} value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
            </Field>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Button onClick={saveEdits} disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle>Details</SectionTitle>
          <DetailGrid rows={[
            ["Planner", [event.plannerName, event.plannerEmail, event.plannerPhone].filter(Boolean).join(" · ")],
            ["On-site", [event.onsiteContactName, event.onsiteContactEmail, event.onsiteContactPhone].filter(Boolean).join(" · ")],
            ["Secondary", [event.secondaryContactName, event.secondaryContactEmail].filter(Boolean).join(" · ")],
            ["Org / Program", [event.organization, event.lcpo].filter(Boolean).join(" / ")],
            ["Campus", event.campus],
            ["Attendance", [
              event.expectedAttendance != null ? `${event.expectedAttendance} expected` : "",
              event.actualAttendance != null ? `${event.actualAttendance} actual` : "",
            ].filter(Boolean).join(" · ")],
            ["Catering", event.needsCatering ? "Yes" : "No"],
            ["Alcohol", event.needsAlcohol ? "Yes" : "No"],
            ["Setup", event.setupNotes],
            ["Security", event.securityNotes],
            ["Custodial", event.custodialNotes],
            ["Access / doors", event.accessDoorsNotes],
            ["Sustainability", event.sustainabilityNotes],
            ["Special requests", event.specialRequests],
            ["Payment", event.paymentMethod === PAYMENT_METHOD.PROJECT_ID ? "Project ID"
              : event.paymentMethod === PAYMENT_METHOD.ACH_EXTERNAL ? "ACH (External)" : ""],
            ["Project ID(s)", (event.projectIds || []).join(", ")],
            ["Payment notes", event.paymentNotes],
            ["Revenue", formatRevenue(event)],
            ["Staff notes", event.staffNotes],
          ]} />
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Booked rooms</SectionTitle>
        <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 16, lineHeight: 1.6 }}>
          Rooms are reserved in the room calendar system before the request is
          filed. Correct anything recorded here that doesn&apos;t match the booking.
        </p>
        {bookedRooms.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>No rooms recorded.</div>
        ) : (
          bookedRooms.map((room) => (
            <RoomEditor key={room.id} room={room} rooms={rooms} buildings={buildings}
              onSave={(patch) => run("room", async () => {
                await updateRoomBooking(event.id, room.id, patch);
                setBookedRooms(await fetchEventRooms(event.id));
              })}
              onDelete={() => run("room", async () => {
                await deleteRoomBooking(event.id, room.id);
                setBookedRooms(await fetchEventRooms(event.id));
              })} />
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Schedule &amp; meals</SectionTitle>
        {days === null ? (
          <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>Loading…</div>
        ) : days.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>No schedule days recorded.</div>
        ) : (
          days.map((day) => (
            <div key={day.id} style={{
              border: `1px solid ${COLORS.BORDER}`, borderRadius: RADIUS.MD,
              padding: 14, marginBottom: 12, background: COLORS.BG_SURFACE_ALT,
            }}>
              <div style={{ fontSize: 12, fontWeight: FONT.WEIGHT_BOLD, marginBottom: 6 }}>
                {day.date} {[day.startTime, day.endTime].filter(Boolean).join("–")}
              </div>
              {(day.cateringServicesNeeded || []).length > 0 && (
                <div style={{ fontSize: 11, color: COLORS.TEXT_MUTED, marginBottom: 8 }}>
                  Services: {day.cateringServicesNeeded.map((p) => MEAL_PERIOD_LABELS[p] || p).join(", ")}
                </div>
              )}
              {(day.meals || []).length === 0 ? (
                <div style={{ fontSize: 11, color: COLORS.TEXT_MUTED }}>No meals recorded.</div>
              ) : (
                <ul style={{ listStyle: "none", fontSize: 12, color: COLORS.TEXT_SECONDARY }}>
                  {day.meals.map((meal) => (
                    <li key={meal.id} style={{ marginBottom: 4 }}>
                      <strong>{MEAL_PERIOD_LABELS[meal.mealPeriod] || meal.mealPeriod}</strong>
                      {meal.time ? ` ${meal.time}` : ""}
                      {meal.headcount != null ? ` · ${meal.headcount} guests` : ""}
                      {meal.menuSelection ? ` — ${meal.menuSelection}` : ""}
                      {meal.location ? ` (${meal.location})` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {day.notes && (
                <div style={{ fontSize: 11, color: COLORS.TEXT_MUTED, marginTop: 8 }}>{day.notes}</div>
              )}
            </div>
          ))
        )}
      </Card>
    </>
  );
}

function RoomEditor({ room, rooms, buildings, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    buildingId: room.buildingId || "",
    roomId: room.roomId || "",
    setupType: room.setupType || "",
    startTime: room.startTime || "",
    endTime: room.endTime || "",
    expectedHeadcount: room.expectedHeadcount ?? "",
    notes: room.notes || "",
  });

  const available = draft.buildingId
    ? rooms.filter((r) => r.buildingId === draft.buildingId)
    : rooms;

  return (
    <div style={{
      border: `1px solid ${room.needsReview ? COLORS.ERROR : COLORS.BORDER}`,
      borderRadius: RADIUS.MD, padding: 14, marginBottom: 12,
      background: COLORS.BG_SURFACE_ALT,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 12, color: COLORS.TEXT_PRIMARY }}>
          <strong>{room.roomId || room.rawRoom || "No room recorded"}</strong>
          {room.isPrimary && <span style={{ color: COLORS.AQUA_DARK }}> · primary</span>}
          <div style={{ fontSize: 11, color: COLORS.TEXT_MUTED, marginTop: 2 }}>
            {[
              [room.startTime, room.endTime].filter(Boolean).join("–"),
              room.setupType,
              room.expectedHeadcount != null ? `${room.expectedHeadcount} in room` : "",
            ].filter(Boolean).join(" · ") || "No times recorded"}
          </div>
        </div>
        <button onClick={() => setOpen(!open)} style={{
          background: "none", border: "none", color: COLORS.AQUA_DARK, cursor: "pointer",
          fontFamily: FONT.FAMILY, fontWeight: FONT.WEIGHT_BOLD, fontSize: 11,
        }}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {room.rawRoom && !room.roomId && (
        <div style={{ fontSize: 11, color: COLORS.ERROR, marginTop: 8 }}>
          Migrated value “{room.rawRoom}” didn&apos;t match a known room — pick the right one.
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.BORDER}` }}>
          <EditGrid>
            <Field label="Building">
              <Select value={draft.buildingId}
                onChange={(e) => setDraft({ ...draft, buildingId: e.target.value, roomId: "" })}>
                <option value="">—</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}
              </Select>
            </Field>
            <Field label="Room">
              <Select value={draft.roomId} onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}>
                <option value="">—</option>
                {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Headcount">
              <Input type="number" min="0" value={draft.expectedHeadcount}
                onChange={(e) => setDraft({ ...draft, expectedHeadcount: e.target.value })} />
            </Field>
            <Field label="Start time">
              <Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            </Field>
            <Field label="End time">
              <Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
            </Field>
            <Field label="Setup style">
              <Input value={draft.setupType} onChange={(e) => setDraft({ ...draft, setupType: e.target.value })} />
            </Field>
          </EditGrid>
          <Field label="Notes">
            <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={() => {
              onSave({
                ...draft,
                expectedHeadcount: draft.expectedHeadcount === "" ? null : Number(draft.expectedHeadcount),
                // Clear the unmatched raw value once a real room is chosen.
                ...(draft.roomId ? { rawRoom: null, needsReview: false } : {}),
              });
              setOpen(false);
            }}>
              Save room
            </Button>
            <Button variant="danger" onClick={onDelete}>Remove</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRevenue(event) {
  const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const parts = [];
  if (event.actualRevenue != null && event.actualRevenue !== "") {
    parts.push(`${money(event.actualRevenue)} actual`);
  }
  if (event.estimatedRevenue != null && event.estimatedRevenue !== "") {
    parts.push(`${money(event.estimatedRevenue)} estimated`);
  }
  if (parts.length === 0) return "";
  if (event.revenueRolledUpAt) parts.push("· rolled up");
  return parts.join(" · ");
}

function NotificationBanner({ notice }) {
  if (notice.action === "sent") {
    return (
      <Banner tone="success" title="Notification sent">
        “{notice.subject}” sent to {notice.to.join(", ")}
        {notice.cc?.length ? ` (cc ${notice.cc.join(", ")})` : ""}.
      </Banner>
    );
  }
  if (notice.action === "logged") {
    return (
      <Banner tone="warning" title="Notification not sent — email is off">
        The {notice.type} message was composed for {notice.to.join(", ")} and
        logged, but not delivered: the service mailbox does not yet hold the
        <code> gmail.send </code> scope. It will send once that is granted and
        <code> CATERING_EMAIL_ENABLED </code> is set.
      </Banner>
    );
  }
  if (notice.action === "failed") {
    return (
      <Banner tone="warning" title="Notification didn't run">
        {notice.reason} The status change was saved; the nightly sweep will retry.
      </Banner>
    );
  }
  return null;
}

function RecapBanner({ recap }) {
  if (recap.action === "generated") {
    return (
      <Banner tone="success" title="Recap generated">
        <a href={recap.recapUrl} target="_blank" rel="noreferrer"
          style={{ color: COLORS.AQUA_DARK, fontWeight: FONT.WEIGHT_BOLD }}>
          Open the event recap PDF
        </a>
      </Banner>
    );
  }
  if (recap.action === "failed") {
    return (
      <Banner tone="warning" title="Recap didn't generate">
        {recap.reason} The event is still closed; the nightly sweep will retry.
      </Banner>
    );
  }
  return null;
}

function RevenueRollupBanner({ rollup }) {
  if (rollup.action === "written") {
    return (
      <Banner tone="success" title="Revenue rolled up">
        {`$${Number(rollup.revenue).toLocaleString("en-US", { minimumFractionDigits: 2 })} `}
        recorded as {rollup.type} revenue for {rollup.campus}, {rollup.monthKey}
        {rollup.isEstimate ? " (estimate — will update when an actual amount is recorded)." : "."}
      </Banner>
    );
  }
  if (rollup.action === "removed") {
    return (
      <Banner tone="info" title="Revenue withdrawn">
        This event is no longer confirmed, so its revenue entry was removed.
      </Banner>
    );
  }
  if (rollup.action === "failed") {
    return (
      <Banner tone="warning" title="Revenue rollup didn't run">
        {rollup.reason} The status change was saved. The nightly reconciliation
        will retry, or you can re-save to try again.
      </Banner>
    );
  }
  if (rollup.action === "skipped") {
    return (
      <Banner tone="info" title="No revenue recorded yet">
        {rollup.reason}. Add an amount under “Edit details” to include this
        event in revenue reporting.
      </Banner>
    );
  }
  return null;
}

function EditGrid({ children }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14,
    }}>
      {children}
    </div>
  );
}

function DetailGrid({ rows }) {
  const filled = rows.filter(([, v]) => v !== "" && v !== null && v !== undefined);
  return (
    <dl style={{
      display: "grid", gridTemplateColumns: "minmax(130px, auto) 1fr",
      gap: "8px 18px", fontSize: 12,
    }}>
      {filled.map(([label, value], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt style={{ color: COLORS.TEXT_MUTED }}>{label}</dt>
          <dd style={{ color: COLORS.TEXT_PRIMARY, whiteSpace: "pre-wrap" }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
