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

export default function CateringReferenceData() {
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function seed() {
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
        body: JSON.stringify({ action: "seed-reference" }),
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

  return (
    <div style={{ fontSize: 14 }}>
      <p style={{ color: COLORS.TEXT_SECONDARY, lineHeight: 1.6, marginBottom: 16 }}>
        Writes the buildings and rooms the catering intake form offers on its
        Rooms step. Safe to run more than once — existing entries are updated
        rather than duplicated.
      </p>

      <button
        onClick={seed}
        disabled={status === "running"}
        style={{
          background: status === "running" ? COLORS.BORDER : COLORS.AQUA,
          border: "none", borderRadius: 6, padding: "9px 18px",
          cursor: status === "running" ? "not-allowed" : "pointer",
          fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13,
          color: COLORS.TEXT_ON_ACCENT,
        }}>
        {status === "running" ? "Seeding…" : "Seed buildings & rooms"}
      </button>

      {status === "done" && result && (
        <div style={{ marginTop: 16, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: COLORS.SUCCESS }}>
            Done — {result.buildings} buildings, {result.rooms} rooms.
          </div>
          {/* A room pointing at an unknown building silently disappears from the
              form's building filter, and a building with no campus blocks the
              revenue rollup. Both are quiet failures worth showing. */}
          {result.orphanRooms?.length > 0 && (
            <div style={{ color: COLORS.WARNING }}>
              Rooms referencing an unknown building: {result.orphanRooms.join(", ")}
            </div>
          )}
          {result.buildingsWithoutCampus?.length > 0 && (
            <div style={{ color: COLORS.WARNING }}>
              Buildings with no campus mapping: {result.buildingsWithoutCampus.join(", ")}
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div style={{ marginTop: 16, color: COLORS.ERROR, lineHeight: 1.6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
