# Cafe Connection Canva Infographic Instructions

## 1. Review of Updated Files

The current Cafe Connection materials point to a mature internal operations platform with a broad feature set, but only some of that functionality should be highlighted for a prospective-user infographic.

### Most relevant source files reviewed

- `PROJECT_DOSSIER.md`
  - Best source for the current product overview, audience, tabs, feature set, mobile experience, and user roles.
- `src/App.jsx`
  - Confirms the live primary navigation and top-level experience: Dashboard, Weekly Ops, Cafe Sales, Event Revenue, FP&A, Reports, plus Admin for administrators only.
- `src/pages/DashboardPage.jsx`
  - Confirms personalized dashboard behavior, first-run setup, sticky notes, and widget-based workflow.
- `FPA_Feature_Handoff_Cafe_Connection.docx`
  - Confirms FP&A is a newer executive-facing capability, but it is more specialized and should be presented as an advanced reporting feature rather than a headline benefit for all users.
- Latest git update on April 20, 2026
  - `src/pages/FpaPage.jsx`
  - `src/utils/fpaSelectors.js`
  - `src/components/Widget.jsx`
  - This update refined the FP&A experience by surfacing an FYTD total on the Monthly Support Level card. Useful to know, but too internal for a prospect-first infographic.

### User-facing themes that should drive the infographic

- One centralized hub for cafe operations across multiple campuses
- Personalized dashboard with role-based access
- Weekly operations tools for schedules, specials, cash drops, and event materials
- Sales and revenue visibility through clean visual reporting
- Mobile-friendly experience for quick access on the go
- Faster coordination and less manual hunting across files, spreadsheets, and reports

### Features to downplay or omit

- Firestore, Vercel, Firebase, API route details, and deployment details
- Detailed FP&A logic, parsing rules, or ledger mapping
- Server hardening, linting, IT cleanup, or migration details
- Admin-only role management unless shown briefly as "secure role-based access"

## 2. Infographic Goal

Create a clean, approachable infographic for potential Cafe Connection users that answers one question:

**Why would I want to use Cafe Connection in my day-to-day work?**

The tone should be practical, polished, and easy to scan. The emphasis should be on convenience, visibility, coordination, and confidence.

## 3. Audience

Primary audience:

- UCAR cafe staff
- managers
- operations leads
- stakeholders who may use the platform regularly

Secondary audience:

- decision-makers evaluating whether the tool is useful and user-friendly

## 4. Recommended Canva Format

Use a **vertical infographic** layout.

Recommended size:

- `800 x 2000 px` or similar long-form infographic size in Canva

Recommended structure:

1. Hero section
2. What Cafe Connection is
3. Key feature blocks
4. Mobile and reporting benefits
5. Call-to-action / closing value statement

## 5. Visual Direction

Use the established brand direction from the project materials:

- Primary color: `#00A2B4`
- Supporting palette:
  - Deep teal/navy for headings
  - Light aqua backgrounds for panels
  - White or very light gray background for readability
- Typeface:
  - Use **Poppins** if available in Canva

Design cues:

- Clean cards or panels with rounded corners
- Subtle wave or flowing-line accents to echo the product branding
- Minimal clutter
- Strong icon support for each feature section
- Plenty of white space

## 6. Messaging Strategy

The infographic should position Cafe Connection as:

- a single place to manage cafe operations
- a clearer way to stay on top of schedules, specials, reporting, and event activity
- a tool that helps staff and managers work faster with better visibility

Avoid making it sound overly technical. This is a benefits-first piece, not a system architecture explainer.

## 7. Suggested Infographic Outline

### Section 1: Hero

Headline:

**Cafe Connection**

Subheadline:

**One place to manage cafe operations, reporting, and weekly coordination across campuses.**

Small supporting line:

**Built to help teams stay organized, informed, and ready for the week ahead.**

Suggested visual:

- A central dashboard mockup or stylized UI card
- Small campus/location icons
- Simple wave accent in the background

### Section 2: What It Helps You Do

Section title:

**What You Can Do with Cafe Connection**

Use 4 short icon-led blocks:

1. **Personalize Your Dashboard**
   Copy:
   Choose the widgets that matter most to you, from schedules and sales summaries to reports and event materials.

