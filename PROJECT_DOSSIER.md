# UCAR Cafe Connection — Project Dossier
**Last Updated:** April 14, 2026

---

## Overview

**UCAR Cafe Connection** is an internal web application built for the University Corporation for Atmospheric Research (UCAR) to manage cafe operations across three campuses: **Mesa Lab**, **Foothills**, and **Center Green**.

The app provides a centralized hub for daily operations, financial reporting, event management, and staff coordination. It is deployed on Vercel (auto-deploys from `main`) and uses Firebase for authentication, real-time data, and file storage.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Database & Auth | Firebase (Firestore, Auth, Storage) |
| Hosting & API | Vercel (serverless functions) |
| Charts | Recharts |
| File Uploads | react-dropzone |
| Schedule / Reports | Google Sheets API + Google Drive |
| Design | UCAR brand — Aqua (`#00A2B4`) primary color, Poppins typeface |

---

## Authentication & Access Control

- **Login**: Firebase magic-link (email link) — no passwords. Users receive a sign-in link to their UCAR email.
- **Splash Screen**: Animated branded splash shown once per page load while Firebase auth initializes in the background.
- **Roles**: Three tiers stored in Firestore `user_roles` collection:
  - `user` — read-only access to most features
  - `manager` — adds upload zones (DropBox, Event Orders, sales reports)
  - `administrator` — full access including the Admin tab and role management
- Role changes are routed through the `/api/update-user-role` serverless endpoint (not direct Firestore writes) to enforce server-side validation.
- **Mobile detection**: Viewport ≤768px automatically renders the mobile layout instead of the desktop shell.

---

## Application Layout

### Desktop Shell
Sticky header bar contains:
- **UCAR Cafe Connection** wordmark (with wave SVG decoration)
- Tab navigation: Dashboard · Weekly Ops · Cafe Sales · Event Revenue · Reports · Admin *(admin-only)*
- Current date and signed-in user with **Sign out** button

### Mobile Shell
Fixed bottom tab bar with four tabs:
- **Schedule** — staff schedule for the current week
- **Specials** — weekly cafe specials
- **Ops** — cash drop and operational quick-actions
- **Dashboard** — a condensed personal dashboard

> Reports, Cafe Sales, and Admin are intentionally excluded on mobile.

---

## Tab-by-Tab Feature Reference

---

### 1. Dashboard

A personalized widget grid. Each user's layout is stored in Firestore under `user_dashboard_prefs/{uid}`.

**First-Run Wizard**: Launches automatically for new users to set their display name and choose which widgets to enable. Can be re-opened at any time via the **Edit Dashboard** button.

**Welcome Banner**: Displays a personalized greeting (`Welcome back, [Name].`) pulled from the user's Firestore profile, with a fallback to the email prefix. Shows the active widget count.

**Sticky Notes Panel** *(new)*: Toggled from the welcome banner via the **Notes** button. Renders a collapsible section inside the banner containing up to **6 personal Post-it notes** per user, stored in Firestore. Notes can be added via a modal (200-character limit) and deleted with a slide-right fade animation.

**Widget Grid**: Masonry-style 3-column layout. Available widgets:

| Widget ID | Widget Name | Description |
|---|---|---|
| `sales_summary` | Cafe Sales Summary | MTD/YTD sales figures for the user's campus |
| `schedule` | Staff Schedule | Current week's schedule with expand + email |
| `cash_drop` | Cash Drop | Log and view cash drop entries |
| `cafe_specials` | Cafe Specials | Weekly specials fetched from Google Sheets |
| `recent_reports` | Recent Reports | Quick-access list of recently uploaded reports |
| `event_order_library` | Event Order Library | Browse and view event order PDFs by week |
| `event_report` | Event Report | Current week's BEO/event report from Google Drive |
| `setup_report` | Set Up Report | Current week's setup report PDF from Google Drive |
| `weekly_exceptions` | Weekly Exceptions | Alerts and exceptions for the selected week |

---

### 2. Weekly Ops

The full operational workspace for the current week. A **Week Selector** (Monday-anchored) and **Campus Selector** at the top drive all widgets simultaneously.

**Role-based visibility**: Upload zones (DropBox, Event Order upload) are hidden for `user` role; visible to `manager` and `administrator`.

| Widget | Description |
|---|---|
| **Staff Schedule** | Fetches schedule from Google Sheets via `/api/get-schedule`. Full-screen modal with PDF export, email button, and WFH detection. |
| **Weekly Exceptions** | Flags schedule deviations (WFH, absences, coverage changes) for the selected week. |
| **Cafe Specials** | Weekly specials pulled from Google Sheets. Strips public-health disclaimers automatically. |
| **Cash Drop** | Form to log cash drops; displays a history of drops for the selected week and campus. |
| **DropBox** | Sales report upload zone (manager+). Accepts PDF/Excel; parses via `/api/parse-report`. |
| **Event Order Library** | Displays all event orders for the selected week. PDFs uploaded manually; the `/api/ingest-email-orders` endpoint for automatic email ingestion is implemented but not yet activated (see "Deferred Work" below). Full-screen PDF preview. |
| **Set Up Report** | Pulls the setup report PDF for the week from Google Drive via `/api/get-setup-report`. Full-screen preview, email button. |
| **Event Report** | Pulls the BEO/event report PDF for the week from Google Drive via `/api/get-event-report`. Full-screen preview, email button. |

