/**
 * RequestQueue.jsx — the staff view of incoming catering requests.
 *
 * Filter by status, date range, and building; open one to act on it.
 */
import { useMemo } from "react";

import { COLORS, FONT, RADIUS } from "../../theme.js";
import { LIFECYCLE_STATUS } from "../schema.js";
import {
  QUEUE_STATUS_OPTIONS, filterEvents, queueCounts, sortEventsByDate,
} from "../staffFilters.js";
import { Card, EmptyState, Field, Input, Select, StatusBadge } from "../ui.jsx";

export default function RequestQueue({ events, buildings, filters, onFiltersChange, onOpen }) {
  const filtered = useMemo(
    () => sortEventsByDate(filterEvents(events, filters)),
    [events, filters]
  );
  const counts = useMemo(() => queueCounts(events), [events]);

  const set = (patch) => onFiltersChange({ ...filters, ...patch });

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Chip label="Awaiting decision" value={counts.submitted} tone={COLORS.WARNING}
          onClick={() => set({ requestStatus: "submitted", lifecycleStatus: "all" })} />
        <Chip label="Confirmed" value={counts.confirmed} tone={COLORS.AQUA_DARK}
          onClick={() => set({ requestStatus: "confirmed", lifecycleStatus: "all" })} />
        <Chip label="Open" value={counts.open} tone={COLORS.SUCCESS}
          onClick={() => set({ requestStatus: "all", lifecycleStatus: LIFECYCLE_STATUS.OPEN })} />
        {counts.needsReview > 0 && (
          <Chip label="Needs review" value={counts.needsReview} tone={COLORS.ERROR}
            onClick={() => set({ requestStatus: "needs_attention", lifecycleStatus: "all" })} />
        )}
        <Chip label="All" value={counts.total} tone={COLORS.TEXT_MUTED}
          onClick={() => set({ requestStatus: "all", lifecycleStatus: "all", from: "", to: "", buildingId: "all", search: "" })} />
      </div>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
        }}>
          <Field label="Status">
            <Select value={filters.requestStatus} onChange={(e) => set({ requestStatus: e.target.value })}>
              {QUEUE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Lifecycle">
            <Select value={filters.lifecycleStatus} onChange={(e) => set({ lifecycleStatus: e.target.value })}>
              <option value="all">All</option>
              <option value={LIFECYCLE_STATUS.OPEN}>Open</option>
              <option value={LIFECYCLE_STATUS.CLOSED}>Closed</option>
            </Select>
          </Field>
          <Field label="Building">
            <Select value={filters.buildingId} onChange={(e) => set({ buildingId: e.target.value })}>
              <option value="all">All buildings</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </Field>
          <Field label="Search">
            <Input value={filters.search} onChange={(e) => set({ search: e.target.value })}
              placeholder="Event, planner, project ID…" />
          </Field>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState title="Nothing matches these filters">
            Try widening the date range or choosing “All statuses”.
          </EmptyState>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: COLORS.BG_SURFACE_ALT }}>
                {["Event", "Dates", "Planner", "Room", "Guests", "Status", ""].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 14px",
                    fontSize: 10, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_MUTED,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: `1px solid ${COLORS.BORDER_STRONG}`, whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id} style={{ borderBottom: `1px solid ${COLORS.BORDER}` }}>
                  <td style={cell}>
                    <span style={{ fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_PRIMARY }}>
                      {event.eventName || "Untitled event"}
                    </span>
                    {event.needsReview && (
                      <span title={(event.reviewNotes || []).join("; ")} style={{
                        marginLeft: 8, color: COLORS.ERROR, fontSize: 10,
                        fontWeight: FONT.WEIGHT_BOLD, textTransform: "uppercase",
                      }}>
                        needs review
                      </span>
                    )}
                  </td>
                  <td style={cell}>
                    {[event.startDate, event.endDate].filter(Boolean).join(" → ") || "—"}
                  </td>
                  <td style={cell}>{event.plannerName || "—"}</td>
                  <td style={cell}>{event.primaryRoomId || event.buildingId || "—"}</td>
                  <td style={cell}>{event.expectedAttendance ?? "—"}</td>
                  <td style={cell}>
                    <StatusBadge requestStatus={event.requestStatus} lifecycleStatus={event.lifecycleStatus} />
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    <button onClick={() => onOpen(event.id)} style={{
                      background: "none", border: `1px solid ${COLORS.AQUA}55`,
                      color: COLORS.AQUA_DARK, borderRadius: RADIUS.MD,
                      padding: "5px 12px", cursor: "pointer",
                      fontFamily: FONT.FAMILY, fontWeight: FONT.WEIGHT_BOLD, fontSize: 11,
                    }}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

const cell = { padding: "10px 14px", color: COLORS.TEXT_SECONDARY, verticalAlign: "middle" };

function Chip({ label, value, tone, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "baseline", gap: 8,
      background: COLORS.BG_SURFACE, border: `1px solid ${tone}44`,
      borderRadius: RADIUS.MD, padding: "8px 14px", cursor: "pointer",
      fontFamily: FONT.FAMILY,
    }}>
      <span style={{ fontSize: 18, fontWeight: FONT.WEIGHT_BOLD, color: tone }}>{value}</span>
      <span style={{ fontSize: 11, color: COLORS.TEXT_MUTED, fontWeight: 500 }}>{label}</span>
    </button>
  );
}
