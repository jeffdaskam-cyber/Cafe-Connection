/**
 * Widget — standard reusable panel container for Cafe Connection.
 *
 * Handles all four display states automatically:
 *   loading  → animated skeleton bars
 *   error    → message + retry button
 *   empty    → icon + message placeholder
 *   content  → renders children
 *
 * Optional expand-to-modal and print support built in.
 * All modules (Weekly Ops, Financials, Reports, Dashboard) build on this.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { COLORS, SHADOWS, RADIUS } from "../theme.js";

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

// ── Loading skeleton ───────────────────────────────────────────────────────────
function SkeletonBar({ width = "100%", height = 12, marginBottom = 10 }) {
  return (
    <div style={{
      width, height, marginBottom,
      borderRadius: 6,
      background: `linear-gradient(90deg, ${COLORS.BG_SURFACE_HOVER} 25%, ${COLORS.BG_SURFACE_ALT} 50%, ${COLORS.BG_SURFACE_HOVER} 75%)`,
      backgroundSize: "200% 100%",
      animation: "ucar-shimmer 1.6s ease-in-out infinite",
    }} />
  );
}

function WidgetSkeleton({ lines = 4 }) {
  // Varied bar widths look more natural than uniform lines
  const widths = ["72%", "90%", "55%", "80%", "65%", "88%"];
  return (
    <div style={{ padding: "4px 0 8px" }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} width={widths[i % widths.length]}
          height={i === 0 ? 14 : 11}
          marginBottom={i === 0 ? 14 : 9} />
      ))}
    </div>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────
function WidgetError({ message, onRetry }) {
  return (
    <div style={{
      padding: "24px 0", display: "flex",
      flexDirection: "column", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: `${COLORS.WARNING}18`, border: `1px solid ${COLORS.WARNING}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>⚠️</div>
      <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, fontFamily: "'Poppins',sans-serif",
        textAlign: "center", maxWidth: 280, lineHeight: 1.55 }}>
        {message || "Something went wrong."}
      </div>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: "transparent", border: `1px solid ${COLORS.BORDER}`,
          borderRadius: 8, padding: "7px 20px", cursor: "pointer",
          fontFamily: "'Poppins',sans-serif", fontWeight: 600,
          fontSize: 11, color: COLORS.TEXT_SECONDARY, transition: "all .2s",
        }}>
          ↻ Try Again
        </button>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function WidgetEmpty({ icon = "📭", message = "No data available" }) {
  return (
    <div style={{
      padding: "32px 0", display: "flex",
      flexDirection: "column", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: COLORS.AQUA_LIGHT, border: `1px solid ${COLORS.AQUA_BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>{icon}</div>
      <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, fontFamily: "'Poppins',sans-serif",
        textAlign: "center", maxWidth: 260, lineHeight: 1.55 }}>
        {message}
      </div>
    </div>
  );
}

// ── Action button (header icons) ───────────────────────────────────────────────
function ActionBtn({ icon, label, onClick, disabled = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? COLORS.AQUA_LIGHT : "transparent",
        border: `1px solid ${hovered ? COLORS.AQUA_BORDER : COLORS.BORDER}`,
        borderRadius: 6, padding: "4px 8px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'Poppins',sans-serif", fontSize: 13,
        color: disabled ? COLORS.TEXT_DISABLED : hovered ? COLORS.AQUA : COLORS.TEXT_MUTED,
        transition: "all .18s", lineHeight: 1,
        opacity: disabled ? 0.4 : 1,
        display: "flex", alignItems: "center", gap: 5,
      }}>
      <span>{icon}</span>
      {label && (
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.03em" }}>
          {label}
        </span>
      )}
    </button>
  );
}

// ── Expand modal (portal to document.body) ────────────────────────────────────
function ExpandModal({ title, subtitle, accentColor, children, onClose, printable }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePrint() {
    window.print();
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(1,24,55,0.5)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(6px)",
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 960,
          maxHeight: "90vh",
          background: COLORS.BG_SURFACE,
          borderRadius: RADIUS.LG,
          border: `1px solid ${COLORS.BORDER}`,
          boxShadow: `${SHADOWS.XL}, 0 0 60px ${accentColor}10`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88, transparent)`,
          borderRadius: `${RADIUS.LG} ${RADIUS.LG} 0 0`, zIndex: 1 }} />

        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${COLORS.BORDER}`,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
              fontFamily: "'Poppins',sans-serif" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 500,
                letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {printable && (
              <ActionBtn icon="🖨️" label="Print" onClick={handlePrint} />
            )}
            <button onClick={onClose}
              style={{
                background: "transparent", border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                color: COLORS.TEXT_MUTED, fontSize: 16, lineHeight: 1,
                transition: "all .18s",
              }}>✕</button>
          </div>
        </div>

        {/* Modal scrollable content */}
        <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Widget ─────────────────────────────────────────────────────────────────────
