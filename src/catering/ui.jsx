/**
 * Catering Companion — shared UI primitives.
 *
 * Small inline-styled building blocks matching the Cafe Connection house style
 * (theme.js tokens, Poppins, flat 4px radii). Kept local to the catering module
 * so the staff shell's components are not disturbed.
 */
import { COLORS, FONT, RADIUS, SHADOWS } from "../theme.js";
import { REQUEST_STATUS, LIFECYCLE_STATUS } from "./schema.js";

export function Card({ children, style }) {
  return (
    <div style={{
      background: COLORS.BG_SURFACE,
      border: `1px solid ${COLORS.BORDER}`,
      borderRadius: RADIUS.LG,
      boxShadow: SHADOWS.SM,
      padding: 24,
      ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * A labelled form field.
 *
 * `group` must be set when the children contain more than one labelled control
 * (a checkbox or radio group). Wrapping those in a <label> nests labels, which
 * is invalid HTML and makes the browser associate the outer label's text with
 * the first inner input — so assistive tech, and anything else resolving
 * controls by their label, picks the wrong one.
 */
export function Field({ label, error, required, hint, group = false, children }) {
  const Wrapper = group ? "fieldset" : "label";
  const Caption = group ? "legend" : "span";

  return (
    <Wrapper style={{
      display: "block", marginBottom: 16,
      ...(group ? { border: "none", padding: 0, margin: "0 0 16px" } : {}),
    }}>
      <Caption style={{
        display: "block", fontSize: 11, fontWeight: FONT.WEIGHT_BOLD,
        color: COLORS.TEXT_SECONDARY, letterSpacing: "0.04em",
        textTransform: "uppercase", marginBottom: 6,
        ...(group ? { padding: 0 } : {}),
      }}>
        {label}{required && <span style={{ color: COLORS.ERROR }}> *</span>}
      </Caption>
      {children}
      {hint && !error && (
        <span style={{ display: "block", fontSize: 11, color: COLORS.TEXT_MUTED, marginTop: 4 }}>
          {hint}
        </span>
      )}
      {error && (
        <span role="alert" style={{ display: "block", fontSize: 11, color: COLORS.ERROR, marginTop: 4 }}>
          {error}
        </span>
      )}
    </Wrapper>
  );
}

const controlStyle = (invalid) => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: RADIUS.MD,
  border: `1px solid ${invalid ? COLORS.ERROR : COLORS.BORDER}`,
  background: COLORS.BG_SURFACE_ALT,
  color: COLORS.TEXT_PRIMARY,
  fontFamily: FONT.FAMILY,
  fontSize: 13,
  fontWeight: 500,
  outline: "none",
  boxSizing: "border-box",
});

export function Input({ invalid, ...props }) {
  return <input {...props} style={{ ...controlStyle(invalid), ...props.style }} />;
}

export function Textarea({ invalid, rows = 3, ...props }) {
  return <textarea rows={rows} {...props}
    style={{ ...controlStyle(invalid), resize: "vertical", ...props.style }} />;
}

export function Select({ invalid, children, ...props }) {
  return (
    <select {...props} style={{ ...controlStyle(invalid), ...props.style }}>
      {children}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, ...props }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 13, color: COLORS.TEXT_PRIMARY, cursor: "pointer", marginBottom: 12,
    }}>
      <input type="checkbox" checked={Boolean(checked)} onChange={onChange} {...props}
        style={{ width: 15, height: 15, accentColor: COLORS.AQUA, cursor: "pointer" }} />
      {label}
    </label>
  );
}

export function Button({ variant = "primary", children, ...props }) {
  const variants = {
    primary: { background: COLORS.AQUA, color: COLORS.TEXT_ON_ACCENT, border: "none" },
    ghost:   { background: "transparent", color: COLORS.TEXT_SECONDARY, border: `1px solid ${COLORS.BORDER}` },
    danger:  { background: "transparent", color: COLORS.ERROR, border: `1px solid ${COLORS.ERROR}55` },
  };
  return (
    <button {...props} style={{
      padding: "10px 20px",
      borderRadius: RADIUS.MD,
      fontFamily: FONT.FAMILY,
      fontWeight: FONT.WEIGHT_BOLD,
      fontSize: 12,
      letterSpacing: "0.03em",
      cursor: props.disabled ? "not-allowed" : "pointer",
      opacity: props.disabled ? 0.5 : 1,
      ...variants[variant],
      ...props.style,
    }}>
      {children}
    </button>
  );
}

const STATUS_STYLES = {
  [REQUEST_STATUS.DRAFT]:     { bg: COLORS.BG_SURFACE_ALT, fg: COLORS.TEXT_MUTED,  label: "Draft" },
  [REQUEST_STATUS.SUBMITTED]: { bg: `${COLORS.ORANGE}22`,  fg: COLORS.WARNING,     label: "Submitted" },
  [REQUEST_STATUS.CONFIRMED]: { bg: `${COLORS.AQUA}1A`,    fg: COLORS.AQUA_DARK,   label: "Confirmed" },
  [REQUEST_STATUS.CANCELLED]: { bg: `${COLORS.ERROR}15`,   fg: COLORS.ERROR,       label: "Cancelled" },
};

export function StatusBadge({ requestStatus, lifecycleStatus }) {
  const s = STATUS_STYLES[requestStatus] ?? STATUS_STYLES[REQUEST_STATUS.SUBMITTED];
  const closed = lifecycleStatus === LIFECYCLE_STATUS.CLOSED;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span style={{
        background: s.bg, color: s.fg,
        padding: "3px 10px", borderRadius: RADIUS.PILL,
        fontSize: 10, fontWeight: FONT.WEIGHT_BOLD,
        textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        {s.label}
      </span>
      {closed && (
        <span style={{
          background: COLORS.BG_SURFACE_ALT, color: COLORS.TEXT_MUTED,
          padding: "3px 10px", borderRadius: RADIUS.PILL,
          fontSize: 10, fontWeight: FONT.WEIGHT_BOLD,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          Closed
        </span>
      )}
    </span>
  );
}

export function SectionTitle({ children, style }) {
  return (
    <h2 style={{
      fontSize: FONT.SIZE_MD, fontWeight: FONT.WEIGHT_BOLD,
      color: COLORS.TEXT_PRIMARY, marginBottom: 16, ...style,
    }}>
      {children}
    </h2>
  );
}

export function Banner({ tone = "info", title, children }) {
  const tones = {
    info:    COLORS.AQUA,
    warning: COLORS.WARNING,
    error:   COLORS.ERROR,
    success: COLORS.SUCCESS,
  };
  const color = tones[tone] ?? tones.info;
  return (
    <div role={tone === "error" ? "alert" : undefined} style={{
      background: `${color}12`, border: `1px solid ${color}44`,
      borderRadius: RADIUS.MD, padding: "12px 16px", marginBottom: 20,
    }}>
      {title && (
        <div style={{ fontSize: 12, fontWeight: FONT.WEIGHT_BOLD, color, marginBottom: 4 }}>
          {title}
        </div>
      )}
      <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: COLORS.TEXT_MUTED }}>
      <div style={{ fontSize: FONT.SIZE_MD, fontWeight: FONT.WEIGHT_BOLD, color: COLORS.TEXT_SECONDARY, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}
