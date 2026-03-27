/**
 * EventReportWidget — Weekly Ops widget for the Event Report PDF.
 *
 * Fetches the current week's event report from Google Drive via
 * /api/get-event-report and displays a link to view/download the PDF.
 */

import { useWidget } from "../hooks/useWidget.js";
import { fetchEventReport } from "../firebase.js";
import Widget from "./Widget.jsx";
import { COLORS } from "../theme.js";

export default function EventReportWidget({ weekOf = null }) {
  const {
    data:    report,
    loading,
    error,
    reload,
  } = useWidget(() => fetchEventReport(weekOf), [weekOf]);

  const notFound = !loading && !error && !report;

  return (
    <Widget
      title="Event Report"
      subtitle={report?.weekLabel ?? "Weekly event report"}
      icon="📋"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={notFound}
      emptyIcon="📋"
      emptyMessage="No event report found for this week."
      actions={[{ label: "↻ Refresh", onClick: reload }]}
    >
      {report && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 4px",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${COLORS.AQUA}14`,
            border: `1px solid ${COLORS.AQUA_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>
            📄
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: COLORS.TEXT_PRIMARY,
              fontFamily: "'Poppins',sans-serif",
              marginBottom: 2,
            }}>
              {report.weekLabel}
            </div>
            <div style={{
              fontSize: 11, color: COLORS.TEXT_MUTED,
              fontFamily: "'Poppins',sans-serif",
            }}>
              {report.fileName}
            </div>
          </div>
          <a
            href={report.viewUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 8,
              background: COLORS.AQUA,
              color: COLORS.TEXT_ON_ACCENT,
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 700, fontSize: 12,
              textDecoration: "none",
              boxShadow: `0 4px 16px ${COLORS.AQUA}33`,
              transition: "all .18s",
              flexShrink: 0,
            }}
          >
            View Report →
          </a>
        </div>
      )}
    </Widget>
  );
}
