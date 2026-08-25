/**
 * Admin control for seeding catering reference data (buildings and rooms).
 *
 * The intake form's Rooms step is unusable until these exist, and the terminal
 * seeder (`npm run catering:seed`) needs a local Node install plus service
 * account credentials — neither of which the person administering a deployed
 * environment necessarily has. This runs the same code path through
 * POST /api/catering {"action":"seed-reference"}, which is administrator-only
 * and idempotent, so re-running after a room list update is safe.
 */

import { useState } from "react";

import { auth } from "../../firebase.js";
import { COLORS } from "../../theme.js";

const buttonStyle = (running) => ({
  background: running ? COLORS.BORDER : COLORS.AQUA,
  border: "none", borderRadius: 6, padding: "9px 18px",
  cursor: running ? "not-allowed" : "pointer",
  fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13,
  color: COLORS.TEXT_ON_ACCENT,
});

/**
 * Post a seed action to /api/catering, tracking its own loading/result/error
 * state. Two independent seeders share this shape — buildings/rooms and the
 * menu catalog — so a menu update doesn't force a re-seed of the room list.
 */
function useSeeder(action) {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function run() {
    setStatus("running");
    setError("");
    setResult(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/catering", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Seeding failed (${res.status}).`);
      setResult(payload);
      setStatus("done");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("error");
    }
  }

  return { status, result, error, run };
}

export default function CateringReferenceData() {
  const reference = useSeeder("seed-reference");
  const menu = useSeeder("seed-menu");

  return (
    <div style={{ fontSize: 14 }}>
      <p style={{ color: COLORS.TEXT_SECONDARY, lineHeight: 1.6, marginBottom: 16 }}>
        Writes the buildings and rooms the catering intake form offers on its
        Rooms step. Safe to run more than once — existing entries are updated
        rather than duplicated.
      </p>

      <button
        onClick={reference.run}
        disabled={reference.status === "running"}
        style={buttonStyle(reference.status === "running")}>
        {reference.status === "running" ? "Seeding…" : "Seed buildings & rooms"}
      </button>

      {reference.status === "done" && reference.result && (
        <div style={{ marginTop: 16, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: COLORS.SUCCESS }}>
            Done — {reference.result.buildings} buildings, {reference.result.rooms} rooms.
          </div>
          {/* A room pointing at an unknown building silently disappears from the
              form's building filter, and a building with no campus blocks the
              revenue rollup. Both are quiet failures worth showing. */}
          {reference.result.orphanRooms?.length > 0 && (
            <div style={{ color: COLORS.WARNING }}>
              Rooms referencing an unknown building: {reference.result.orphanRooms.join(", ")}
            </div>
          )}
          {reference.result.buildingsWithoutCampus?.length > 0 && (
            <div style={{ color: COLORS.WARNING }}>
              Buildings with no campus mapping: {reference.result.buildingsWithoutCampus.join(", ")}
            </div>
          )}
        </div>
      )}

      {reference.status === "error" && (
        <div style={{ marginTop: 16, color: COLORS.ERROR, lineHeight: 1.6 }}>
          {reference.error}
        </div>
      )}

      <hr style={{ border: "none", borderTop: `1px solid ${COLORS.BORDER}`, margin: "24px 0" }} />

      <p style={{ color: COLORS.TEXT_SECONDARY, lineHeight: 1.6, marginBottom: 16 }}>
        Writes the priced menu catalog the intake form offers for structured
        menu selections (Coffee Break to start). Safe to run more than once —
        a re-seed after a price edit updates existing items rather than
        duplicating them.
      </p>

      <button
        onClick={menu.run}
        disabled={menu.status === "running"}
        style={buttonStyle(menu.status === "running")}>
        {menu.status === "running" ? "Seeding…" : "Seed menu catalog"}
      </button>

      {menu.status === "done" && menu.result && (
        <div style={{ marginTop: 16, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: COLORS.SUCCESS }}>
            Done — {menu.result.menuItems} menu items.
          </div>
        </div>
      )}

      {menu.status === "error" && (
        <div style={{ marginTop: 16, color: COLORS.ERROR, lineHeight: 1.6 }}>
          {menu.error}
        </div>
      )}
    </div>
  );
}
