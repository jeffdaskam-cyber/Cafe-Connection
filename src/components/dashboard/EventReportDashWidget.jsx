/**
 * EventReportDashWidget — dashboard widget for Event Report.
 *
 * Thin wrapper around the shared EventReportWidget so the dashboard shows
 * the identical feature (Firestore-backed entries, week navigation, and
 * manager+ entry authoring). Defaults to the current week.
 */

import EventReportWidget from "../EventReportWidget.jsx";

export default function EventReportDashWidget({ config: _config = {}, readOnly = false }) {
  return <EventReportWidget readOnly={readOnly} />;
}
