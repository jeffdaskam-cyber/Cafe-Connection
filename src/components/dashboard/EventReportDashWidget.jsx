/**
 * EventReportDashWidget — compact dashboard widget for Event Report.
 *
 * Shows the current week's event report label and a link to view the PDF.
 * Matches the visual style of other dashboard mini-widgets.
 */

import Widget from "../Widget.jsx";
import { useWidget } from "../../hooks/useWidget.js";
import { fetchEventReport } from "../../firebase.js";
import { COLORS } from "../../theme.js";

export default function EventReportDashWidget({ config = {} }) {
  const { data: report, loading, error, reload } = useWidget(
    () => fetchEventReport(),
    []
  );

  return (
    <Widget
      title="Event Report"
      subtitle="Current week"
      icon="📋"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      {!report ? (
        <div style={{
          textAlign: "center", padding: "20px 0 8px",
          fontSize: 12, color: COLORS.TEXT_MUTED,
          fontFamily: "'Poppins',sans-serif",
        }}>
          No event report found for this week.
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: COLORS.TEXT_PRIMARY,
            fontFamily: "'Poppins',sans-serif",
            marginBottom: 8,
          }}>
            {report.weekLabel}
          </div>
          <a
            href={report.viewUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 700, color: COLORS.AQUA,
              fontFamily: "'Poppins',sans-serif",
              textDecoration: "none",
            }}
          >
            View Report →
          </a>
        </div>
      )}
    </Widget>
  );
}
