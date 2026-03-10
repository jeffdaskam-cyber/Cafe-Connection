import { useState } from "react";
import Dashboard from "./Dashboard.jsx";
import WeeklyOps from "./WeeklyOps.jsx";

// ── Brand Palette ─────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
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

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard",   icon: "📊" },
    { id: "weeklyops", label: "Weekly Ops",  icon: "📋" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${SPACE}; }
        @keyframes ucar-slide { from{transform:translateX(-120%)} to{transform:translateX(220%)} }
        @keyframes ucar-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ucar-fadein { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ucar-tab-btn { transition: all .2s ease; }
        .ucar-tab-btn:hover { color: ${TPRI} !important; }
        .ucar-campus-btn { transition: all .22s ease; }
        .ucar-campus-btn:hover { filter: brightness(1.15); }
        .ucar-monthend-btn { transition: all .22s ease; }
        .ucar-monthend-btn:hover { background: ${AQUA}22 !important; color: ${AQUA} !important; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${SPACE} 0%, #001230 100%)`,
        color: TPRI,
        fontFamily: "'Poppins',sans-serif",
        paddingBottom: 48,
      }}>

        {/* ── Header ── */}
        <div style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: "0 36px",
          background: `${SPACE}f0`,
          position: "sticky", top: 0, zIndex: 20,
          backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          height: 64, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", right: 200, top: 0, opacity: 0.25 }}>
            <WaveGraphic color={AQUA} opacity={0.6} width={500} height={64} />
          </div>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: `linear-gradient(135deg, ${AQUA}, ${DARKBLUE})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 16px ${AQUA}44`, flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <ellipse cx="12" cy="12" rx="10" ry="10" stroke="white" strokeWidth="1.2" />
                <path d="M4 10 Q8 6 12 10 Q16 14 20 10" stroke="white" strokeWidth="1.4" fill="none" />
                <path d="M4 14 Q8 10 12 14 Q16 18 20 14" stroke="white" strokeWidth="1.4" fill="none" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "0.02em", color: TPRI }}>
                <span style={{ color: AQUA }}>UCAR</span> Cafe Connection
              </div>
              <div style={{ fontSize: 10, color: TSEC, fontWeight: 500,
                letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Catering &amp; Cafe Information Hub
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
            {tabs.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} className="ucar-tab-btn"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 20px", borderRadius: 8, border: "none",
                    cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                    fontWeight: 600, fontSize: 12, letterSpacing: "0.03em",
                    background: active ? `${AQUA}22` : "transparent",
                    color: active ? AQUA : TSEC,
                    borderBottom: active ? `2px solid ${AQUA}` : "2px solid transparent",
                    borderRadius: 0,
                    transition: "all .2s ease",
                  }}>
                  <span style={{ fontSize: 14 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Date */}
          <div style={{ fontSize: 11, color: TSEC, fontWeight: 500,
            letterSpacing: "0.04em", zIndex: 1 }}>
            {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>

        {/* ── Tab Content ── */}
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "weeklyops" && <WeeklyOps />}

      </div>
    </>
  );
}
