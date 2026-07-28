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
  fetchAssignedRooms, fetchScheduleDays, subscribeMyRequests,
} from "./data.js";
import { Banner, Button, Card, EmptyState, SectionTitle, StatusBadge } from "./ui.jsx";

const MEAL_PERIOD_LABELS = {
  breakfast: "Breakfast", coffee_break: "Coffee break", lunch: "Lunch",
  dinner: "Dinner", reception: "Reception", other: "Other",
};

export default function MyRequests({ user, onNewRequest, highlightId }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(highlightId || null);

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

      {highlightId && (
        <Banner tone="success" title="Request submitted">
          Event Services have received your request. You&apos;ll be notified as it moves along,
          and you can keep editing it until they confirm it.
        </Banner>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {requests.map((req) => (
          <RequestRow key={req.id} request={req}
            expanded={expandedId === req.id}
            onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)} />
        ))}
      </div>
    </>
  );
}

function RequestRow({ request, expanded, onToggle }) {
  const editable = [REQUEST_STATUS.DRAFT, REQUEST_STATUS.SUBMITTED].includes(request.requestStatus);

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

      {expanded && <RequestDetail request={request} editable={editable} />}
    </Card>
  );
}

function RequestDetail({ request, editable }) {
  const [days, setDays] = useState(null);
  const [assignedRooms, setAssignedRooms] = useState([]);

  useEffect(() => {
    let live = true;
    Promise.all([fetchScheduleDays(request.id), fetchAssignedRooms(request.id)])
      .then(([d, r]) => { if (live) { setDays(d); setAssignedRooms(r); } })
      .catch((err) => { console.error("[catering] detail load failed:", err); if (live) setDays([]); });
    return () => { live = false; };
  }, [request.id]);

  return (
    <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${COLORS.BORDER}` }}>
      {!editable && (
        <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, padding: "14px 0 0" }}>
          This request has been confirmed by Event Services and can no longer be
          edited here. Contact them directly with any changes.
        </div>
      )}

      <DetailSection title="Contacts" rows={[
        ["Planner", [request.plannerName, request.plannerEmail].filter(Boolean).join(" · ")],
        ["On-site", [request.onsiteContactName, request.onsiteContactEmail].filter(Boolean).join(" · ")],
        ["Secondary", [request.secondaryContactName, request.secondaryContactEmail].filter(Boolean).join(" · ")],
      ]} />

      <DetailSection title="Space" rows={[
        ["Building", request.buildingId],
        ["Requested room", request.primaryRoomId],
        ["Setup", request.setupNotes],
        ["Assigned room(s)", assignedRooms.length
          ? assignedRooms.map((r) => r.roomId || r.rawRoom).filter(Boolean).join(", ")
          : "Not yet assigned"],
      ]} />

      <DetailSection title="Schedule" rows={
        days === null ? [["", "Loading…"]]
          : days.length === 0 ? []
          : days.map((d) => [
              d.date || "—",
              [
                [d.startTime, d.endTime].filter(Boolean).join("–"),
                (d.meals || []).map((m) =>
                  `${MEAL_PERIOD_LABELS[m.mealPeriod] || m.mealPeriod}${m.time ? ` ${m.time}` : ""}`
                ).join(", "),
              ].filter(Boolean).join(" · "),
            ])
      } />

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
