/**
 * Widget Registry — Cafe Connection Phase 8
 *
 * Central definition of all available dashboard widgets.
 * Each entry describes the widget's metadata and default configuration.
 * The actual component is resolved at render time in DashboardPage.
 *
 * Fields:
 *   widgetId       {string}  — unique ID matching user_dashboard_prefs.widgets[].widgetId
 *   label          {string}  — display name
 *   icon           {string}  — emoji icon
 *   description    {string}  — one-sentence description shown in the wizard
 *   needsCampus    {boolean} — true if widget requires a campus filter in config
 *   defaultEnabled {boolean} — pre-checked in first-run wizard
 *   colSpan        {number}  — default grid column span (1 or 2)
 */

export const WIDGET_REGISTRY = [
  {
    widgetId:       "sales_summary",
    label:          "Cafe Sales Summary",
    icon:           "📊",
    description:    "Net revenue and check counts for your campus — most recent reports.",
    needsCampus:    true,
    defaultEnabled: true,
    colSpan:        1,
  },
  {
    widgetId:       "schedule",
    label:          "Staff Schedule",
    icon:           "📋",
    description:    "This week's staff schedule, pulled from Google Drive.",
    needsCampus:    false,
    defaultEnabled: true,
    colSpan:        1,
  },
  {
    widgetId:       "cash_drop",
    label:          "Cash Drops",
    icon:           "💧",
    description:    "Most recent cash drop submissions for your campus.",
    needsCampus:    true,
    defaultEnabled: false,
    colSpan:        1,
  },
  {
    widgetId:       "cafe_specials",
    label:          "Cafe Specials",
    icon:           "🍽️",
    description:    "This week's menu specials for your campus.",
    needsCampus:    true,
    defaultEnabled: false,
    colSpan:        1,
  },
  {
    widgetId:       "recent_reports",
    label:          "Recent Reports",
    icon:           "📁",
    description:    "Your most recently submitted setup and event reports.",
    needsCampus:    false,
    defaultEnabled: false,
    colSpan:        1,
  },
  {
    widgetId:       "event_order_library",
    label:          "Event Order Library",
    icon:           "📄",
    description:    "Browse and open uploaded event order PDFs.",
    needsCampus:    false,
    defaultEnabled: false,
    colSpan:        1,
  },
  {
    widgetId:       "weekly_exceptions",
    label:          "Schedule Notes",
    icon:           "📋",
    description:    "PTO and WFH exceptions for the current week, grouped by day.",
    needsCampus:    false,
    defaultEnabled: false,
    colSpan:        1,
  },
  {
    widgetId:       "event_report",
    label:          "Event Report",
    icon:           "📋",
    description:    "Current week's event report from Google Drive",
    needsCampus:    false,
    defaultEnabled: false,
    colSpan:        1,
  },
  {
    widgetId:       "setup_report",
    label:          "Set Up Report",
    icon:           "📋",
    description:    "Current week's Set Up Report from Google Drive.",
    needsCampus:    false,
    defaultEnabled: false,
    colSpan:        1,
  },
];

/** Look up a widget definition by ID. */
export function widgetById(id) {
  return WIDGET_REGISTRY.find(w => w.widgetId === id) ?? null;
}

/**
 * Build a default prefs object for a brand-new user.
 * @param {string} campus — primary campus chosen during first-run wizard
 */
export function defaultPrefs(campus = "Mesa Lab") {
  return {
    widgets: WIDGET_REGISTRY.map((w, i) => ({
      widgetId: w.widgetId,
      position: i,
      enabled:  w.defaultEnabled,
      config:   w.needsCampus ? { campus } : {},
    })),
    setupDone: false,
  };
}
