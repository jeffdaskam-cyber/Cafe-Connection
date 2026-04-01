import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import { useRole } from "./hooks/useRole.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import MobileApp    from "./MobileApp.jsx";
import LoginPage    from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ReportsPage  from "./pages/ReportsPage.jsx";
import AdminPage    from "./pages/AdminPage.jsx";
import FinancialsPage from "./Dashboard.jsx";
import WeeklyOps    from "./WeeklyOps.jsx";
import SplashScreen, { SHOW_SPLASH } from "./components/SplashScreen.jsx";
import { COLORS, SHADOWS } from "./theme.js";

function WaveGraphic({ color = COLORS.AQUA, opacity = 0.18, width = 420, height = 80 }) {
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

// ── Loading Screen ─────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.BG_PAGE,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Poppins',sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: `linear-gradient(135deg, ${COLORS.AQUA}, ${COLORS.AQUA_DARK})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
          boxShadow: `0 0 24px ${COLORS.AQUA}44`,
          animation: "ucar-pulse 1.6s ease-in-out infinite",
        }}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
            <ellipse cx="12" cy="12" rx="10" ry="10" stroke="white" strokeWidth="1.2" />
            <path d="M4 10 Q8 6 12 10 Q16 14 20 10" stroke="white" strokeWidth="1.4" fill="none" />
            <path d="M4 14 Q8 10 12 14 Q16 18 20 14" stroke="white" strokeWidth="1.4" fill="none" />
          </svg>
        </div>
        <div style={{ color: COLORS.TEXT_MUTED, fontSize: 12, fontWeight: 500, letterSpacing: "0.08em",
          textTransform: "uppercase" }}>
          Loading…
        </div>
      </div>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard",  label: "Dashboard"  },
  { id: "weeklyops",  label: "Weekly Ops" },
  { id: "financials", label: "Financials" },
  { id: "reports",    label: "Reports"    },
];

// ── Main App Shell ─────────────────────────────────────────────────────────────
function AppShell() {
  const { user, loading, logout } = useAuth();
  const { isAdministrator } = useRole();
  const [activeTab, setActiveTab] = useState("dashboard");
  const isMobile = useIsMobile();

  if (loading) return <LoadingScreen />;
  if (!user)   return <LoginPage />;
  if (isMobile) return <MobileApp />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${COLORS.BG_PAGE}; }
        @keyframes ucar-slide   { from{transform:translateX(-120%)} to{transform:translateX(220%)} }
        @keyframes ucar-pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ucar-fadein  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ucar-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .ucar-tab-btn   { transition: all .2s ease; }
        .ucar-tab-btn:hover { color: ${COLORS.TEXT_PRIMARY} !important; }
        .ucar-campus-btn { transition: all .22s ease; }
        .ucar-campus-btn:hover { filter: brightness(1.15); }
        .ucar-monthend-btn { transition: all .22s ease; }
        .ucar-monthend-btn:hover { background: ${COLORS.AQUA}22 !important; color: ${COLORS.AQUA} !important; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: COLORS.BG_PAGE,
        color: COLORS.TEXT_PRIMARY,
        fontFamily: "'Poppins',sans-serif",
        paddingBottom: 48,
      }}>

        {/* ── Sticky Header ── */}
        <div style={{
          borderBottom: `1px solid ${COLORS.NAV_BORDER}`,
          padding: "0 36px",
          background: COLORS.NAV_BG,
          position: "sticky", top: 0, zIndex: 20,
          boxShadow: SHADOWS.SM,
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          height: 64, overflow: "hidden",
        }}>
          {/* Wave decoration */}
          <div style={{ position: "absolute", right: 200, top: 0, opacity: 0.12 }}>
            <WaveGraphic color={COLORS.AQUA} opacity={0.6} width={500} height={64} />
          </div>

          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", zIndex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "0.02em", color: COLORS.TEXT_PRIMARY }}>
              <span style={{ color: COLORS.AQUA }}>UCAR</span> Cafe Connection
            </div>
          </div>

          {/* Tab navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} className="ucar-tab-btn"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: "8px 20px", borderRadius: 0, border: "none",
                    cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                    fontWeight: 600, fontSize: 12, letterSpacing: "0.03em",
                    background: active ? `${COLORS.AQUA}12` : "transparent",
                    color: active ? COLORS.NAV_TEXT_ACTIVE : COLORS.NAV_TEXT,
                    borderBottom: active ? `2px solid ${COLORS.NAV_INDICATOR}` : "2px solid transparent",
                    transition: "all .2s ease",
                  }}>
                  {tab.label}
                </button>
              );
            })}
            {isAdministrator && (
              <button className="ucar-tab-btn"
                onClick={() => setActiveTab("admin")}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "8px 20px", borderRadius: 0, border: "none",
                  cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                  fontWeight: 600, fontSize: 12, letterSpacing: "0.03em",
                  background: activeTab === "admin" ? `${COLORS.AQUA}12` : "transparent",
                  color: activeTab === "admin" ? COLORS.NAV_TEXT_ACTIVE : COLORS.NAV_TEXT,
                  borderBottom: activeTab === "admin" ? `2px solid ${COLORS.NAV_INDICATOR}` : "2px solid transparent",
                  transition: "all .2s ease",
                }}>
                Admin
              </button>
            )}
          </div>

          {/* Date + user info */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, zIndex: 1 }}>
            <div style={{ fontSize: 11, color: COLORS.TEXT_MUTED, fontWeight: 500, letterSpacing: "0.04em" }}>
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 500,
                maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {user.displayName || user.email}
              </div>
              <button
                onClick={logout}
                title="Sign out"
                style={{
                  background: "transparent", border: `1px solid ${COLORS.BORDER}`,
                  borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                  fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                  fontSize: 10, color: COLORS.TEXT_MUTED, letterSpacing: "0.04em",
                  transition: "all .2s",
                }}>
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab Content ── */}
        {activeTab === "dashboard"  && <DashboardPage />}
        {activeTab === "weeklyops"  && <WeeklyOps />}
        {activeTab === "financials" && <FinancialsPage />}
        {activeTab === "reports"    && <ReportsPage />}
        {activeTab === "admin"      && <AdminPage />}

      </div>
    </>
  );
}

// ── Root App — wraps everything with AuthProvider ──────────────────────────────
export default function App() {
  // Splash is shown once per page load. AppShell renders beneath it so Firebase
  // auth can initialize in parallel — by the time the splash fades, auth is ready.
  const [splashDone, setSplashDone] = useState(!SHOW_SPLASH);

  return (
    <AuthProvider>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <AppShell />
    </AuthProvider>
  );
}
