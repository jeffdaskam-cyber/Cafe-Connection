/**
 * CateringApp.jsx — Catering Companion entry point (mounted at /catering).
 *
 * PHASE 0 (Environment) — this is a placeholder shell. It proves the second
 * entry point resolves, that the feature flag gates it, and that the build is
 * pointed at a sandbox rather than production. It deliberately performs no
 * Firebase reads or writes; auth and the intake form land in Phase 2.
 */
import { COLORS, FONT, RADIUS, SHADOWS } from "../theme.js";
import { DATA_TARGET_LABEL, SANDBOX_MODE } from "../config/features.js";
import { cateringSubPath } from "./routing.js";

const PHASES = [
  { id: 0, name: "Environment",     status: "in progress", detail: "Sandbox, feature flag, /catering entry point" },
  { id: 1, name: "Data foundation", status: "pending",     detail: "Collections, security rules, indexes, seed data" },
  { id: 2, name: "Requester intake", status: "pending",    detail: "Multi-step form, my-requests view" },
  { id: 3, name: "Staff console",   status: "pending",     detail: "Catering tab, queue, confirm / assign / close" },
  { id: 4, name: "Reporting rollup", status: "pending",    detail: "event_revenue rollup, dashboard widget" },
  { id: 5, name: "Automation + UAT", status: "pending",    detail: "Notifications, recap PDF, cron, sign-off" },
];

export default function CateringApp() {
  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.BG_PAGE,
      color: COLORS.TEXT_PRIMARY,
      fontFamily: FONT.FAMILY,
    }}>
      {SANDBOX_MODE && <SandboxBanner />}

      <header style={{
        background: COLORS.NAV_BG,
        borderBottom: `1px solid ${COLORS.NAV_BORDER}`,
        padding: "0 36px",
        height: 64,
        display: "flex",
        alignItems: "center",
      }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "0.02em", color: "#FFFFFF" }}>
          <span style={{ color: COLORS.AQUA }}>UCAR</span> Catering Companion
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 64px" }}>
        <section style={cardStyle}>
          <h1 style={{ fontSize: FONT.SIZE_XL, fontWeight: FONT.WEIGHT_BOLD, marginBottom: 8 }}>
            Catering Companion — under construction
          </h1>
          <p style={{ fontSize: FONT.SIZE_SM, color: COLORS.TEXT_MUTED, lineHeight: 1.6 }}>
            This entry point is live but not yet functional. Event intake opens in Phase 2.
            Nothing here reads or writes Cafe Connection production data.
          </p>

          <dl style={{ marginTop: 24, display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", fontSize: FONT.SIZE_XS }}>
            <dt style={dtStyle}>Route</dt>
            <dd style={ddStyle}><code>/catering{cateringSubPath(window.location.pathname).replace(/^\/$/, "")}</code></dd>
            <dt style={dtStyle}>Feature flag</dt>
            <dd style={ddStyle}><code>VITE_CATERING_ENABLED=true</code></dd>
            <dt style={dtStyle}>Data target</dt>
            <dd style={ddStyle}>{DATA_TARGET_LABEL}</dd>
          </dl>
        </section>

        <section style={{ ...cardStyle, marginTop: 20 }}>
          <h2 style={{ fontSize: FONT.SIZE_MD, fontWeight: FONT.WEIGHT_BOLD, marginBottom: 16 }}>
            Delivery phases
          </h2>
          <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {PHASES.map((phase) => (
              <li key={phase.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "10px 14px",
                background: COLORS.BG_SURFACE_ALT,
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.MD,
              }}>
                <StatusPill status={phase.status} />
                <div>
                  <div style={{ fontSize: FONT.SIZE_XS, fontWeight: FONT.WEIGHT_BOLD }}>
                    Phase {phase.id} — {phase.name}
                  </div>
                  <div style={{ fontSize: FONT.SIZE_XS, color: COLORS.TEXT_MUTED }}>
                    {phase.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

function SandboxBanner() {
  return (
    <div style={{
      background: COLORS.ORANGE,
      color: COLORS.TEXT_PRIMARY,
      padding: "8px 36px",
      fontSize: FONT.SIZE_XS,
      fontWeight: FONT.WEIGHT_BOLD,
      letterSpacing: "0.04em",
      textAlign: "center",
    }}>
      SANDBOX — connected to the local Firebase Emulator Suite. No production data is reachable.
    </div>
  );
}

function StatusPill({ status }) {
  const color = status === "in progress" ? COLORS.AQUA : COLORS.TEXT_DISABLED;
  return (
    <span style={{
      flexShrink: 0,
      padding: "3px 10px",
      borderRadius: RADIUS.PILL,
      border: `1px solid ${color}`,
      color,
      fontSize: 11,
      fontWeight: FONT.WEIGHT_BOLD,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      minWidth: 92,
      textAlign: "center",
    }}>
      {status}
    </span>
  );
}

const cardStyle = {
  background: COLORS.BG_SURFACE,
  border: `1px solid ${COLORS.BORDER}`,
  borderRadius: RADIUS.LG,
  boxShadow: SHADOWS.SM,
  padding: 28,
};

const dtStyle = { color: COLORS.TEXT_MUTED, fontWeight: FONT.WEIGHT_MED };
const ddStyle = { color: COLORS.TEXT_SECONDARY };
