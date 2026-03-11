/**
 * SplashScreen — Phase 9 intro animation for Cafe Connection.
 *
 * Animation sequence (total ≈ 3.4 s):
 *   0 ms       — Logo slides up and fades in (CSS, 400 ms)
 *   350 ms     — Cursor appears and blinks
 *   350–1250 ms — 3 blink cycles × 300 ms (CSS animation, stopped by phase switch)
 *   1250 ms    — Typing: "Cafe Connection" @ 68 ms / char ≈ 952 ms
 *   ~2200 ms   — Subtitle fades in, cursor stops
 *   2700 ms    — Fade-out begins (500 ms hold)
 *   3400 ms    — onDone() called, component unmounts
 *
 * Enable / disable:
 *   Flip SHOW_SPLASH at the top of this file (imported by App.jsx).
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// ── Config ────────────────────────────────────────────────────────────────────
export const SHOW_SPLASH = true;

// ── Timing (ms) ───────────────────────────────────────────────────────────────
const T_CURSOR_APPEAR = 350;   // delay before cursor shows after mount
const T_BLINK         = 900;   // 3 cycles × 300 ms
const T_CHAR          = 68;    // per-character typing interval
const T_HOLD          = 1000;   // pause after last char before fade
const T_FADE          = 700;   // CSS opacity transition duration

const FULL_TEXT = "Cafe Connection";

// ── Brand palette ─────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const AQUA     = "#00A2B4";
const LAQUA    = "#34E1F4";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";

// ── Splash component ──────────────────────────────────────────────────────────
/**
 * @param {() => void} onDone  — called when the fade-out is complete
 */
export default function SplashScreen({ onDone }) {
  // "logo" → "blink" → "type" → "hold" → "fade"
  const [phase,   setPhase]   = useState("logo");
  const [charIdx, setCharIdx] = useState(0);

  // logo → blink: wait for logo to settle, then show cursor
  useEffect(() => {
    const t = setTimeout(() => setPhase("blink"), T_CURSOR_APPEAR);
    return () => clearTimeout(t);
  }, []);

  // blink → type: stop blinking after exactly 3 cycles
  useEffect(() => {
    if (phase !== "blink") return;
    const t = setTimeout(() => setPhase("type"), T_BLINK);
    return () => clearTimeout(t);
  }, [phase]);

  // type: advance one character per interval
  useEffect(() => {
    if (phase !== "type") return;
    let idx = 0;
    const iv = setInterval(() => {
      idx++;
      setCharIdx(idx);
      if (idx >= FULL_TEXT.length) {
        clearInterval(iv);
        setPhase("hold");
      }
    }, T_CHAR);
    return () => clearInterval(iv);
  }, [phase]);

  // hold → fade
  useEffect(() => {
    if (phase !== "hold") return;
    const t = setTimeout(() => setPhase("fade"), T_HOLD);
    return () => clearTimeout(t);
  }, [phase]);

  // fade → done
  useEffect(() => {
    if (phase !== "fade") return;
    const t = setTimeout(() => onDone?.(), T_FADE);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  // ── Derived display state ─────────────────────────────────────────────────
  const displayText   = FULL_TEXT.slice(0, charIdx);
  const showCursor    = phase === "blink" || phase === "type" || phase === "hold";
  const cursorBlink   = phase === "blink";
  const showSubtitle  = phase === "hold"  || phase === "fade";
  const isFading      = phase === "fade";

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: `linear-gradient(160deg, ${SPACE} 0%, #001230 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Poppins', sans-serif",
        // Opacity CSS transition drives the fade-out
        opacity: isFading ? 0 : 1,
        transition: `opacity ${T_FADE}ms ease`,
        pointerEvents: isFading ? "none" : "all",
      }}>

      {/* ── Keyframes & cursor class ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800&display=swap');

        @keyframes cc-logo-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes cc-label-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes cc-blink {
          0%, 49% { opacity: 1; }
          50%, 99% { opacity: 0; }
        }
        .cc-blink { animation: cc-blink 300ms step-start infinite; }
      `}</style>

      <div style={{ textAlign: "center", userSelect: "none" }}>

        {/* ── Globe logo ── */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: `linear-gradient(135deg, ${AQUA}, ${DARKBLUE})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 18px",
          boxShadow: `0 0 40px ${AQUA}55`,
          animation: "cc-logo-in 420ms cubic-bezier(0.22,1,0.36,1) both",
        }}>
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="10" ry="10" stroke="white" strokeWidth="1.2" />
            <path d="M4 10 Q8 6 12 10 Q16 14 20 10" stroke="white" strokeWidth="1.4" fill="none" />
            <path d="M4 14 Q8 10 12 14 Q16 18 20 14" stroke="white" strokeWidth="1.4" fill="none" />
          </svg>
        </div>

        {/* ── UCAR label ── */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: TSEC,
          letterSpacing: "0.24em", textTransform: "uppercase",
          marginBottom: 22,
          animation: "cc-label-in 420ms cubic-bezier(0.22,1,0.36,1) 80ms both",
        }}>
          UCAR
        </div>

        {/* ── Typed headline + cursor ── */}
        <div style={{
          fontSize: 34, fontWeight: 800, color: TPRI,
          letterSpacing: "0.01em",
          height: 46,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ letterSpacing: "-0.01em" }}>{displayText}</span>

          {showCursor && (
            <span
              className={cursorBlink ? "cc-blink" : ""}
              style={{
                display: "inline-block",
                width: 3,
                height: "0.9em",
                background: AQUA,
                borderRadius: 2,
                marginLeft: 5,
                verticalAlign: "middle",
                flexShrink: 0,
                boxShadow: `0 0 10px ${AQUA}99`,
              }}
            />
          )}
        </div>

        {/* ── Subtitle — fades in when typing is done ── */}
        <div style={{
          fontSize: 10, fontWeight: 600, color: TSEC,
          letterSpacing: "0.14em", textTransform: "uppercase",
          marginTop: 14,
          opacity: showSubtitle ? 1 : 0,
          transition: "opacity 350ms ease",
        }}>
          Catering &amp; Cafe Information Hub
        </div>

      </div>
    </div>,
    document.body
  );
}
