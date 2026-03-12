/**
 * Cafe Connection — Centralized Theme
 * UCAR Brand Standards (December 2025)
 *
 * Light mode variant: UCAR Light Gray background (#F1F0EE)
 * All colors derived from official UCAR palette.
 *
 * HOW TO USE:
 *   import { COLORS, SHADOWS, RADIUS } from '../theme';
 *   style={{ background: COLORS.BG_PAGE, color: COLORS.TEXT_PRIMARY }}
 *
 * MIGRATION:
 *   Replace the local brand constant blocks in every component
 *   (Widget.jsx, App.jsx, Dashboard.jsx, WeeklyOps.jsx, pages/*, etc.)
 *   with an import from this file.
 */
// ─── Page & Surface ────────────────────────────────────────────────────────────
export const COLORS = {
  // Page background — UCAR Light Gray
  BG_PAGE:          '#F1F0EE',
  // Card / widget / panel surface
  BG_SURFACE:       '#FFFFFF',
  // Slightly tinted surface for nested panels, table rows, input backgrounds
  BG_SURFACE_ALT:   '#F8F7F5',
  // Hover state for interactive surfaces
  BG_SURFACE_HOVER: '#EEEDEB',
  // ─── Borders ───────────────────────────────────────────────────────────────
  BORDER:           '#DDD9D4',   // default dividers and card outlines
  BORDER_STRONG:    '#B8B3AC',   // stronger separation, e.g. table header
  // ─── Text ──────────────────────────────────────────────────────────────────
  TEXT_PRIMARY:     '#011837',   // UCAR Space — headlines, values, labels
  TEXT_SECONDARY:   '#2C4A63',   // subheadings, secondary labels
  TEXT_MUTED:       '#5A7A91',   // helper text, timestamps, captions
  TEXT_DISABLED:    '#9BAEBB',   // placeholder, disabled state
  TEXT_ON_ACCENT:   '#FFFFFF',   // text on aqua or dark filled buttons
  // ─── UCAR Accent — Aqua ────────────────────────────────────────────────────
  AQUA:             '#00A2B4',   // primary brand accent — buttons, active tabs, icons
  AQUA_DARK:        '#00818F',   // hover state for aqua elements; campus 3 color
  AQUA_LIGHT:       '#E0F7FA',   // aqua tint for badge backgrounds, highlight fills
  AQUA_BORDER:      '#80D4DC',   // aqua-tinted border for focused inputs or selected cards
  // ─── Secondary Accent ──────────────────────────────────────────────────────
  LAQUA:            '#34E1F4',   // light aqua — use sparingly; works on dark chips only
  ORANGE:           '#FAA119',   // warning badges, alerts
  // ─── Navigation / Tab Bar ──────────────────────────────────────────────────
  NAV_BG:           '#FFFFFF',   // tab bar background
  NAV_BORDER:       '#DDD9D4',   // bottom border of nav bar
  NAV_TEXT:         '#5A7A91',   // inactive tab label
  NAV_TEXT_ACTIVE:  '#00A2B4',   // active tab label
  NAV_INDICATOR:    '#00A2B4',   // active tab underline indicator
  // ─── Chart colors ──────────────────────────────────────────────────────────
  CHART_1:          '#00A2B4',   // Mesa Lab
  CHART_2:          '#34E1F4',   // Foothills — lighten stroke, use on white bg
  CHART_3:          '#00818F',   // Center Green
  CHART_GRID:       '#E4E1DC',   // recharts CartesianGrid stroke
  CHART_AXIS:       '#5A7A91',   // recharts axis tick text
  // ─── Status ────────────────────────────────────────────────────────────────
  SUCCESS:          '#1A8A5A',
  WARNING:          '#C97B00',   // accessible amber on white
  ERROR:            '#C0392B',
  INFO:             '#00A2B4',
  // ─── Splash screen (stays dark — branded entry moment) ─────────────────────
  SPLASH_BG:        '#011837',
  SPLASH_TEXT:      '#FFFFFF',
  // ─── Legacy dark constants (kept for reference during migration) ────────────
  // Remove these once all components import from this file.
  _SPACE:           '#011837',
  _DARKBLUE:        '#00357A',
  _PANEL:           '#001f4d',
};
// ─── Elevation / Shadows ───────────────────────────────────────────────────────
export const SHADOWS = {
  SM:  '0 1px 3px rgba(1,24,55,0.08)',
  MD:  '0 2px 8px rgba(1,24,55,0.10)',
  LG:  '0 4px 16px rgba(1,24,55,0.12)',
  XL:  '0 8px 32px rgba(1,24,55,0.14)',
};
// ─── Border Radius ─────────────────────────────────────────────────────────────
export const RADIUS = {
  SM:  '6px',
  MD:  '10px',
  LG:  '14px',
  XL:  '20px',
  PILL:'9999px',
};
// ─── Typography ────────────────────────────────────────────────────────────────
export const FONT = {
  FAMILY:       "'Poppins', Helvetica, sans-serif",
  SIZE_XS:      '13px',
  SIZE_SM:      '15px',
  SIZE_BASE:    '17px',
  SIZE_MD:      '19px',
  SIZE_LG:      '23px',
  SIZE_XL:      '28px',
  SIZE_2XL:     '36px',
  WEIGHT_REG:   400,
  WEIGHT_MED:   500,
  WEIGHT_BOLD:  700,
};