/**
 * Props:
 *   title        {string}   — widget header title (required)
 *   subtitle     {string}   — optional secondary label (shown below title)
 *   icon         {string}   — optional emoji shown in header
 *   accentColor  {string}   — top accent bar color (default: AQUA)
 *   loading      {boolean}  — show skeleton
 *   error        {string|null} — show error state with this message
 *   onRetry      {function} — called when user clicks "Try Again"
 *   empty        {boolean}  — show empty state
 *   emptyMessage {string}   — empty state text
 *   emptyIcon    {string}   — empty state icon emoji
 *   expandable   {boolean}  — show expand-to-modal button
 *   printable    {boolean}  — show print button (in header and expand modal)
 *   actions      {Array}    — extra action buttons: [{ icon, label, onClick, disabled }]
 *   noPad        {boolean}  — omit content area padding (for widgets with full-bleed tables)
 *   minHeight    {number}   — minimum content area height in px
 *   style        {object}   — override outer container styles
 *   children               — widget content (rendered in content state only)
 */
export default function Widget({
  title,
  subtitle,
  icon,
  accentColor = COLORS.AQUA,
  loading = false,
  error = null,
  onRetry,
  empty = false,
  emptyMessage = "No data available",
  emptyIcon = "📭",
  expandable = false,
  printable = false,
  actions = [],
  noPad = false,
  minHeight,
  style: outerStyle = {},
  children,
}) {
  const [expanded, setExpanded] = useState(false);

  const showSkeleton = loading;
  const showError    = !loading && !!error;
  const showEmpty    = !loading && !error && empty;
  const showContent  = !loading && !error && !empty;

  const contentStyle = {
    ...(noPad ? {} : { padding: "0 20px 20px" }),
    ...(minHeight ? { minHeight } : {}),
  };

  return (
    <>
      <div style={{
        background: COLORS.BG_SURFACE,
        borderRadius: RADIUS.LG,
        border: `1px solid ${COLORS.BORDER}`,
        boxShadow: SHADOWS.SM,
        position: "relative",
        overflow: "hidden",
        animation: "ucar-fadein .5s ease both",
        ...outerStyle,
      }}>
        {/* Top accent bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66, transparent)`,
          borderRadius: `${RADIUS.LG} ${RADIUS.LG} 0 0`,
        }} />

        {/* Background wave watermark */}
        <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.06, pointerEvents: "none" }}>
          <WaveGraphic color={accentColor} opacity={1} width={300} height={80} />
        </div>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 12px",
          position: "relative",
        }}>
          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {icon && (
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: `${accentColor}14`, border: `1px solid ${accentColor}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14,
              }}>{icon}</div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.TEXT_PRIMARY,
                fontFamily: "'Poppins',sans-serif",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{title}</div>
              {subtitle && (
                <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 500,
                  letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {(actions.length > 0 || printable || expandable) && (
            <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
              {actions.map((a, i) => <ActionBtn key={i} {...a} />)}
              {printable && (
                <ActionBtn icon="🖨️" label="Print" onClick={() => window.print()} />
              )}
              {expandable && (
                <ActionBtn icon="⤢" label="Expand" onClick={() => setExpanded(true)} />
              )}
            </div>
          )}
        </div>

        {/* Divider between header and content */}
        <div style={{ height: 1, background: COLORS.BORDER, margin: "0 20px" }} />

        {/* Content area */}
        <div style={contentStyle}>
          {showSkeleton && (
            <div style={{ padding: "16px 0 8px" }}>
              <WidgetSkeleton lines={4} />
            </div>
          )}
          {showError && (
            <WidgetError message={error} onRetry={onRetry} />
          )}
          {showEmpty && (
            <WidgetEmpty icon={emptyIcon} message={emptyMessage} />
          )}
          {showContent && (
            <div style={{ paddingTop: noPad ? 0 : 14 }}>
              {children}
            </div>
          )}
        </div>
      </div>

      {/* Expand modal */}
      {expanded && (
        <ExpandModal
          title={title}
          subtitle={subtitle}
          accentColor={accentColor}
          onClose={() => setExpanded(false)}
          printable={printable}
        >
          {children}
        </ExpandModal>
      )}
    </>
  );
}
