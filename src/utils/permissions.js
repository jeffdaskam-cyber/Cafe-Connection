// Cafe Connection — Role-Based Access Control
// Single source of truth for all permission checks.
// Roles in ascending order: user, manager, senior_leader, administrator

export const ROLES = ["user", "manager", "senior_leader", "administrator"];

const ROLE_ORDER = ROLES;

// ── Catering Companion: the `requester` role ─────────────────────────────────
// Any @ucar.edu user who reaches /catering without an existing staff role.
//
// A SIBLING of the staff ladder, not a rung on it. It must never satisfy
// roleAtLeast() for any staff role and must never appear in PAGE_ACCESS or
// WIDGET_ACCESS, so a future permissions refactor cannot accidentally grant a
// requester staff visibility. Kept out of ROLES for that reason — use
// ALL_ROLES when you need every valid role value (e.g. validating a role doc).
export const REQUESTER_ROLE = "requester";

export const ALL_ROLES = [...ROLES, REQUESTER_ROLE];

export function isRequesterRole(userRole) {
  return userRole === REQUESTER_ROLE;
}

// Returns true if the user's role meets or exceeds the required minimum role.
// Requesters are off the ladder entirely and always fail this check.
export function roleAtLeast(userRole, minRole) {
  if (isRequesterRole(userRole)) return false;
  const userIndex = ROLE_ORDER.indexOf(userRole);
  const minIndex  = ROLE_ORDER.indexOf(minRole);
  if (userIndex === -1 || minIndex === -1) return false;
  return userIndex >= minIndex;
}

// Page-level access map
// Listed roles can access the page; all others cannot.
const PAGE_ACCESS = {
  dashboard:     ["user", "manager", "senior_leader", "administrator"],
  weekly_ops:    ["user", "manager", "administrator"],
  cafe_sales:    ["manager", "administrator"],
  event_revenue: ["manager", "administrator"],
  fpa:           ["senior_leader", "administrator"],
  reports:       ["manager", "administrator"],
  admin:         ["administrator"],
  // Catering Companion staff console (Phase 3). Mirrors the isManagerOrAbove()
  // helper in firestore.rules. Deliberately excludes `requester` — requesters
  // use the separate /catering entry point, never the staff shell.
  catering:      ["manager", "senior_leader", "administrator"],
};

export function canAccessPage(userRole, page) {
  // Requesters have no access to any Cafe Connection staff page. Explicit
  // rather than relying on their absence from every PAGE_ACCESS list.
  if (isRequesterRole(userRole)) return false;
  return PAGE_ACCESS[page]?.includes(userRole) ?? false;
}

// Widget-level access map
// Values: "full" | "read_only" | "hidden"
// Anything not listed falls through to "hidden".
const WIDGET_ACCESS = {
  // Dashboard widgets
  dashboard_cafe_sales_summary: {
    administrator: "full",
    senior_leader: "full",
    manager:       "full",
    user:          "full",
  },
  dashboard_cafe_specials: {
    administrator: "full",
    senior_leader: "full",
    manager:       "full",
    user:          "full",
  },
  dashboard_weekly_exceptions: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "full",
  },
  dashboard_staff_schedule: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "full",
  },
  dashboard_event_order_library: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "full",
  },
  dashboard_event_report: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "read_only",
  },
  dashboard_setup_report: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "read_only",
  },
  dashboard_notes: {
    administrator: "full",
    senior_leader: "full",
    manager:       "full",
    user:          "full",
  },
  dashboard_cash_drop: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "full",
  },
  dashboard_vendor_portal: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "full",
    user:          "full",
  },
  // Catering is manager-and-above, matching the Catering tab and the
  // security rules on catering_events.
  dashboard_catering: {
    administrator: "full",
    senior_leader: "full",
    manager:       "full",
    user:          "hidden",
  },

  // Weekly Ops widgets (senior_leader never sees this page)
  weekly_ops_cafe_sales_summary: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_cafe_specials: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_weekly_exceptions: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_staff_schedule: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_event_order_library: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_event_report: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_setup_report: {
    administrator: "full",
    manager:       "full",
    user:          "read_only",
  },
  weekly_ops_cash_drop: {
    administrator: "full",
    manager:       "full",
    user:          "full",
  },
  weekly_ops_vendor_portal: {
    administrator: "full",
    manager:       "full",
    user:          "full",
  },

  // Event Revenue upload zones
  event_revenue_internal_dropbox: {
    administrator: "full",
    manager:       "full",
    user:          "hidden",
  },
  event_revenue_external_dropbox: {
    administrator: "full",
    manager:       "full",
    user:          "hidden",
  },

  // FP&A
  fpa_report_dropbox: {
    administrator: "full",
    senior_leader: "hidden",
    manager:       "hidden",
    user:          "hidden",
  },
};

// Maps widgetRegistry widgetId → dashboard permission key.
// Used to filter the dashboard widget picker and saved user prefs.
export const DASHBOARD_WIDGET_KEY = {
  sales_summary:       "dashboard_cafe_sales_summary",
  cafe_specials:       "dashboard_cafe_specials",
  weekly_exceptions:   "dashboard_weekly_exceptions",
  schedule:            "dashboard_staff_schedule",
  event_order_library: "dashboard_event_order_library",
  event_report:        "dashboard_event_report",
  setup_report:        "dashboard_setup_report",
  cash_drop:           "dashboard_cash_drop",
  vendor_portal:       "dashboard_vendor_portal",
  catering:            "dashboard_catering",
};

// Returns "full" | "read_only" | "hidden"
export function widgetAccess(userRole, widgetKey) {
  // Requesters never see a Cafe Connection staff widget.
  if (isRequesterRole(userRole)) return "hidden";
  return WIDGET_ACCESS[widgetKey]?.[userRole] ?? "hidden";
}

// Convenience boolean helpers
export function canSeeWidget(userRole, widgetKey) {
  return widgetAccess(userRole, widgetKey) !== "hidden";
}

export function hasFullAccess(userRole, widgetKey) {
  return widgetAccess(userRole, widgetKey) === "full";
}
