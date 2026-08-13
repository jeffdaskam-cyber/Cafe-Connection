/**
 * MyRequests.jsx — a requester's own catering requests.
 *
 * Backed by a live subscription scoped to createdBy == uid, which is also
 * exactly what the security rules permit them to read.
 */
import { useEffect, useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme.js";
import { REQUEST_STATUS } from "./schema.js";
import {
  fetchBookedRooms, fetchScheduleDays, subscribeMyRequests,
} from "./data.js";
import { eventToForm } from "./formState.js";
import { Banner, Button, Card, EmptyState, SectionTitle, StatusBadge } from "./ui.jsx";

const JUST_DONE_BANNER = {
  submitted: {
    tone: "success", title: "Request submitted",
    body: "Event Services have received your request. You can keep editing it any time — even after they confirm it.",
  },
  draft: {
    tone: "info", title: "Draft saved",
    body: "Your progress is saved. Open it from the list to keep working and submit when you're ready.",
  },
  saved: {
    tone: "success", title: "Changes saved",
    body: "Your updates have been saved to the event.",
  },
};

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee Break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

/** "10:00" → "10:00 am", "14:00" → "2:00 pm". Leaves unparseable input as-is. */
function fmtTime12(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h)) return String(t);
  const period = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(Number.isNaN(m) ? 0 : m).padStart(2, "0")} ${period}`;
}

/** "2026-08-25" → "Tuesday 8-25-26". Parsed by parts so it can't drift a day. */
function fmtDayHeader(dateStr) {
  if (!dateStr) return "—";
  const [y, mo, dy] = String(dateStr).split("-").map(Number);
  if (!y || !mo || !dy) return String(dateStr);
  const weekday = new Date(y, mo - 1, dy).toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${mo}-${dy}-${String(y).slice(-2)}`;
}

