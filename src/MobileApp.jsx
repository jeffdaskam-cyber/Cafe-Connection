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
        justifyContent: "center", background: "#F1F0EE",
        fontFamily: "Poppins, Helvetica, sans-serif",
      }}>
        <div style={{ color: "#888", fontSize: 13, fontWeight: 500 }}>Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      height:        "100dvh",
      background:    "#F1F0EE",
      fontFamily:    "Poppins, Helvetica, sans-serif",
      overflow:      "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        background:    "#00357A",
        color:         "#FFFFFF",
        padding:       "12px 16px",
        fontSize:      16,
        fontWeight:    700,
        letterSpacing: 0.5,
        flexShrink:    0,
        display:       "flex",
        justifyContent: "space-between",
        alignItems:    "center",
      }}>
        <span><span style={{ color: "#34E1F4" }}>UCAR</span> Cafe Connection</span>
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
        background:          "#00357A",
        borderTop:           "1px solid #00818F",
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
              color:         activeTab === tab.id ? "#34E1F4" : "#7aaec8",
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
