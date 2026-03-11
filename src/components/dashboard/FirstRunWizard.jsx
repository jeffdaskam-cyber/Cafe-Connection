/**
 * FirstRunWizard — Phase 8 dashboard personalization setup wizard.
 *
 * A 3-step modal shown on first login after Phase 8 deployment:
 *   Step 1 — Welcome + primary campus selection
 *   Step 2 — Widget picker (toggle which widgets to display)
 *   Step 3 — All set (confirmation before saving)
 *
 * Also used as the "Edit Dashboard" picker (startAtStep=1) by passing
 * the current prefs as initialPrefs.
 *
 * Props:
 *   initialPrefs   {object|null}  — current prefs (null = brand new user)
 *   onSave         {(prefs) => Promise<void>}  — called with final prefs on save
 *   onClose        {() => void}   — called when user cancels (Step 1 only; disabled if !setupDone)
 *   allowClose     {boolean}      — whether an × close button is shown
 *   startAtStep    {number}       — 0 (default) or 1 to skip welcome
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { WIDGET_REGISTRY, defaultPrefs } from "../../registries/widgetRegistry.js";
import { CAMPUSES } from "../../schemas/firestore.js";

// ── Brand palette ──────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const PANEL    = "#001f4d";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const TMID     = "#b0d0e8";
const AQUA     = "#00A2B4";
const LAQUA    = "#34E1F4";

const CAMPUS_COLOR = {
  "Mesa Lab":     AQUA,
  "Foothills":    LAQUA,
  "Center Green": "#00818F",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildDefaultWidgets(campus) {
  return defaultPrefs(campus).widgets;
}

// Deep-clone widgets and apply campus override to campus-aware entries
function applyCampus(widgets, campus) {
  return widgets.map(w => {
    const meta = WIDGET_REGISTRY.find(r => r.widgetId === w.widgetId);
    if (!meta?.needsCampus) return w;
    return { ...w, config: { ...(w.config ?? {}), campus } };
  });
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDots({ total, current }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6,
          height: 6, borderRadius: 3,
          background: i === current ? AQUA : BORDER,
          transition: "all .25s ease",
        }} />
      ))}
    </div>
  );
}

// ── Step 0: Welcome + campus ───────────────────────────────────────────────────
function StepWelcome({ campus, setCampus, onNext }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: TPRI, marginBottom: 8 }}>
        Welcome to your Dashboard
      </div>
      <div style={{ fontSize: 13, color: TSEC, lineHeight: 1.65, marginBottom: 28, maxWidth: 440 }}>
        Let's personalize your home page. Pick your primary campus and choose
        the widgets you'd like to see every day.
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: TSEC, letterSpacing: "1.2px",
        textTransform: "uppercase", marginBottom: 12 }}>
        Primary Campus
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
        {CAMPUSES.map(c => {
          const active = campus === c;
          const color  = CAMPUS_COLOR[c] ?? AQUA;
          return (
            <button key={c} onClick={() => setCampus(c)} style={{
              padding: "10px 20px", borderRadius: 10,
              border: `1.5px solid ${active ? color : BORDER}`,
              background: active ? `${color}18` : "transparent",
              color: active ? color : TSEC,
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 600, fontSize: 12, cursor: "pointer",
              transition: "all .18s",
              boxShadow: active ? `0 0 12px ${color}22` : "none",
            }}>
              {c}
            </button>
          );
        })}
      </div>

      <button onClick={onNext} style={{
        background: `linear-gradient(135deg, ${AQUA}, #007a8a)`,
        border: "none", borderRadius: 10,
        padding: "11px 28px", cursor: "pointer",
        fontFamily: "'Poppins',sans-serif",
        fontWeight: 700, fontSize: 13, color: TPRI,
        boxShadow: `0 4px 16px ${AQUA}44`,
        transition: "all .18s",
      }}>
        Next →
      </button>
    </div>
  );
}

// ── Step 1: Widget picker ──────────────────────────────────────────────────────
function StepWidgets({ widgets, setWidgets, campus, onBack, onNext, isEdit }) {
  function toggle(widgetId) {
    setWidgets(prev => prev.map(w =>
      w.widgetId === widgetId ? { ...w, enabled: !w.enabled } : w
    ));
  }

  const enabledCount = widgets.filter(w => w.enabled).length;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: TPRI, marginBottom: 6 }}>
        {isEdit ? "Edit Your Dashboard" : "Choose Your Widgets"}
      </div>
      <div style={{ fontSize: 12, color: TSEC, marginBottom: 24, lineHeight: 1.6 }}>
        {isEdit
          ? "Toggle widgets on or off. Changes are saved immediately."
          : "Pick the widgets to show on your dashboard. You can always change these later."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
        {WIDGET_REGISTRY.map(meta => {
          const w       = widgets.find(x => x.widgetId === meta.widgetId);
          const enabled = w?.enabled ?? false;
          return (
            <button
              key={meta.widgetId}
              onClick={() => toggle(meta.widgetId)}
              style={{
                background: enabled ? `${AQUA}12` : "transparent",
                border: `1.5px solid ${enabled ? AQUA + "66" : BORDER}`,
                borderRadius: 10, padding: "12px 14px",
                cursor: "pointer", textAlign: "left",
                transition: "all .18s",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: enabled ? `${AQUA}22` : `${BORDER}44`,
                border: `1px solid ${enabled ? AQUA + "44" : BORDER}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15,
              }}>{meta.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700,
                  color: enabled ? TPRI : TSEC,
                  fontFamily: "'Poppins',sans-serif",
                  display: "flex", alignItems: "center", gap: 6 }}>
                  {meta.label}
                  {enabled && (
                    <span style={{ fontSize: 9, background: `${AQUA}22`,
                      color: AQUA, border: `1px solid ${AQUA}44`,
                      borderRadius: 20, padding: "1px 7px",
                      fontWeight: 700, letterSpacing: "0.06em",
                      textTransform: "uppercase" }}>On</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: TSEC, marginTop: 3, lineHeight: 1.5 }}>
                  {meta.description}
                </div>
                {meta.needsCampus && (
                  <div style={{ fontSize: 9, color: `${TSEC}88`, marginTop: 4 }}>
                    Campus: {campus}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {!isEdit && (
          <button onClick={onBack} style={{
            background: "transparent", border: `1px solid ${BORDER}`,
            borderRadius: 10, padding: "10px 22px", cursor: "pointer",
            fontFamily: "'Poppins',sans-serif", fontWeight: 600,
            fontSize: 12, color: TSEC, transition: "all .18s",
          }}>
            ← Back
          </button>
        )}
        <button onClick={onNext} disabled={enabledCount === 0} style={{
          background: enabledCount > 0 ? `linear-gradient(135deg, ${AQUA}, #007a8a)` : BORDER,
          border: "none", borderRadius: 10,
          padding: "11px 28px", cursor: enabledCount > 0 ? "pointer" : "not-allowed",
          fontFamily: "'Poppins',sans-serif",
          fontWeight: 700, fontSize: 13, color: TPRI,
          boxShadow: enabledCount > 0 ? `0 4px 16px ${AQUA}44` : "none",
          transition: "all .18s",
          opacity: enabledCount > 0 ? 1 : 0.5,
        }}>
          {isEdit ? "Save Changes" : `Finish (${enabledCount} widget${enabledCount !== 1 ? "s" : ""})`}
        </button>
        {enabledCount === 0 && (
          <span style={{ fontSize: 11, color: TSEC }}>Select at least one widget</span>
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
        background: `linear-gradient(135deg, ${AQUA}, #007a8a)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px",
        boxShadow: `0 0 24px ${AQUA}44`,
        fontSize: 26,
      }}>✓</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: TPRI, marginBottom: 8 }}>
        Dashboard Ready!
      </div>
      <div style={{ fontSize: 13, color: TSEC, lineHeight: 1.65, marginBottom: 28, maxWidth: 380, margin: "0 auto 28px" }}>
        {enabledCount} widget{enabledCount !== 1 ? "s" : ""} enabled on your dashboard.
        You can edit this anytime using the <span style={{ color: AQUA }}>Edit Dashboard</span> button.
      </div>
      {saveErr && (
        <div style={{ fontSize: 11, color: "#FAA119", marginBottom: 12 }}>
          ⚠ Save failed: {saveErr} — please try again.
        </div>
      )}
      <button onClick={onDone} disabled={saving} style={{
        background: saving ? BORDER : `linear-gradient(135deg, ${AQUA}, #007a8a)`,
        border: "none", borderRadius: 10,
        padding: "11px 32px", cursor: saving ? "not-allowed" : "pointer",
        fontFamily: "'Poppins',sans-serif",
        fontWeight: 700, fontSize: 13, color: TPRI,
        boxShadow: saving ? "none" : `0 4px 16px ${AQUA}44`,
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
  const isEdit = startAtStep > 0;

  // Derive initial state from existing prefs
  const initialCampus = (() => {
    if (!initialPrefs?.widgets) return "Mesa Lab";
    const first = initialPrefs.widgets.find(w =>
      WIDGET_REGISTRY.find(r => r.widgetId === w.widgetId)?.needsCampus && w.config?.campus
    );
    return first?.config?.campus ?? "Mesa Lab";
  })();

  const [step,    setStep]    = useState(startAtStep);
  const [campus,  setCampus]  = useState(initialCampus);
  const [widgets, setWidgets] = useState(() =>
    initialPrefs?.widgets ?? buildDefaultWidgets(initialCampus)
  );
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  // When campus changes (Step 0), reapply campus to campus-aware widgets
  function handleCampusChange(c) {
    setCampus(c);
    setWidgets(prev => applyCampus(prev, c));
  }

  function handleBack() {
    setStep(s => Math.max(0, s - 1));
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

  const TOTAL_STEPS = isEdit ? 1 : 3;
  const enabledCount = widgets.filter(w => w.enabled).length;

  return createPortal(
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(1,14,33,0.92)",
      zIndex: 300,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 580,
        background: PANEL,
        borderRadius: 20,
        border: `1px solid ${BORDER}`,
        boxShadow: `0 40px 100px rgba(0,0,0,0.7), 0 0 80px ${AQUA}0a`,
        padding: "36px 40px 40px",
        position: "relative",
        animation: "ucar-fadein .3s ease both",
      }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${AQUA}, ${LAQUA}, transparent)`,
          borderRadius: "20px 20px 0 0" }} />

        {/* Close button (only when allowClose is true) */}
        {allowClose && (
          <button onClick={onClose} style={{
            position: "absolute", top: 16, right: 16,
            background: "transparent", border: `1px solid ${BORDER}`,
            borderRadius: 6, padding: "4px 9px",
            cursor: "pointer", color: TSEC, fontSize: 16, lineHeight: 1,
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
          <StepWelcome
            campus={campus}
            setCampus={handleCampusChange}
            onNext={() => setStep(1)}
          />
        )}
        {(step === 1 || (isEdit && step === 0)) && (
          <StepWidgets
            widgets={widgets}
            setWidgets={setWidgets}
            campus={campus}
            onBack={handleBack}
            onNext={handleWidgetsDone}
            isEdit={isEdit}
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
