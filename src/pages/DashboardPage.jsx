/**
 * DashboardPage — Phase 8 personalized widget grid.
 *
 * Loads per-user prefs from Firestore (user_dashboard_prefs/{uid}).
 * Shows a first-run wizard if setupDone is false (brand-new user).
 * Renders the enabled widgets in position order on a 3-column grid.
 * An "Edit Dashboard" button re-opens the widget picker at any time.
 */

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useDashboardPrefs } from "../hooks/useDashboardPrefs.js";
import { widgetById, defaultPrefs, WIDGET_REGISTRY } from "../registries/widgetRegistry.js";
import FirstRunWizard from "../components/dashboard/FirstRunWizard.jsx";
import { COLORS, SHADOWS, RADIUS } from "../theme.js";

// ── Mini widget components ────────────────────────────────────────────────────
import SalesSummaryWidget  from "../components/dashboard/SalesSummaryWidget.jsx";
import ScheduleWidget      from "../components/dashboard/ScheduleWidget.jsx";
import CashDropWidget      from "../components/dashboard/CashDropWidget.jsx";
import CafeSpecialsWidget  from "../components/dashboard/CafeSpecialsWidget.jsx";
import RecentReportsWidget from "../components/dashboard/RecentReportsWidget.jsx";
import EventOrderLibraryWidget from "../components/dashboard/EventOrderLibraryWidget.jsx";
import WeeklyExceptions from "../components/WeeklyExceptions.jsx";

// ── Widget component map ──────────────────────────────────────────────────────
const WIDGET_COMPONENTS = {
  sales_summary:       SalesSummaryWidget,
  schedule:            ScheduleWidget,
  cash_drop:           CashDropWidget,
  cafe_specials:       CafeSpecialsWidget,
  recent_reports:      RecentReportsWidget,
  event_order_library: EventOrderLibraryWidget,
  weekly_exceptions: WeeklyExceptions,
};


// ── Wave decoration ───────────────────────────────────────────────────────────
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

