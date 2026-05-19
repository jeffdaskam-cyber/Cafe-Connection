/**
 * MobileApp — mobile shell with a sticky header, scrollable content area,
 * and a fixed bottom tab bar. Renders when viewport width <= 768px.
 *
 * Tabs: Staff Schedule, Cafe Specials, BEOs, Ops
 * BEOs expands to: Event Order Library
 * Ops expands to: Cash Drop, Event Report, Set Up Report
 */

import { useState } from "react";
import { useAuth } from "./contexts/AuthContext.jsx";
import LoginPage              from "./pages/LoginPage.jsx";
import MobileSchedulePage     from "./pages/mobile/MobileSchedulePage.jsx";
import MobileSpecialsPage     from "./pages/mobile/MobileSpecialsPage.jsx";
import MobileOpsPage          from "./pages/mobile/MobileOpsPage.jsx";
import MobileEventOrdersPage  from "./pages/mobile/MobileEventOrdersPage.jsx";
import MobileEventReportPage  from "./pages/mobile/MobileEventReportPage.jsx";
import MobileSetUpReportPage  from "./pages/mobile/MobileSetUpReportPage.jsx";
import { COLORS, FONT } from "./theme";

const TABS = [
  {
    id:    "schedule",
    label: "Schedule",
    icon:  "📅",
  },
  {
    id:    "specials",
    label: "Specials",
    icon:  "🍽️",
  },
  {
    id:    "beos",
    label: "BEOs",
    icon:  "📋",
    subItems: [
      { id: "event-orders", label: "Event Order Library" },
    ],
  },
  {
    id:    "ops",
    label: "Ops",
    icon:  "⚙️",
    subItems: [
      { id: "cash-drop",    label: "Cash Drop" },
      { id: "event-report", label: "Event Report" },
      { id: "setup-report", label: "Set Up Report" },
    ],
  },
];

export default function MobileApp() {
  const { user, loading, logout } = useAuth();
  const [activeTab,     setActiveTab]     = useState("schedule");
  const [activeSubView, setActiveSubView] = useState({ beos: "event-orders", ops: "cash-drop" });
  const [subMenuOpen,   setSubMenuOpen]   = useState(false);

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

  function handleTabClick(tab) {
    if (tab.subItems) {
      if (activeTab === tab.id) {
        setSubMenuOpen((open) => !open);
      } else {
        setActiveTab(tab.id);
        setSubMenuOpen(true);
      }
    } else {
      setActiveTab(tab.id);
      setSubMenuOpen(false);
    }
  }

  function handleSubItemClick(tabId, subId) {
    setActiveSubView((prev) => ({ ...prev, [tabId]: subId }));
    setSubMenuOpen(false);
  }

  function renderContent() {
    if (activeTab === "schedule") return <MobileSchedulePage />;
    if (activeTab === "specials") return <MobileSpecialsPage />;
    if (activeTab === "beos") {
      if (activeSubView.beos === "event-orders") return <MobileEventOrdersPage />;
    }
    if (activeTab === "ops") {
      if (activeSubView.ops === "cash-drop")    return <MobileOpsPage />;
      if (activeSubView.ops === "event-report") return <MobileEventReportPage />;
      if (activeSubView.ops === "setup-report") return <MobileSetUpReportPage />;
    }
    return null;
  }

  const activeTabDef = TABS.find((t) => t.id === activeTab);
  const subItems = subMenuOpen && activeTabDef?.subItems ? activeTabDef.subItems : null;
  const currentSubView = activeSubView[activeTab];

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
        background:     COLORS.MOBILE_HEADER,
        color:          COLORS.TEXT_ON_ACCENT,
        padding:        "12px 16px",
        fontSize:       16,
        fontWeight:     700,
        letterSpacing:  0.5,
        flexShrink:     0,
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
      }}>
        <span><span style={{ color: COLORS.LAQUA }}>UCAR</span> Cafe Connection</span>
        <button
          onClick={logout}
          style={{
            background:   "transparent",
            border:       "1px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            padding:      "4px 10px",
            color:        "rgba(255,255,255,0.7)",
            fontSize:     10,
            fontWeight:   600,
            fontFamily:   "inherit",
            cursor:       "pointer",
          }}
        >
          Sign out
        </button>
      </div>

      {/* ── Page content ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {renderContent()}
      </div>

      {/* ── Sub-item row (slides up above nav bar when a parent tab is active) ── */}
      {subItems && (
        <div style={{
          background:  COLORS.MOBILE_SUBHEAD_BG,
          borderTop:   `1px solid ${COLORS.AQUA_DARK}`,
          display:     "flex",
          flexShrink:  0,
          overflowX:   "auto",
        }}>
          {subItems.map((sub) => {
            const isActive = currentSubView === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => handleSubItemClick(activeTab, sub.id)}
                style={{
                  flex:          1,
                  background:    "none",
                  border:        "none",
                  borderBottom:  isActive ? `2px solid ${COLORS.LAQUA}` : "2px solid transparent",
                  color:         isActive ? COLORS.LAQUA : COLORS.MOBILE_NAV_INACTIVE,
                  padding:       "10px 8px 8px",
                  fontSize:      11,
                  fontWeight:    isActive ? 700 : 400,
                  fontFamily:    "inherit",
                  cursor:        "pointer",
                  whiteSpace:    "nowrap",
                  textAlign:     "center",
                }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Bottom nav ── */}
      <nav style={{
        display:             "grid",
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        background:          COLORS.MOBILE_HEADER,
        borderTop:           `1px solid ${COLORS.AQUA_DARK}`,
        flexShrink:          0,
        paddingBottom:       "env(safe-area-inset-bottom)",
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              style={{
                background:    "none",
                border:        "none",
                color:         isActive ? COLORS.LAQUA : COLORS.MOBILE_NAV_INACTIVE,
                padding:       "10px 4px 8px",
                fontSize:      10,
                fontWeight:    isActive ? 700 : 400,
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
              {tab.subItems && isActive && (
                <span style={{ fontSize: 8, lineHeight: 1 }}>
                  {subMenuOpen ? "▲" : "▼"}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