---

### 3. Cafe Sales *(formerly "Financials")*

Financial metrics for cafe sales, filterable by campus, fiscal year, month, and period.

**Controls:**
- **Campus** selector: Mesa Lab · Foothills · Center Green · **All Campuses** (aggregated)
- **Fiscal Year** dropdown (derived from available data, UCAR fiscal year Oct–Sep, labeled FY26-style)
- **Month** selector (daily view only)
- **Period** toggle: **Daily** (day-by-day for a selected month) / **Monthly** (month-by-month for a fiscal year)

**Stat Cards (row 1):**
- Net Revenue — MTD (daily) or YTD (monthly)
- Avg Daily Checks / Avg Monthly Checks
- Total Checks MTD / Total Checks YTD

**Stat Cards (row 2):**
- Avg Check (net revenue ÷ total checks)
- Avg Daily Revenue / Avg Monthly Revenue

**Charts:**
- **Cafe Sales** — bar chart with labeled bars (`$Xk` or `$X`)
- **Total Cafe Volume** — line chart of total customer checks

**All Campuses mode**: Aggregates each campus's data independently (respecting period-report priority over daily rollups) before summing across campuses to avoid double-counting.

---

### 4. Event Revenue *(new tab)*

Tracks internal and external event revenue separately by campus, with server-side Excel parsing.

**Controls:**
- **Period** toggle: **Monthly** / **Annual**
- **Fiscal Year** dropdown (Monthly view only)

**Stat Cards:** Per-campus event revenue totals for the selected period/fiscal year:
- Center Green
- Foothills
- Mesa Lab

**Chart:** Grouped bar chart with one bar per campus per time period (month or fiscal year), with campus-color-coded bars and a legend:
- Center Green — UCAR Aqua (`#00A2B4`)
- Foothills — Light Aqua (`#34E1F4`)
- Mesa Lab — Aqua Dark

**Upload Zones:**
- **Upload Internal Report** — requires month and year selection before accepting a `.xlsx` file. Parsed by `/api/parse-event-revenue` with `reportType: "internal"`.
- **Upload External Invoices** — accepts `.xlsx` without a month/year requirement (date is derived from the file). Parsed by `/api/parse-event-revenue` with `reportType: "external"`.

Both upload zones show upload → processing → success/error states with animated progress indicators.

---

### 5. Reports

Report generation hub with two sections: **Accounting** and **Operations**.

**Accounting Reports:**

| Report | Description |
|---|---|
| **Monthly Accounting Report** | Queries `daily_metrics` for a selected month across all three campuses. Summarizes: Net Revenue, Total Tax, Payroll, Credit Card, and Cash Deposit. Supports **Excel download** (UCAR-branded, includes Daily Totals section) and **Gmail compose** (pre-filled email). |
| **Cafe Charges Report** | Itemized charge summary filterable by date range and campus. |

**Operations Reports:**

| Report | Description |
|---|---|
| **Weekly Packet** | Combined PDF export of the staff schedule + BEOs + setup report + event report for a selected week. Rendered as landscape PDFs with print-optimized CSS. |

---

### 6. Admin *(administrator role only)*

**User Management** table showing all registered users from the `user_roles` Firestore collection:
- Email address
- Display name
- Role dropdown (user / manager / administrator) — changes POST to `/api/update-user-role`
- Last role-assigned date

Access is double-checked server-side; the tab only renders in the nav for administrators.

---

## Serverless API Routes

All routes require a Firebase ID token in the `Authorization: Bearer <token>` header. Unauthenticated requests return `401`.

| Route | Method | Description |
|---|---|---|
| `/api/parse-report` | POST | Upload and parse a daily sales report (PDF or Excel) into Firestore `daily_metrics` |
| `/api/get-schedule` | GET | Fetch staff schedule from Google Sheets for a given week |
| `/api/get-schedule-pdf` | GET | Export the staff schedule as a landscape PDF |
| `/api/get-event-report` | GET | Retrieve the BEO/event report PDF from Google Drive |
| `/api/get-setup-report` | GET | Retrieve the setup report PDF from Google Drive |
| `/api/ingest-email-orders` | GET | Poll monitored inbox for event-order PDFs, upload to Storage, write to `event_orders`. **Implemented but not yet activated** — requires Gmail OAuth env vars and cron re-enable post-migration. |
| `/api/parse-event-revenue` | POST | Parse internal or external event revenue `.xlsx` and write to `event_revenue` collection |
| `/api/update-user-role` | POST | Change a user's role (administrator-only) |

---

## Firestore Data Model (key collections)

