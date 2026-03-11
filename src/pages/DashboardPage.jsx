import { useAuth } from "../contexts/AuthContext.jsx";

// ── Brand Palette ─────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const PANEL    = "#001f4d";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const AQUA     = "#00A2B4";
const LAQUA    = "#34E1F4";

function WaveGraphic({ color = AQUA, opacity = 0.18, width = 420, height = 80 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
      {[0, 14, 28, 42].map((offset, i) => (
        <path key={i}
          d={`M0,${30+offset} C80,${10+offset} 160,${50+offset} 240,${28+offset} S380,${8+offset} ${width},${30+offset}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={opacity - i * 0.02} />
      ))}
    </svg>
  );
}

// Placeholder widget card shown before personalization is built (Phase 8)
function PlaceholderWidget({ icon, title, description, colSpan = 1 }) {
  return (
    <div style={{
      gridColumn: `span ${colSpan}`,
      background: PANEL, borderRadius: 14,
      border: `1.5px dashed ${BORDER}`,
      padding: "28px 24px",
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12,
      position: "relative", overflow: "hidden",
      opacity: 0.7,
    }}>
      <div style={{ position: "absolute", top: 0, right: 0, opacity: 0.04 }}>
        <WaveGraphic color={AQUA} opacity={1} width={300} height={80} />
      </div>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${AQUA}18`, border: `1px solid ${AQUA}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: TPRI, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11, color: TSEC, fontWeight: 500, lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{
        fontSize: 10, color: AQUA, fontWeight: 600,
        background: `${AQUA}18`, border: `1px solid ${AQUA}33`,
        borderRadius: 20, padding: "3px 10px",
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>Coming in Phase 8</div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
// Phase 8 will replace this with a configurable widget-based landing page.
// Users will be able to pin widgets from any module to their personal dashboard.
export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.email?.split("@")[0]?.split(".")[0] ?? "";
  const displayName = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : "there";

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Welcome Banner ── */}
      <div style={{
        background: PANEL, borderRadius: 16,
        border: `1px solid ${BORDER}`,
        padding: "32px 36px", marginBottom: 32,
        position: "relative", overflow: "hidden",
        animation: "ucar-fadein .5s ease both",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, opacity: 0.08 }}>
          <WaveGraphic color={AQUA} opacity={1} width={600} height={100} />
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${AQUA}, ${LAQUA}, transparent)`,
          borderRadius: "16px 16px 0 0" }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: TPRI, marginBottom: 8 }}>
          Welcome back, {displayName}.
        </div>
        <div style={{ fontSize: 13, color: TSEC, fontWeight: 500, maxWidth: 560, lineHeight: 1.6 }}>
          Your personal dashboard is coming soon. Once ready, you'll be able to pin
          widgets from <span style={{ color: AQUA }}>Weekly Ops</span>,{" "}
          <span style={{ color: AQUA }}>Financials</span>, and{" "}
          <span style={{ color: AQUA }}>Reports</span> to build your own view.
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["Weekly Ops", "Financials", "Reports"].map(tab => (
            <div key={tab} style={{
              fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 20,
              background: `${AQUA}18`, border: `1px solid ${AQUA}44`, color: AQUA,
              letterSpacing: "0.04em",
            }}>{tab}</div>
          ))}
        </div>
      </div>

      {/* ── Placeholder Widget Grid ── */}
      <div style={{ fontSize: 10, color: TSEC, fontWeight: 600, letterSpacing: "1.5px",
        textTransform: "uppercase", marginBottom: 16 }}>
        Widgets Preview
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: 16, marginBottom: 32,
        animation: "ucar-fadein .6s ease both",
      }}>
        <PlaceholderWidget icon="📊" title="Sales Summary"
          description="Net revenue and check counts for all three campuses at a glance." />
        <PlaceholderWidget icon="📋" title="Staff Schedule"
          description="This week's schedule pulled directly from Google Drive." />
        <PlaceholderWidget icon="📑" title="Month-End Report"
          description="One-click email report generator for accounting." />
        <PlaceholderWidget icon="💧" title="Cash Drop"
          description="Submit and track daily cash drops per campus." />
        <PlaceholderWidget icon="🍽️" title="Cafe Specials"
          description="This week's menu specials for front-line staff." />
        <PlaceholderWidget icon="📁" title="Recent Reports"
          description="Quick access to your most recently generated reports." />
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: `${TSEC}88`,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