export default function MyRequests({ user, onNewRequest, onEdit, justDone }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(justDone?.id || null);

  useEffect(() => {
    const unsub = subscribeMyRequests(
      user.uid,
      (rows) => { setRequests(rows); setError(""); },
      (err) => setError(
        err?.code === "permission-denied"
          ? "We couldn't load your requests. Try signing out and back in."
          : "We couldn't load your requests. Please try again shortly."
      )
    );
    return unsub;
  }, [user.uid]);

  if (error) return <Banner tone="error" title="Couldn't load requests">{error}</Banner>;

  if (requests === null) {
    return <Card><div style={{ color: COLORS.TEXT_MUTED, fontSize: 13 }}>Loading your requests…</div></Card>;
  }

  if (requests.length === 0) {
    return (
      <Card>
        <EmptyState title="No requests yet">
          When you submit a catering request it will appear here, along with its status.
          <div style={{ marginTop: 20 }}>
            <Button onClick={onNewRequest}>Start a request</Button>
          </div>
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionTitle style={{ marginBottom: 0 }}>My requests</SectionTitle>
        <Button onClick={onNewRequest}>+ New request</Button>
      </div>

      {justDone && JUST_DONE_BANNER[justDone.kind] && (
        <Banner tone={JUST_DONE_BANNER[justDone.kind].tone} title={JUST_DONE_BANNER[justDone.kind].title}>
          {JUST_DONE_BANNER[justDone.kind].body}
        </Banner>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {requests.map((req) => (
          <RequestRow key={req.id} request={req} onEdit={onEdit}
            expanded={expandedId === req.id}
            onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)} />
        ))}
      </div>
    </>
  );
}

function RequestRow({ request, expanded, onToggle, onEdit }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={onToggle} aria-expanded={expanded} style={{
        width: "100%", textAlign: "left", background: "none", border: "none",
        padding: 20, cursor: "pointer", fontFamily: FONT.FAMILY,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: FONT.SIZE_SM, fontWeight: FONT.WEIGHT_BOLD,
            color: COLORS.TEXT_PRIMARY, marginBottom: 4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {request.eventName || "Untitled event"}
          </div>
          <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>
            {[
              [request.startDate, request.endDate].filter(Boolean).join(" → "),
              request.expectedAttendance ? `${request.expectedAttendance} guests` : null,
              request.buildingId,
            ].filter(Boolean).join(" · ") || "No dates set"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <StatusBadge requestStatus={request.requestStatus} lifecycleStatus={request.lifecycleStatus} />
          <span style={{ color: COLORS.TEXT_MUTED, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && <RequestDetail request={request} onEdit={onEdit} />}
    </Card>
  );
}

function RequestDetail({ request, onEdit }) {
  const [days, setDays] = useState(null);
  const [bookedRooms, setBookedRooms] = useState([]);

  useEffect(() => {
    let live = true;
    Promise.all([fetchScheduleDays(request.id), fetchBookedRooms(request.id)])
      .then(([d, r]) => { if (live) { setDays(d); setBookedRooms(r); } })
      .catch((err) => { console.error("[catering] detail load failed:", err); if (live) setDays([]); });
    return () => { live = false; };
  }, [request.id]);

  const isDraft = request.requestStatus === REQUEST_STATUS.DRAFT;
  // The detail load already has everything the form needs, so editing reuses it
  // rather than re-fetching. Disabled until the schedule days have loaded.
  const openEditor = () => onEdit?.({
    id: request.id,
    requestStatus: request.requestStatus,
    form: eventToForm(request, days || [], bookedRooms),
  });

  return (
    <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${COLORS.BORDER}` }}>
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center",
        gap: 12, padding: "14px 0 0",
      }}>
        <Button onClick={openEditor} disabled={days === null}>
          {isDraft ? "Continue editing" : "Edit event"}
        </Button>
      </div>

      <DetailSection title="Contacts" rows={[
        ["Planner", [request.plannerName, request.plannerEmail].filter(Boolean).join(" · ")],
        ["On-site", [request.onsiteContactName, request.onsiteContactEmail].filter(Boolean).join(" · ")],
        ["Secondary", [request.secondaryContactName, request.secondaryContactEmail].filter(Boolean).join(" · ")],
      ]} />

      <DetailSection title="Booked rooms" rows={
        bookedRooms.length
          ? bookedRooms.map((r) => [
              r.roomId || r.rawRoom || "—",
              [
                [r.startTime, r.endTime].filter(Boolean).join("–"),
                r.setupType,
                r.expectedHeadcount ? `${r.expectedHeadcount} in room` : "",
                r.isPrimary && bookedRooms.length > 1 ? "(primary)" : "",
                r.notes,
              ].filter(Boolean).join(" · "),
            ])
          : [["Rooms", "None recorded"]]
      } />

      <DetailSection title="Setup" rows={[
        ["Overall notes", request.setupNotes],
      ]} />

      <ScheduleSection days={days} rooms={bookedRooms} />

      <DetailSection title="Services" rows={[
        ["Catering", request.needsCatering ? "Yes" : "No"],
        ["Alcohol", request.needsAlcohol ? "Yes" : "No"],
        ["Security", request.securityNotes],
        ["Custodial", request.custodialNotes],
        ["Access / doors", request.accessDoorsNotes],
        ["Special requests", request.specialRequests],
      ]} />

      <DetailSection title="Payment" rows={[
        ["Method", request.paymentMethod === "project_id" ? "Project ID"
          : request.paymentMethod === "ach_external" ? "ACH (External)" : ""],
        ["Project ID(s)", (request.projectIds || []).join(", ")],
        ["Notes", request.paymentNotes],
      ]} />
    </div>
  );
}

/**
 * The schedule, grouped by day. Each day shows a "Weekday M-D-YY" header, then
 * one line per booked room: "<room> <start> - <end> | <meals>". When no rooms
 * are recorded the line falls back to the day's own start/end times.
 */
function ScheduleSection({ days, rooms }) {
  const boxStyle = {
    background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
    borderRadius: RADIUS.MD, padding: 14, fontSize: 12,
  };
  const titleStyle = {
    fontSize: 10, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_MUTED,
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
  };

  if (days === null) {
    return (
      <div style={{ marginTop: 18 }}>
        <div style={titleStyle}>Schedule</div>
        <div style={{ ...boxStyle, color: COLORS.TEXT_MUTED }}>Loading…</div>
      </div>
    );
  }
  if (days.length === 0) return null;

  const timeRange = (start, end) => [fmtTime12(start), fmtTime12(end)].filter(Boolean).join(" - ");

  return (
    <div style={{ marginTop: 18 }}>
      <div style={titleStyle}>Schedule</div>
      <div style={{ ...boxStyle, display: "flex", flexDirection: "column", gap: 16 }}>
        {days.map((d, di) => {
          const mealsText = (d.meals || []).map((m) =>
            `${MEAL_PERIOD_LABELS[m.mealPeriod] || m.mealPeriod}${m.time ? ` ${fmtTime12(m.time)}` : ""}`
          ).join(", ");
          const roomLines = rooms.length
            ? rooms.map((r) => [
                r.roomId || r.rawRoom || "—",
                timeRange(r.startTime || d.startTime, r.endTime || d.endTime),
              ].filter(Boolean).join(" "))
            : [timeRange(d.startTime, d.endTime)];
          return (
            <div key={di}>
              <div style={{ fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_PRIMARY, marginBottom: 4 }}>
                {fmtDayHeader(d.date)}
              </div>
              {roomLines.map((line, li) => (
                <div key={li} style={{ color: COLORS.TEXT_PRIMARY, lineHeight: 1.7 }}>
                  {[line, mealsText].filter(Boolean).join(" | ")}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailSection({ title, rows }) {
  const filled = rows.filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (filled.length === 0) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        fontSize: 10, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_MUTED,
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
      }}>
        {title}
      </div>
      <dl style={{
        display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr",
        gap: "6px 16px", fontSize: 12,
        background: COLORS.BG_SURFACE_ALT, border: `1px solid ${COLORS.BORDER}`,
        borderRadius: RADIUS.MD, padding: 14,
      }}>
        {filled.map(([label, value], i) => (
          <div key={i} style={{ display: "contents" }}>
            <dt style={{ color: COLORS.TEXT_MUTED }}>{label}</dt>
            <dd style={{ color: COLORS.TEXT_PRIMARY, whiteSpace: "pre-wrap" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