2. **Stay on Top of Weekly Operations**
   Copy:
   Access staff schedules, weekly specials, cash drop activity, and key operational updates in one place.

3. **Track Sales and Revenue**
   Copy:
   View cafe sales, event revenue, and financial trends with visual dashboards that make performance easier to understand.

4. **Access Important Reports Faster**
   Copy:
   Find recent reports, weekly packets, setup documents, and event materials without digging through multiple systems.

### Section 3: Built for Real Workflows

Section title:

**Designed for Daily Cafe Operations**

Use a horizontal or stacked set of benefit statements:

- **Across multiple campuses**
  Manage activity for Mesa Lab, Foothills, and Center Green from one centralized hub.

- **Role-based access**
  Staff, managers, and administrators each see the tools they need for their responsibilities.

- **Quick weekly visibility**
  Keep schedules, specials, event information, and exceptions easy to review at a glance.

- **Less manual searching**
  Bring together information that is often scattered across emails, spreadsheets, and uploaded files.

### Section 4: Mobile + Reporting

Section title:

**Useful at Your Desk and On the Go**

Two-column content block:

- **Mobile access**
  View schedules, specials, operations tools, and a simplified dashboard from a mobile-friendly experience.

- **Reporting support**
  Generate or review accounting and operations reports with a clearer, more organized workflow.

Suggested icons:

- phone
- chart
- document/report
- calendar

### Section 5: Closing Value Statement

Headline:

**Better visibility. Smoother coordination. Stronger day-to-day operations.**

Closing copy:

Cafe Connection helps cafe teams spend less time piecing information together and more time acting on it.

Optional footer line:

**UCAR Cafe Connection**

## 8. Canva Build Instructions

Use these instructions directly in Canva or as a handoff to a designer:

1. Create a vertical infographic with a clean white or very light gray background.
2. Use `#00A2B4` as the primary accent color for headers, dividers, icons, and key numbers.
3. Use Poppins or a similar geometric sans-serif font.
4. Build the infographic in five stacked sections with clear spacing between each section.
5. Add soft aqua background panels behind feature groups to improve scanability.
6. Use simple outline or flat icons for dashboard, calendar, phone, reports, charts, notes, and locations.
7. Keep text short. No paragraph should run longer than two short sentences.
8. Emphasize user benefits over technical details.
9. If using screenshots, crop them tightly and place them inside rounded mockup frames.
10. If screenshots are not used, create simplified UI-style cards showing dashboard widgets, schedule blocks, and charts.

## 9. Ready-to-Paste Canva Text

### Title

Cafe Connection

### Subtitle

One place to manage cafe operations, reporting, and weekly coordination across campuses.

### Feature block copy

**Personalized dashboards**
Choose the widgets and information you want to see first.

**Weekly operations tools**
Keep schedules, specials, cash drops, and key updates easy to access.

**Sales and revenue visibility**
Track performance with dashboards designed for quick understanding.

**Faster access to reports**
Review recent files, weekly packets, and event materials in one hub.

**Multi-campus coordination**
Support Mesa Lab, Foothills, and Center Green from a shared platform.

**Mobile-friendly access**
Check important information from a simplified mobile experience.

### Closing text

Better visibility. Smoother coordination. Stronger cafe operations.

## 10. What To Avoid

- Avoid calling the app "complex," "technical," or "enterprise-grade."
- Avoid backend terminology like Firestore, serverless functions, ingestion, parsing, or API routes.
- Avoid overloading the infographic with FP&A specifics.
- Avoid feature lists that read like internal documentation.
- Avoid promising capabilities that sound public-facing if the audience is internal staff.

## 11. Recommended One-Sentence Prompt for Canva AI

Create a polished vertical infographic for an internal program called Cafe Connection, aimed at potential users of the platform. Use an aqua and deep teal color palette, Poppins-style typography, clean icon-led sections, and a modern dashboard-inspired layout. Highlight personalized dashboards, weekly operations tools, sales and revenue visibility, faster access to reports, multi-campus coordination, and mobile-friendly access. Keep the tone practical, approachable, and benefit-focused.
