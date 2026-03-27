/**
 * EventReportWidget — Weekly Ops widget for the Event Report PDF.
 *
 * Fetches the current week's event report from Google Drive via
 * /api/get-event-report and displays an inline PDF preview with
 * Print and Open in Drive actions.
 */

import { useState, useEffect, useRef } from "react";
import { useWidget } from "../hooks/useWidget.js";
import { fetchEventReport } from "../firebase.js";
import Widget from "./Widget.jsx";
import { COLORS, RADIUS } from "../theme.js";

function base64ToBlobUrl(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export default function EventReportWidget({ weekOf = null }) {
  const {
    data:    report,
    loading,
    error,
    reload,
  } = useWidget(() => fetchEventReport(weekOf), [weekOf]);

  const [blobUrl, setBlobUrl] = useState(null);
  const blobRef = useRef(null);

  useEffect(() => {
    if (report?.pdf) {
      const url = base64ToBlobUrl(report.pdf);
      blobRef.current = url;
      setBlobUrl(url);
    } else {
      setBlobUrl(null);
    }
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [report?.pdf]);

  const notFound = !loading && !error && !report;

  const handlePrint = () => {
    const iframe = document.getElementById("event-report-preview");
    if (!iframe) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(blobUrl || report?.viewUrl, "_blank");
    }
  };

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
        <div style={{ padding: "8px 0" }}>
          {/* Inline PDF preview */}
          {blobUrl ? (
            <iframe
              id="event-report-preview"
              src={blobUrl}
              title="Event Report PDF"
              style={{
                width: "100%",
                height: 500,
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.MD,
                background: COLORS.BG_SURFACE_ALT,
              }}
            />
          ) : (
            <div style={{
              width: "100%", height: 120,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: COLORS.BG_SURFACE_ALT,
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.MD,
              color: COLORS.TEXT_MUTED,
              fontSize: 12,
              fontFamily: "'Poppins',sans-serif",
            }}>
              PDF preview not available
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 12,
          }}>
            <button
              onClick={handlePrint}
              disabled={!blobUrl}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: blobUrl ? COLORS.AQUA : COLORS.BG_SURFACE_HOVER,
                color: blobUrl ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_DISABLED,
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 12,
                cursor: blobUrl ? "pointer" : "not-allowed",
                boxShadow: blobUrl ? `0 4px 16px ${COLORS.AQUA}33` : "none",
                transition: "all .18s",
              }}
            >
              Print
            </button>
            <a
              href={report.viewUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11, color: COLORS.TEXT_MUTED,
                fontFamily: "'Poppins',sans-serif",
                textDecoration: "underline",
              }}
            >
              Open in Drive
            </a>
          </div>
        </div>
      )}
    </Widget>
  );
}
