/**
 * FirstRunWizard — Phase 8 dashboard personalization setup wizard.
 *
 * A 3-step modal shown on first login after Phase 8 deployment:
 *   Step 0 — Display name entry (first run only)
 *   Step 1 — Widget picker (toggle which widgets to display)
 *   Step 2 — All set (confirmation before saving; first run only)
 *
 * Also used as the "Edit Dashboard" picker (startAtStep=1) by passing
 * the current prefs as initialPrefs. In edit mode only the widget picker
 * is shown; the name step is skipped entirely.
 *
 * Props:
 *   initialPrefs   {object|null}  — current prefs (null = brand new user)
 *   onSave         {(prefs) => Promise<void>}  — called with final prefs on save
 *   onClose        {() => void}   — called when user cancels (edit mode only)
 *   allowClose     {boolean}      — whether an × close button is shown
 *   startAtStep    {number}       — 0 (default) or 1 to skip name step
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { WIDGET_REGISTRY, defaultPrefs } from "../../registries/widgetRegistry.js";
import { COLORS, SHADOWS, RADIUS } from "../../theme.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useRole } from "../../hooks/useRole.js";
import { canSeeWidget, DASHBOARD_WIDGET_KEY } from "../../utils/permissions.js";

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildDefaultWidgets() {
  return defaultPrefs().widgets;
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDots({ total, current }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6,
          height: 6, borderRadius: 3,
          background: i === current ? COLORS.AQUA : COLORS.BORDER,
          transition: "all .25s ease",
        }} />
      ))}
    </div>
  );
}

// ── Step 0: Display name ───────────────────────────────────────────────────────
function StepName({ name, setName, onNext }) {
  const trimmed = name.trim();
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 8 }}>
        What's your name?
      </div>
      <div style={{ fontSize: 13, color: COLORS.TEXT_SECONDARY, lineHeight: 1.65, marginBottom: 28, maxWidth: 440 }}>
        This is how you'll appear in Cafe Connection.
      </div>

      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Your name"
        autoFocus
        onKeyDown={e => { if (e.key === "Enter" && trimmed) onNext(); }}
        style={{
          width: "100%", boxSizing: "border-box",
          background: COLORS.BG_SURFACE_ALT,
          border: `1px solid ${COLORS.BORDER}`,
          borderRadius: RADIUS.MD, color: COLORS.TEXT_PRIMARY,
          fontFamily: "'Poppins',sans-serif",
          fontWeight: 600, fontSize: 14,
          padding: "11px 14px", outline: "none",
          marginBottom: 28,
        }}
      />

      <button onClick={onNext} disabled={!trimmed} style={{
        background: trimmed ? COLORS.AQUA : COLORS.BORDER,
        border: "none", borderRadius: RADIUS.MD,
        padding: "11px 28px", cursor: trimmed ? "pointer" : "not-allowed",
        fontFamily: "'Poppins',sans-serif",
        fontWeight: 700, fontSize: 13, color: COLORS.TEXT_ON_ACCENT,
        boxShadow: trimmed ? `0 4px 16px ${COLORS.AQUA}33` : "none",
        transition: "all .18s",
        opacity: trimmed ? 1 : 0.5,
      }}>
        Next →
      </button>
    </div>
  );
}

// ── Step 1: Widget picker ──────────────────────────────────────────────────────
function StepWidgets({ widgets, setWidgets, onBack, onNext, isEdit, availableWidgets }) {
   function toggle(widgetId) {
    setWidgets(prev => {
      const exists = prev.some(w => w.widgetId === widgetId);
      if (!exists) {
        return [...prev, { widgetId, enabled: true, position: prev.length, config: {} }];
      }
      return prev.map(w =>
        w.widgetId === widgetId ? { ...w, enabled: !w.enabled } : w
      );
    });
  }


  const enabledCount = widgets.filter(w => w.enabled).length;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 6 }}>
        {isEdit ? "Edit Your Dashboard" : "Choose Your Widgets"}
      </div>
      <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, marginBottom: 24, lineHeight: 1.6 }}>
        {isEdit
          ? "Toggle widgets on or off. Changes are saved immediately."
          : "Pick the widgets to show on your dashboard. You can always change these later."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
        {availableWidgets.map(meta => {
          const w       = widgets.find(x => x.widgetId === meta.widgetId);
          const enabled = w?.enabled ?? false;
          return (
            <button
              key={meta.widgetId}
              onClick={() => toggle(meta.widgetId)}
              style={{
                background: enabled ? COLORS.AQUA_LIGHT : "transparent",
                border: `1.5px solid ${enabled ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
                borderRadius: RADIUS.MD, padding: "12px 14px",
                cursor: "pointer", textAlign: "left",
                transition: "all .18s",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: enabled ? `${COLORS.AQUA}18` : COLORS.BG_SURFACE_HOVER,
                border: `1px solid ${enabled ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15,
              }}>{meta.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700,
                  color: enabled ? COLORS.TEXT_PRIMARY : COLORS.TEXT_SECONDARY,
                  fontFamily: "'Poppins',sans-serif",
                  display: "flex", alignItems: "center", gap: 6 }}>
                  {meta.label}
                  {enabled && (
                    <span style={{ fontSize: 9, background: COLORS.AQUA_LIGHT,
                      color: COLORS.AQUA, border: `1px solid ${COLORS.AQUA_BORDER}`,
                      borderRadius: 20, padding: "1px 7px",
                      fontWeight: 700, letterSpacing: "0.06em",
                      textTransform: "uppercase" }}>On</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, marginTop: 3, lineHeight: 1.5 }}>
                  {meta.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {!isEdit && (
          <button onClick={onBack} style={{
            background: "transparent", border: `1px solid ${COLORS.BORDER}`,
            borderRadius: RADIUS.MD, padding: "10px 22px", cursor: "pointer",
            fontFamily: "'Poppins',sans-serif", fontWeight: 600,
            fontSize: 12, color: COLORS.TEXT_SECONDARY, transition: "all .18s",
          }}>
            ← Back
          </button>
        )}
        <button onClick={onNext} disabled={enabledCount === 0} style={{
          background: enabledCount > 0 ? COLORS.AQUA : COLORS.BORDER,
          border: "none", borderRadius: RADIUS.MD,
          padding: "11px 28px", cursor: enabledCount > 0 ? "pointer" : "not-allowed",
          fontFamily: "'Poppins',sans-serif",
          fontWeight: 700, fontSize: 13, color: COLORS.TEXT_ON_ACCENT,
          boxShadow: enabledCount > 0 ? `0 4px 16px ${COLORS.AQUA}33` : "none",
          transition: "all .18s",
          opacity: enabledCount > 0 ? 1 : 0.5,
        }}>
          {isEdit ? "Save Changes" : `Finish (${enabledCount} widget${enabledCount !== 1 ? "s" : ""})`}
        </button>
        {enabledCount === 0 && (
          <span style={{ fontSize: 11, color: COLORS.TEXT_MUTED }}>Select at least one widget</span>
        )}
      </div>
    </div>
  );
}

// ── Step 2: All set ────────────────────────────────────────────────────────────
function StepDone({ enabledCount, saving, saveErr, onDone }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 16 }}>
      <div style={{
        width: 60, height: 60, borderRadius: "50%",
        background: COLORS.AQUA,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px",
        boxShadow: `0 0 24px ${COLORS.AQUA}33`,
        fontSize: 26, color: COLORS.TEXT_ON_ACCENT,
      }}>✓</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 8 }}>
        Dashboard Ready!
      </div>
      <div style={{ fontSize: 13, color: COLORS.TEXT_SECONDARY, lineHeight: 1.65, marginBottom: 28, maxWidth: 380, margin: "0 auto 28px" }}>
        {enabledCount} widget{enabledCount !== 1 ? "s" : ""} enabled on your dashboard.
        You can edit this anytime using the <span style={{ color: COLORS.AQUA }}>Edit Dashboard</span> button.
      </div>
      {saveErr && (
        <div style={{ fontSize: 11, color: COLORS.WARNING, marginBottom: 12 }}>
          ⚠ Save failed: {saveErr} — please try again.
        </div>
      )}
      <button onClick={onDone} disabled={saving} style={{
        background: saving ? COLORS.BORDER : COLORS.AQUA,
        border: "none", borderRadius: RADIUS.MD,
        padding: "11px 32px", cursor: saving ? "not-allowed" : "pointer",
        fontFamily: "'Poppins',sans-serif",
        fontWeight: 700, fontSize: 13, color: COLORS.TEXT_ON_ACCENT,
        boxShadow: saving ? "none" : `0 4px 16px ${COLORS.AQUA}33`,
        opacity: saving ? 0.6 : 1,
        transition: "all .18s",
      }}>
        {saving ? "Saving…" : "Go to Dashboard"}
      </button>
    </div>
  );
}

// ── Main Wizard ─────────────────────────────────────────────────────────────────
export default function FirstRunWizard({
  initialPrefs = null,
  onSave,
  onClose,
  allowClose = false,
  startAtStep = 0,
}) {
  const { user } = useAuth();
  const { role } = useRole();
  const isEdit = startAtStep > 0;

  const availableWidgets = WIDGET_REGISTRY.filter(meta => {
    const key = DASHBOARD_WIDGET_KEY[meta.widgetId];
    return key ? canSeeWidget(role, key) : false;
  });

  const [step,        setStep]        = useState(startAtStep);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [widgets,     setWidgets]     = useState(() =>
    initialPrefs?.widgets ?? buildDefaultWidgets()
  );
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  function handleBack() {
    setStep(s => s - 1);
  }

  function handleWidgetsDone() {
    if (isEdit) {
      handleSave();
    } else {
      setStep(2);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    try {
      const finalPrefs = {
        ...(initialPrefs ?? {}),
        widgets,
        displayName,
        setupDone: true,
        updated_at: null, // firebase.js will set serverTimestamp()
      };
      await onSave(finalPrefs);
      if (!isEdit) return; // DashboardPage will unmount wizard on setupDone=true
      onClose?.();
    } catch (err) {
      setSaveErr(err?.message || "Save failed");
      setSaving(false);
    }
  }

  const TOTAL_STEPS   = isEdit ? 1 : 3;
  const enabledCount  = widgets.filter(w => w.enabled).length;

  return createPortal(
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(1,24,55,0.5)",
      zIndex: 300,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 580,
        background: COLORS.BG_SURFACE,
        borderRadius: RADIUS.XL,
        border: `1px solid ${COLORS.BORDER}`,
        boxShadow: SHADOWS.XL,
        padding: "36px 40px 40px",
        position: "relative",
        animation: "ucar-fadein .3s ease both",
      }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${COLORS.AQUA}, ${COLORS.LAQUA}, transparent)`,
          borderRadius: `${RADIUS.XL} ${RADIUS.XL} 0 0` }} />

        {/* Close button (only when allowClose is true) */}
        {allowClose && (
          <button onClick={onClose} style={{
            position: "absolute", top: 16, right: 16,
            background: "transparent", border: `1px solid ${COLORS.BORDER}`,
            borderRadius: 6, padding: "4px 9px",
            cursor: "pointer", color: COLORS.TEXT_MUTED, fontSize: 16, lineHeight: 1,
          }}>✕</button>
        )}

        {/* Step dots */}
        {!isEdit && (
          <div style={{ marginBottom: 28 }}>
            <StepDots total={TOTAL_STEPS} current={step} />
          </div>
        )}

        {/* Step content */}
        {step === 0 && !isEdit && (
          <StepName
            name={displayName}
            setName={setDisplayName}
            onNext={() => setStep(1)}
          />
        )}
        {(step === 1 || (isEdit && step === 1)) && (
          <StepWidgets
            widgets={widgets}
            setWidgets={setWidgets}
            onBack={handleBack}
            onNext={handleWidgetsDone}
            isEdit={isEdit}
            availableWidgets={availableWidgets}
          />
        )}
        {step === 2 && !isEdit && (
          <StepDone
            enabledCount={enabledCount}
            saving={saving}
            saveErr={saveErr}
            onDone={handleSave}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
