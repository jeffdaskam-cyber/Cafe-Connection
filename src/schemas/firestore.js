/**
 * Cafe Connection — Firestore Schema Reference
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is the single source of truth for all Firestore collection shapes.
 * No new collection may be written to without a schema defined here first.
 *
 * Conventions:
 *   - All operational records include: campus, created_by, created_at, updated_at
 *   - Date context uses the week's Monday (ISO date string) for weekly records
 *   - Status fields use lowercase strings defined in STATUS constants below
 *   - Timestamps use Firebase serverTimestamp() on writes, Timestamp type in reads
 *   - Document IDs are documented per collection
 *
 * Phase 3 implementation per the Cafe Connection AI Coding Agent Handoff Roadmap.
 */

// ── Campus constants ──────────────────────────────────────────────────────────
export const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

// ── Existing Collections ──────────────────────────────────────────────────────

/**
 * daily_metrics
 * Primary sales data store. Populated by /api/parse-report serverless function.
 *
 * Document ID formats:
 *   Daily:  "{YYYY-MM-DD}_{CampusName}"     e.g. "2026-03-10_Mesa Lab"
 *   Period: "period_{start}_{end}_{Campus}" e.g. "period_2026-02-01_2026-02-28_Foothills"
 */
export const DAILY_METRICS_SCHEMA = {
  // Identity
  campus:       "String — one of CAMPUSES",
  date:         "Timestamp — business date of the report",
  report_type:  "String? — 'daily' | 'period' (absent on oldest daily docs)",

  // Core metrics (all report types)
  net_revenue:       "Number — net cafe revenue for the period",
  total_checks:      "Number — net check count (STATISTICS › Total › Net Checks)",
  lunch_avg_check:   "Number — average lunch check value",
  last_updated:      "Timestamp — server time of most recent write",

  // Extended metrics (Excel and period reports)
  gross_revenue:          "Number? — before discounts",
  discounts:              "Number? — total discount amount",
  breakfast_net_revenue:  "Number?",
  lunch_net_revenue:      "Number?",
  breakfast_checks:       "Number?",
  lunch_checks:           "Number?",
  breakfast_avg_check:    "Number?",
  total_taxes:            "Number? — from TAXES section (Excel only)",
  cash_drop:              "Number? — from CASH POSITION section (Excel only)",

  // Period metadata
  period_start:  "String? — ISO date 'YYYY-MM-DD' (period docs only)",
  period_end:    "String? — ISO date 'YYYY-MM-DD' (period docs only)",

  // Traceability
  source_file:    "String? — original filename",
  parse_method:   "String? — 'pdf' | 'excel'",
};

/**
 * event_orders
 * PDF event order files uploaded via Weekly Ops › Event Orders panel.
 *
 * Document ID: auto-generated Firestore ID
 */
export const EVENT_ORDERS_SCHEMA = {
  fileName:    "String — original filename",
  downloadURL: "String — Firebase Storage download URL",
  uploadedAt:  "Timestamp — server timestamp",
  size:        "Number — file size in bytes",
};

/**
 * users
 * Basic user profile. Created/updated on every authenticated sign-in.
 * Firestore rules: allow read, write if request.auth.uid == userId
 *
 * Document ID: Firebase Auth UID
 */
export const USERS_SCHEMA = {
  uid:         "String — Firebase Auth UID",
  email:       "String — ucar.edu email address",
  role:        "String? — 'admin' | 'manager' | 'staff' (assigned post-creation)",
  lastLoginAt: "Timestamp — server timestamp of most recent login",
  createdAt:   "Timestamp? — set once on first login",
};

// ── New Collections (Phase 3 — Defined Before Implementation) ─────────────────

/**
 * weekly_schedules
 * Cached/stored version of the weekly staff schedule.
 * Primary retrieval remains Google Sheets via api/get-schedule.js.
 * This collection is for override notes and future offline support.
 *
 * Document ID: "week_{YYYY-MM-DD}" — Monday of the target week
 */
export const WEEKLY_SCHEDULES_SCHEMA = {
  weekOf:      "String — ISO date of Monday (e.g. '2026-03-09')",
  campus:      "String — one of CAMPUSES",
  rows:        "Array — raw 2D array from Google Sheets (same shape as get-schedule.js response)",
  colorMap:    "Object — keyed by '{rowIndex},{colIndex}', values are {r,g,b}",
  weekLabel:   "String — human-readable label (e.g. 'Week of March 9, 2026')",
  created_by:  "String — UID of user who cached this record",
  created_at:  "Timestamp",
  updated_at:  "Timestamp",
  status:      "String — 'active' | 'archived'",
};

/**
 * beos
 * Banquet Event Orders — catering event specifications.
 *
 * Document ID: auto-generated Firestore ID
 */
export const BEOS_SCHEMA = {
  campus:      "String — one of CAMPUSES",
  eventDate:   "Timestamp — date of the event",
  weekOf:      "String — ISO Monday date of the event's week",
  title:       "String — event name / description",
  fileUrl:     "String? — Firebase Storage URL of the BEO PDF (if uploaded)",
  fileName:    "String? — original filename",
  notes:       "String? — free-form notes",
  created_by:  "String — UID",
  created_at:  "Timestamp",
  updated_at:  "Timestamp",
  status:      "String — 'draft' | 'active' | 'completed' | 'cancelled'",
};

