/**
 * MobileSchedulePage — displays the staff schedule as a full-width PDF.
 *
 * Uses the same /api/get-schedule-pdf endpoint as the desktop ScheduleWidget.
 * The API returns { pdf: base64 }, which we render as an embedded PDF via
 * data URL in an <iframe>. Pinch-zoom works natively on most mobile browsers.
 */

import { useState, useEffect } from "react";
import { fetchSchedulePdf } from "../../firebase.js";

export default function MobileSchedulePage() {
  const [pdfBase64, setPdfBase64] = useState(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSchedulePdf()
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError("No schedule found for this week.");
        } else {
          setPdfBase64(data.pdf);
          setWeekLabel(data.weekLabel ?? "");
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  if (loading) return <CenteredMessage>Loading schedule...</CenteredMessage>;
  if (error)   return <CenteredMessage color="#c00">Error: {error}</CenteredMessage>;
  if (!pdfBase64) return <CenteredMessage>No schedule found for this week.</CenteredMessage>;

  const dataUrl = `data:application/pdf;base64,${pdfBase64}`;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
      <h2 style={headingStyle}>Staff Schedule</h2>
      {weekLabel && <p style={weekLabelStyle}>{weekLabel}</p>}
      <iframe
        src={dataUrl}
        title="Staff Schedule PDF"
        style={{
          flex:         1,
          width:        "100%",
          minHeight:    400,
          border:       "1px solid #ddd",
          borderRadius: 8,
          background:   "#fff",
        }}
      />
    </div>
  );
}

function CenteredMessage({ children, color = "#555" }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color, fontSize: 14 }}>
      {children}
    </div>
  );
}

const headingStyle = {
  fontSize:     16,
  fontWeight:   700,
  color:        "#00357A",
  marginBottom: 4,
};

const weekLabelStyle = {
  fontSize:     12,
  color:        "#888",
  marginBottom: 12,
};
