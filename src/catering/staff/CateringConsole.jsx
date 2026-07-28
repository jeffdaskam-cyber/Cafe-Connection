/**
 * CateringConsole.jsx — the staff "Catering" tab.
 *
 * Mounted inside the existing Cafe Connection shell, gated to manager and above
 * by canAccessPage(role, "catering") and enforced independently by the security
 * rules. Two views: the incoming request queue and the cross-event daily
 * schedule.
 */
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/AuthContext.jsx";
import { useRole } from "../../hooks/useRole.js";
import { canAccessPage } from "../../utils/permissions.js";
import { COLORS, FONT, RADIUS } from "../../theme.js";
import { fetchBuildings, fetchRooms } from "../data.js";
import { subscribeAllCateringEvents } from "../staffData.js";
import { QUEUE_FILTER_DEFAULTS } from "../staffFilters.js";
import { Banner, Card } from "../ui.jsx";
import DailySchedule from "./DailySchedule.jsx";
import EventDetail from "./EventDetail.jsx";
import RequestQueue from "./RequestQueue.jsx";

const VIEWS = [
  { id: "queue",    label: "Request queue"  },
  { id: "schedule", label: "Daily schedule" },
];

export default function CateringConsole() {
  const { user } = useAuth();
  const { role, roleLoading } = useRole();

  const [view, setView] = useState("queue");
  const [events, setEvents] = useState(null);
  const [openEventId, setOpenEventId] = useState(null);
  const [filters, setFilters] = useState(QUEUE_FILTER_DEFAULTS);
  const [rooms, setRooms] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState("");

  const allowed = canAccessPage(role, "catering");

  useEffect(() => {
    if (!allowed) return undefined;
    return subscribeAllCateringEvents(
      (rows) => { setEvents(rows); setError(""); },
      (err) => setError(
        err?.code === "permission-denied"
          ? "Your account doesn't have access to catering events."
          : "Couldn't load catering events. Please try again shortly."
      )
    );
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    Promise.all([fetchBuildings(), fetchRooms()])
      .then(([b, r]) => { setBuildings(b); setRooms(r); })
      .catch((err) => console.error("[catering/staff] reference data failed:", err));
  }, [allowed]);

  const openEvent = useMemo(
    () => (events || []).find((e) => e.id === openEventId) ?? null,
    [events, openEventId]
  );

  if (roleLoading) {
    return <Shell><Card><div style={{ color: COLORS.TEXT_MUTED, fontSize: 13 }}>Checking access…</div></Card></Shell>;
  }

  if (!allowed) {
    return (
      <Shell>
        <Banner tone="warning" title="Manager access required">
          The catering console is available to managers and above. If you need
          access, contact an administrator.
        </Banner>
      </Shell>
    );
  }

  return (
    <Shell>
      {!openEvent && (
        <nav style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: "8px 18px", borderRadius: RADIUS.MD,
                border: `1px solid ${active ? COLORS.AQUA : COLORS.BORDER}`,
                background: active ? `${COLORS.AQUA}12` : "transparent",
                color: active ? COLORS.AQUA_DARK : COLORS.TEXT_SECONDARY,
                fontFamily: FONT.FAMILY, fontWeight: FONT.WEIGHT_BOLD, fontSize: 12,
                cursor: "pointer",
              }}>
                {v.label}
              </button>
            );
          })}
        </nav>
      )}

      {error && <Banner tone="error" title="Couldn't load catering">{error}</Banner>}

      {events === null && !error ? (
        <Card><div style={{ color: COLORS.TEXT_MUTED, fontSize: 13 }}>Loading catering events…</div></Card>
      ) : openEvent ? (
        <EventDetail event={openEvent} user={user} rooms={rooms} buildings={buildings}
          onBack={() => setOpenEventId(null)} />
      ) : view === "queue" ? (
        <RequestQueue events={events || []} buildings={buildings}
          filters={filters} onFiltersChange={setFilters} onOpen={setOpenEventId} />
      ) : (
        <DailySchedule events={events || []} />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ padding: "28px 36px 64px", fontFamily: FONT.FAMILY }}>
      <h1 style={{
        fontSize: FONT.SIZE_XL, fontWeight: FONT.WEIGHT_BOLD,
        color: COLORS.TEXT_PRIMARY, marginBottom: 6,
      }}>
        Catering
      </h1>
      <p style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 24 }}>
        Incoming event requests and the cross-event catering schedule.
      </p>
      {children}
    </div>
  );
}