/**
 * event_reports
 * Post-event summary reports documenting attendance, revenue, and outcomes.
 *
 * Document ID: auto-generated Firestore ID
 */
export const EVENT_REPORTS_SCHEMA = {
  campus:      "String — one of CAMPUSES",
  eventDate:   "Timestamp — date of the event",
  weekOf:      "String — ISO Monday date",
  title:       "String — event name",
  attendance:  "Number? — headcount",
  revenue:     "Number? — event revenue",
  notes:       "String? — observations and issues",
  fileUrl:     "String? — attached document URL",
  beo_id:      "String? — reference to beos document ID",
  created_by:  "String — UID",
  created_at:  "Timestamp",
  updated_at:  "Timestamp",
  status:      "String — 'draft' | 'submitted' | 'reviewed'",
};

/**
 * setup_reports
 * Event setup instructions for catering staff.
 *
 * Document ID: auto-generated Firestore ID
 */
export const SETUP_REPORTS_SCHEMA = {
  campus:      "String — one of CAMPUSES",
  eventDate:   "Timestamp — date of setup",
  weekOf:      "String — ISO Monday date",
  title:       "String — event / setup name",
  instructions: "String? — setup details and requirements",
  fileUrl:     "String? — attached PDF or image",
  beo_id:      "String? — reference to beos document ID",
  created_by:  "String — UID",
  created_at:  "Timestamp",
  updated_at:  "Timestamp",
  status:      "String — 'draft' | 'active' | 'completed'",
};

/**
 * cafe_specials
 * Weekly menu specials displayed in the Weekly Ops tab.
 *
 * Document ID: "specials_{YYYY-MM-DD}_{CampusName}" — Monday of the week
 */
export const CAFE_SPECIALS_SCHEMA = {
  campus:     "String — one of CAMPUSES",
  weekOf:     "String — ISO Monday date",
  items:      "Array<{ day: String, name: String, description: String?, price: Number? }>",
  notes:      "String? — general weekly notes for the cafe",
  created_by: "String — UID",
  created_at: "Timestamp",
  updated_at: "Timestamp",
  status:     "String — 'draft' | 'published' | 'archived'",
};

/**
 * cash_drops
 * Daily cash drop submissions from cafe staff.
 *
 * Document ID: auto-generated Firestore ID
 */
export const CASH_DROPS_SCHEMA = {
  campus:      "String — one of CAMPUSES",
  dropDate:    "Timestamp — business date of the drop",
  weekOf:      "String — ISO Monday date of the drop's week",
  amount:      "Number — cash amount dropped",
  submittedBy: "String — UID of the submitting staff member",
  notes:       "String? — optional notes (e.g. discrepancy explanation)",
  created_by:  "String — UID",
  created_at:  "Timestamp",
  updated_at:  "Timestamp",
  status:      "String — 'submitted' | 'verified' | 'flagged'",
};

/**
 * generated_reports
 * Archive of reports generated via the Reports engine (Phase 7).
 * Stores input parameters and output content for audit and re-display.
 *
 * Document ID: auto-generated Firestore ID
 */
export const GENERATED_REPORTS_SCHEMA = {
  reportType:  "String — 'cafe_charges' | 'month_end' | 'setup_report' | 'event_report'",
  campus:      "String? — campus filter used (null = all campuses)",
  periodStart: "String? — ISO date",
  periodEnd:   "String? — ISO date",
  params:      "Object — full input parameters snapshot (reportType-specific shape)",
  output:      "String? — rendered text or HTML snapshot of the report",
  created_by:  "String — UID of user who generated the report",
  created_at:  "Timestamp",
  status:      "String — 'generated' | 'archived'",
};

/**
 * user_dashboard_prefs
 * Per-user configurable dashboard widget layout (Phase 8).
 * One document per user.
 *
 * Document ID: Firebase Auth UID
 */
export const USER_DASHBOARD_PREFS_SCHEMA = {
  uid:     "String — Firebase Auth UID (matches document ID)",
  widgets: `Array<{
    widgetId:    String,   // unique registry ID (e.g. 'sales_summary', 'schedule')
    position:    Number,   // display order (0-indexed)
    enabled:     Boolean,  // whether the widget is shown
    config:      Object?,  // widget-specific settings (e.g. campus filter)
  }>`,
  layout:     "String? — 'default' | 'compact' (future layout variants)",
  setupDone:  "Boolean — true after first-run setup wizard is completed",
  updated_at: "Timestamp",
};

// ── Exported registry ─────────────────────────────────────────────────────────
export const SCHEMA_REGISTRY = {
  daily_metrics:       DAILY_METRICS_SCHEMA,
  event_orders:        EVENT_ORDERS_SCHEMA,
  users:               USERS_SCHEMA,
  weekly_schedules:    WEEKLY_SCHEDULES_SCHEMA,
  beos:                BEOS_SCHEMA,
  event_reports:       EVENT_REPORTS_SCHEMA,
  setup_reports:       SETUP_REPORTS_SCHEMA,
  cafe_specials:       CAFE_SPECIALS_SCHEMA,
  cash_drops:          CASH_DROPS_SCHEMA,
  generated_reports:   GENERATED_REPORTS_SCHEMA,
  user_dashboard_prefs: USER_DASHBOARD_PREFS_SCHEMA,
};
