/**
 * MobileApp — mobile shell with a sticky header, scrollable content area,
 * and a fixed bottom tab bar. Renders when viewport width <= 768px.
 *
 * Tabs: Schedule, Specials, Ops, Dashboard
 * Reports, Financials, and Admin are intentionally excluded on mobile.
 */

import { useState } from "react";
import { useAuth } from "./contexts/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MobileSchedulePage   from "./pages/mobile/MobileSchedulePage.jsx";
import MobileSpecialsPage   from "./pages/mobile/MobileSpecialsPage.jsx";
import MobileOpsPage        from "./pages/mobile/MobileOpsPage.jsx";
import MobileDashboardPage  from "./pages/mobile/MobileDashboardPage.jsx";
import { COLORS, FONT } from "./theme";

const TABS = [
  { id: "schedule",  label: "Schedule",  icon: "\uD83D\uDCC5" },
  { id: "specials",  label: "Specials",  icon: "\uD83C\uDF7D\uFE0F" },
  { id: "ops",       label: "Ops",       icon: "\uD83D\uDCCB" },
  { id: "dashboard", label: "Dashboard", icon: "\uD83D\uDCCA" },
];

export default function MobileApp() {
  const { user, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("schedule");

  if (loading) {
    return (
      <div style={{
        height: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: COLORS.MOBILE_BG,
        fontFamily: FONT.FAMILY,
      }}>
        <div style={{ color: COLORS.TEXT_MUTED, fontSize: 13, fontWeight: 500 }}>Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      height:        "100dvh",
      background:    COLORS.MOBILE_BG,
      fontFamily:    FONT.FAMILY,
      overflow:      "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        background:    COLORS.MOBILE_HEADER,
        color:         COLORS.TEXT_ON_ACCENT,
        padding:       "12px 16px",
        fontSize:      16,
        fontWeight:    700,
        letterSpacing: 0.5,
        flexShrink:    0,
        display:       "flex",
        justifyContent: "space-between",
        alignItems:    "center",
      }}>
        <span><span style={{ color: COLORS.LAQUA }}>UCAR</span> Cafe Connection</span>
        <button
          onClick={logout}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            padding: "4px 10px",
            color: "rgba(255,255,255,0.7)",
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>

      {/* ── Page content ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {activeTab === "schedule"  && <MobileSchedulePage  />}
        {activeTab === "specials"  && <MobileSpecialsPage  />}
        {activeTab === "ops"       && <MobileOpsPage       />}
        {activeTab === "dashboard" && <MobileDashboardPage />}
      </div>

      {/* ── Bottom nav ── */}
      <nav style={{
        display:             "grid",
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        background:          COLORS.MOBILE_HEADER,
        borderTop:           `1px solid ${COLORS.AQUA_DARK}`,
        flexShrink:          0,
        paddingBottom:       "env(safe-area-inset-bottom)",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background:    "none",
              border:        "none",
              color:         activeTab === tab.id ? COLORS.LAQUA : COLORS.MOBILE_NAV_INACTIVE,
              padding:       "10px 4px 8px",
              fontSize:      10,
              fontWeight:    activeTab === tab.id ? 700 : 400,
              fontFamily:    "inherit",
              cursor:        "pointer",
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           3,
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
