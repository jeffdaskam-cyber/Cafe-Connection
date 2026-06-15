/**
 * SetUpReportWidget — dashboard widget for Set Up Report.
 *
 * Shows a "View Set Up Report > Week of ..." link. Clicking opens a
 * full-screen modal with a landscape PDF preview, Print, and Open in Drive.
 */

import { useState, useEffect, useRef } from "react";
import Widget from "../Widget.jsx";
import SetupReportEntryModal from "../SetupReportEntryModal.jsx";
import { useWidget } from "../../hooks/useWidget.js";
import { useRole } from "../../hooks/useRole.js";
import { roleAtLeast } from "../../utils/permissions.js";
import { fetchSetupReport } from "../../firebase.js";
import { COLORS, RADIUS } from "../../theme.js";
import { launchEmailComposer } from "../../utils/emailLauncher.js";

function base64ToBlobUrl(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

// Sunday 00:00:00 local of the current week (UCAR weeks run Sunday–Saturday).
function getCurrentWeekSunday() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function SetUpReportWidget({ config: _config = {}, readOnly = false }) {
  const { data: report, loading, error, reload } = useWidget(
    () => fetchSetupReport(), []
  );

  const { role } = useRole();
  const canEdit = roleAtLeast(role, "manager");

  const [modalOpen, setModalOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const blobRef = useRef(null);

  // Native entry authoring (manager and above). Phase 2: create/edit/delete
  // write to Firestore; the PDF display above still reads Google Sheets.
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null); // null = create mode

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

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e) => { if (e.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen]);

  const label = report?.weekLabel ?? "Current week";

  const handlePrint = () => {
    const iframe = document.getElementById("dash-setup-report-preview");
    if (!iframe) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(blobUrl || report?.downloadUrl, "_blank");
    }
  };

  return (
    <>
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(1,24,55,0.82)",
            display: "flex", alignItems: "flex-start",
            justifyContent: "center",
            padding: "48px 24px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: COLORS.BG_SURFACE,
              borderRadius: 16,
              border: `1px solid ${COLORS.BORDER}`,
              width: "100%", maxWidth: 1100,
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 24px",
              borderBottom: `1px solid ${COLORS.BORDER}`,
              background: COLORS.BG_SURFACE_ALT,
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: COLORS.TEXT_PRIMARY,
                    fontFamily: "'Poppins',sans-serif",
                  }}>Set Up Report</div>
                  <div style={{
                    fontSize: 11, color: COLORS.TEXT_MUTED,
                    fontFamily: "'Poppins',sans-serif",
                  }}>{label}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={handlePrint}
                  disabled={!blobUrl}
                  style={{
                    background: blobUrl ? COLORS.AQUA : "transparent",
                    border: blobUrl ? "none" : `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "6px 16px",
                    color: blobUrl ? COLORS.TEXT_ON_ACCENT : COLORS.TEXT_DISABLED,
                    fontSize: 12, cursor: blobUrl ? "pointer" : "not-allowed",
                    fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  }}>Print</button>
                {report?.downloadUrl && (
                  <a href={report.downloadUrl} target="_blank" rel="noreferrer"
                    style={{
                      background: "transparent",
                      border: `1px solid ${COLORS.BORDER}`,
                      borderRadius: 8, padding: "5px 12px",
                      color: COLORS.TEXT_MUTED, fontSize: 11,
                      fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                      textDecoration: "none",
                    }}>Open in Drive</a>
                )}
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: 8, padding: "5px 14px",
                    color: COLORS.TEXT_MUTED, fontSize: 16,
                    cursor: "pointer", lineHeight: 1,
                  }}>&#10005;</button>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              {blobUrl ? (
                <iframe
                  id="dash-setup-report-preview"
                  src={blobUrl}
                  title="Set Up Report PDF"
                  style={{
                    width: "100%", height: "75vh",
                    border: `1px solid ${COLORS.BORDER}`,
                    borderRadius: RADIUS.MD,
                    background: COLORS.BG_SURFACE_ALT,
                  }}
                />
              ) : (
                <div style={{
                  width: "100%", height: 200,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: COLORS.BG_SURFACE_ALT,
                  border: `1px solid ${COLORS.BORDER}`,
                  borderRadius: RADIUS.MD,
                  color: COLORS.TEXT_MUTED, fontSize: 13,
                  fontFamily: "'Poppins',sans-serif",
                }}>PDF preview not available</div>
              )}
            </div>
          </div>
        </div>
      )}

      <Widget
        title="Set Up Report"
        subtitle={label}
        icon="📋"
        accentColor={COLORS.AQUA}
        loading={loading}
        error={error}
        onRetry={reload}
        actions={[
          ...(canEdit ? [{
            icon: "＋",
            label: "Add Task",
            onClick: () => {
              setEditingEntry(null);
              setEntryModalOpen(true);
            },
          }] : []),
          ...(readOnly ? [] : [{
            icon: "📧",
            label: "Email",
            onClick: () => launchEmailComposer(
              "Set Up Report",
              "",
              label,
              report?.downloadUrl || ""
            ),
          }]),
          { label: "↻ Refresh", onClick: reload },
        ]}
      >
        {!report ? (
          <div style={{
            textAlign: "center", padding: "20px 0 8px",
            fontSize: 12, color: COLORS.TEXT_MUTED,
            fontFamily: "'Poppins',sans-serif",
          }}>No Set Up Report found for this week.</div>
        ) : (
          <div style={{ padding: "16px 4px" }}>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                background: "transparent", border: "none",
                padding: 0, cursor: "pointer",
                color: COLORS.AQUA, fontSize: 13,
                fontWeight: 700, fontFamily: "'Poppins',sans-serif",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              View Set Up Report &rsaquo; {label}
            </button>
          </div>
        )}
      </Widget>

      {/* ── Entry modal (create / edit / delete) ── */}
      {entryModalOpen && (
        <SetupReportEntryModal
          isOpen={entryModalOpen}
          onClose={() => setEntryModalOpen(false)}
          weekOf={getCurrentWeekSunday()}
          existingEntry={editingEntry}
          onSaved={() => setEntryModalOpen(false)}
          onDeleted={() => setEntryModalOpen(false)}
        />
      )}
    </>
  );
}
