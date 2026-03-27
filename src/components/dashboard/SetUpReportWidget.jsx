/**
 * SetUpReportWidget — compact dashboard widget for Set Up Report.
 *
 * Shows the current week's set up report label and a link to view the PDF.
 * Matches the visual style of other dashboard mini-widgets.
 */

import Widget from "../Widget.jsx";
import { useWidget } from "../../hooks/useWidget.js";
import { fetchSetupReport } from "../../firebase.js";
import { COLORS } from "../../theme.js";

export default function SetUpReportWidget({ config = {} }) {
  const { data: report, loading, error, reload } = useWidget(
    () => fetchSetupReport(),
    []
  );

  return (
    <Widget
      title="Set Up Report"
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
          No Set Up Report found for this week.
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
            href={report.downloadUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 700, color: COLORS.AQUA,
              fontFamily: "'Poppins',sans-serif",
              textDecoration: "none",
            }}
          >
            Open Report →
          </a>
        </div>
      )}
    </Widget>
  );
}