| Collection | Contents |
|---|---|
| `daily_metrics` | Daily sales records per campus (net_revenue, total_checks, lunch_checks, etc.). Client-write-blocked via Firestore rules. |
| `event_revenue` | Monthly event revenue records per campus, separated by internal/external type. |
| `user_roles` | Per-user role assignments (role, email, displayName, assignedAt). |
| `user_dashboard_prefs` | Per-user dashboard widget layout and configuration. |
| `users` | User profile records (displayName set during first-run wizard). |
| `dashboard_notes` | Per-user sticky notes (text, createdAt). |
| `event_orders` | Event order PDFs (metadata + Storage URLs), keyed by week. |
| `weekly_exceptions` | Weekly schedule exception flags per campus. |

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `COLORS.AQUA` | `#00A2B4` | Primary brand color — all accent bars, active tabs, buttons |
| `COLORS.AQUA_DARK` | darker variant | Mesa Lab chart bars, secondary accents |
| `COLORS.BG_PAGE` | dark neutral | Page background |
| `COLORS.BG_SURFACE` | lighter neutral | Cards and widgets |
| `COLORS.TEXT_PRIMARY` | near-white | Headlines, values |
| `COLORS.TEXT_MUTED` | dimmed | Labels, subtitles |
| `COLORS.SUCCESS` | green | Positive variance, success states |
| `COLORS.WARNING` | amber | Negative variance, error states |

All theme values are centralized in `src/theme.js`. No one-off hex values in component files.

---

## Recent Changes (past several weeks)

### New Feature: Event Revenue Tab
A fully new fifth tab for tracking event-specific revenue (both internal catering and external invoices) by campus. Includes Excel upload, server-side parsing, grouped bar chart, per-campus stat cards, and fiscal year/monthly views.

### New Feature: Dashboard Sticky Notes
Users can maintain up to 6 personal Post-it-style notes on their dashboard, stored per-user in Firestore. The notes panel collapses into the welcome banner and uses a slide-right animation on delete.

### Notes Panel Architecture Refactor
The sticky notes UI was originally built as a fixed-position overlay on the right side of the viewport. It was refactored to render as a collapsible section within the dashboard welcome banner, eliminating z-index conflicts with widgets.

### Tab Rename: Financials → Cafe Sales
The "Financials" tab was renamed to "Cafe Sales" to more accurately reflect the data shown (cafe transaction data, not full financial accounting).

### All Campuses Aggregation
The Cafe Sales page now supports an "All Campuses" option in the campus selector, aggregating metrics and charts across Mesa Lab, Foothills, and Center Green. Aggregation logic applies period-report priority per campus before summing to prevent double-counting.

### Average Metrics Added
Two new stat cards added to Cafe Sales: **Avg Check** (revenue ÷ checks) and **Avg Daily Revenue** (revenue ÷ days with activity).

### Monthly Accounting Report
A full accounting summary report was added to the Reports tab. It pulls Net Revenue, Total Tax, Payroll, Credit Card, and Cash Deposit for a selected month across all three campuses. Supports UCAR-branded Excel export (with a Daily Totals section) and a pre-filled Gmail compose link.

### Email Buttons
Email action buttons (launching the system mail client pre-filled with report content) were added to the Staff Schedule, Set Up Report, and Event Report widgets.

### Parser Fixes for Center Green
The daily sales report parser was updated to handle breakfast-only campuses correctly. Center Green previously parsed as a sub-section header due to cell background color detection logic; this has been corrected with a campus-name allowlist.

### Color Unification
All campus accent colors were standardized to UCAR Aqua (`#00A2B4`). Previously, different campuses used different hues; the unified palette matches the UCAR brand guide.

### Event Revenue Chart Simplification
The Event Revenue chart was simplified from a grouped internal/external bar layout (requiring a campus selector) to a per-campus grouped layout showing combined revenue per campus per period. A color-coded legend was added below the chart.

### MTD/YTD Label Improvements
Stat card labels on the Cafe Sales page now dynamically reflect the period context: the Net Revenue card reads "YTD" in monthly view and includes "(MTD)" with the month name in daily view.

---

## Deployment & Infrastructure

- **Hosting**: Vercel — auto-deploys on every push to `main`
- **Environments**: Production (main branch) and Preview (feature branches) both require environment variables set in the Vercel project dashboard
- **Firebase**: Rules deployed separately via `firebase deploy --only firestore:rules`
- **Rollback**: `git revert <sha>` on main triggers an automatic Vercel redeploy to the prior state

---

## Deferred Work (Post-Migration)

The following features are implemented but held until UCAR completes the platform migration:

- **Email auto-ingestion for event orders** — The `/api/ingest-email-orders` endpoint is fully implemented and ready. Activation requires (1) setting the `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `FIREBASE_STORAGE_BUCKET` env vars in the Vercel dashboard, and (2) re-adding the daily cron entry to `vercel.json`:
  ```json
  "crons": [{ "path": "/api/ingest-email-orders", "schedule": "0 14 * * *" }]
  ```
  The cron was removed pre-migration to prevent daily failures while env vars were unset.

---

*University Corporation for Atmospheric Research · Internal Tool*