// ── Loading skeleton for the whole page ───────────────────────────────────────
function PageSkeleton() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>
      <div style={{
        background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
        border: `1px solid ${COLORS.BORDER}`,
        height: 100, marginBottom: 32,
        animation: "ucar-shimmer 1.6s ease-in-out infinite",
        backgroundSize: "200% 100%",
        backgroundImage: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
      }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{
            background: COLORS.BG_SURFACE, borderRadius: RADIUS.MD,
            border: `1px solid ${COLORS.BORDER}`,
            height: 160,
            animation: "ucar-shimmer 1.6s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
            backgroundSize: "200% 100%",
            backgroundImage: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { prefs, loading: prefsLoading, saving, saveErr, savePrefs } = useDashboardPrefs();

  const [wizardOpen,    setWizardOpen]    = useState(false);
  const [editOpen,      setEditOpen]      = useState(false);
  const [seedAttempted, setSeedAttempted] = useState(false);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState(null);

  // Read displayName from Firestore users doc (written by FirstRunWizard).
  // Falls back to email-derived name if not yet set.
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) setFirestoreDisplayName(snap.data().displayName || null);
    });
  }, [user?.uid]);

  const displayName = (() => {
    if (firestoreDisplayName) return firestoreDisplayName;
    const firstName = user?.email?.split("@")[0]?.split(".")[0] ?? "";
    return firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "there";
  })();

  // When prefs finish loading: if no doc exists, seed defaults and open wizard
  useEffect(() => {
    if (prefsLoading) return;
    if (prefs === null && !seedAttempted) {
      setSeedAttempted(true);
      setWizardOpen(true);
    } else if (prefs && !prefs.setupDone && !wizardOpen && !seedAttempted) {
      setSeedAttempted(true);
      setWizardOpen(true);
    }
  }, [prefsLoading, prefs]);

  // Sort and filter widgets from prefs
  const enabledWidgets = (prefs?.widgets ?? [])
    .filter(w => w.enabled)
    .sort((a, b) => a.position - b.position);

  // Get the user's primary campus (from first campus-aware enabled widget)
  const primaryCampus = (() => {
    const cw = (prefs?.widgets ?? []).find(w => {
      const meta = WIDGET_REGISTRY.find(r => r.widgetId === w.widgetId);
      return meta?.needsCampus && w.config?.campus;
    });
    return cw?.config?.campus ?? "Mesa Lab";
  })();

  if (prefsLoading) return <PageSkeleton />;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── First-run wizard ── */}
      {wizardOpen && (
        <FirstRunWizard
          initialPrefs={prefs ?? defaultPrefs()}
          onSave={async (newPrefs) => {
            await savePrefs(newPrefs);
            setWizardOpen(false);
          }}
          allowClose={false}
          startAtStep={0}
        />
      )}

      {/* ── Edit Dashboard widget picker ── */}
      {editOpen && (
        <FirstRunWizard
          initialPrefs={prefs}
          onSave={async (newPrefs) => {
            await savePrefs(newPrefs);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
          allowClose={true}
          startAtStep={1}
        />
      )}

      {/* ── Welcome Banner ── */}
      <div style={{
        background: COLORS.BG_SURFACE, borderRadius: RADIUS.LG,
        border: `1px solid ${COLORS.BORDER}`,
        boxShadow: SHADOWS.SM,
        padding: "28px 36px", marginBottom: 32,
        position: "relative", overflow: "hidden",
        animation: "ucar-fadein .5s ease both",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, opacity: 0.07 }}>
          <WaveGraphic color={COLORS.AQUA} opacity={1} width={600} height={100} />
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${COLORS.AQUA}, ${COLORS.LAQUA}, transparent)`,
          borderRadius: `${RADIUS.LG} ${RADIUS.LG} 0 0` }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 6 }}>
              Welcome back, {displayName}.
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, fontWeight: 500, lineHeight: 1.65 }}>
              {enabledWidgets.length > 0
                ? `Your dashboard — ${enabledWidgets.length} widget${enabledWidgets.length !== 1 ? "s" : ""} active · Primary campus: ${primaryCampus}`
                : "No widgets enabled. Click Edit Dashboard to choose what to show here."}
            </div>
            {saveErr && (
              <div style={{ fontSize: 11, color: COLORS.WARNING, marginTop: 8 }}>
                ⚠ {saveErr}
              </div>
            )}
          </div>

          {/* Edit Dashboard button */}
          <button
            onClick={() => setEditOpen(true)}
            title="Edit your dashboard widgets"
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.SM, padding: "8px 18px",
              cursor: "pointer",
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 600, fontSize: 11,
              color: COLORS.TEXT_SECONDARY, letterSpacing: "0.03em",
              transition: "all .18s",
              flexShrink: 0,
              display: "flex", alignItems: "center", gap: 6,
            }}>
            ✦ Edit Dashboard
          </button>
        </div>
      </div>

      {/* ── Widget Grid ── */}
      {enabledWidgets.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "64px 32px",
          border: `1.5px dashed ${COLORS.BORDER}`, borderRadius: RADIUS.LG,
          animation: "ucar-fadein .6s ease both",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧩</div>
          <div style={{ fontSize: 14, color: COLORS.TEXT_SECONDARY, fontWeight: 600, marginBottom: 8 }}>
            No widgets enabled
          </div>
          <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 24 }}>
            Click <span style={{ color: COLORS.AQUA }}>Edit Dashboard</span> to add widgets to your home page.
          </div>
          <button onClick={() => setEditOpen(true)} style={{
            background: COLORS.AQUA,
            border: "none", borderRadius: RADIUS.MD,
            padding: "10px 24px", cursor: "pointer",
            fontFamily: "'Poppins',sans-serif",
            fontWeight: 700, fontSize: 12, color: COLORS.TEXT_ON_ACCENT,
            boxShadow: `0 4px 16px ${COLORS.AQUA}33`,
          }}>
            ✦ Edit Dashboard
          </button>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          animation: "ucar-fadein .6s ease both",
        }}>
          {enabledWidgets.map(w => {
            const meta      = widgetById(w.widgetId);
            const Component = WIDGET_COMPONENTS[w.widgetId];
            if (!Component || !meta) return null;
            return (
              <div
                key={w.widgetId}
                style={{ gridColumn: `span ${meta.colSpan ?? 1}` }}
              >
                <Component config={w.config ?? {}} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: COLORS.TEXT_DISABLED,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
        marginTop: 40 }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
