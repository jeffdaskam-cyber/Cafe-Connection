/**
 * SetUpReportDrive — Weekly Ops widget for the Set Up Report PDF.
 *
 * Shows a "View Set Up Report > Week of ..." link. Clicking it expands
 * to a landscape PDF preview with Print and Open in Drive actions.
 */

import { useState, useEffect, useRef } from "react";
import { useWidget } from "../hooks/useWidget.js";
import { fetchSetupReport } from "../firebase.js";
import Widget from "./Widget.jsx";
import { COLORS, RADIUS } from "../theme.js";

function base64ToBlobUrl(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export default function SetUpReportDrive({ weekOf = null }) {
  const {
    data:    report,
    loading,
    error,
    reload,
  } = useWidget(() => fetchSetupReport(weekOf), [weekOf]);

  const [expanded, setExpanded] = useState(false);
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
    const iframe = document.getElementById("setup-report-preview");
    if (!iframe) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(blobUrl || report?.downloadUrl, "_blank");
    }
  };

  return (
    <Widget
      title="Set Up Report"
      subtitle={report?.weekLabel ?? "Weekly set up report"}
      icon="📋"
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={notFound}
      emptyIcon="📋"
      emptyMessage="No Set Up Report found for this week."
      actions={[{ label: "↻ Refresh", onClick: reload }]}
    >
      {report && !expanded && (
        <div style={{ padding: "12px 0" }}>
          <button
            onClick={() => setExpanded(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 0, display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "'Poppins',sans-serif", fontWeight: 700,
              fontSize: 13, color: COLORS.AQUA,
              textDecoration: "none", transition: "opacity .18s",
            }}
          >
            View Set Up Report &rsaquo; {report.weekLabel}
          </button>
        </div>
      )}

      {report && expanded && (
        <div style={{ padding: "8px 0" }}>
          {/* Collapse link */}
          <button
            onClick={() => setExpanded(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 0, marginBottom: 10,
              fontFamily: "'Poppins',sans-serif", fontWeight: 600,
              fontSize: 11, color: COLORS.TEXT_MUTED,
            }}
          >
            &lsaquo; Back
          </button>

          {/* Landscape PDF preview */}
          {blobUrl ? (
            <iframe
              id="setup-report-preview"
              src={blobUrl}
              title="Set Up Report PDF"
              style={{
                width: "100%",
                height: 450,
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: RADIUS.MD,
                background: COLORS.BG_SURFACE_ALT,
              }}
            />
          ) : (
            <div style={{
              width: "100%", height: 100,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: COLORS.BG_SURFACE_ALT,
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.MD,
              color: COLORS.TEXT_MUTED, fontSize: 12,
              fontFamily: "'Poppins',sans-serif",
            }}>
              PDF preview not available
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginTop: 12,
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
              href={report.downloadUrl}
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
