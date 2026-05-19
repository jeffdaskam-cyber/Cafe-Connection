import { useState, useEffect, useRef } from "react";
import { fetchEventReport } from "../../firebase.js";
import { COLORS } from "../../theme.js";

function base64ToBlobUrl(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export default function MobileEventReportPage() {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const blobRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEventReport()
      .then((data) => { if (!cancelled) setReport(data); })
      .catch((err)  => { if (!cancelled) setError(err.message); })
      .finally(()   => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
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

  const label = report?.weekLabel ?? "Current week";

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
      <h2 style={headingStyle}>Event Report</h2>

      {loading && <p style={mutedStyle}>Loading...</p>}
      {error   && <p style={{ color: COLORS.ERROR, fontSize: 13 }}>Error: {error}</p>}

      {!loading && !error && !report && (
        <p style={mutedStyle}>No event report found for this week.</p>
      )}

      {!loading && !error && report && (
        <>
          <p style={weekLabelStyle}>{label}</p>
          {blobUrl ? (
            <iframe
              src={blobUrl}
              title="Event Report PDF"
              style={{
                flex:         1,
                width:        "100%",
                minHeight:    400,
                border:       `1px solid ${COLORS.BORDER}`,
                borderRadius: 8,
                background:   COLORS.BG_SURFACE,
              }}
            />
          ) : (
            report.viewUrl && (
              <a
                href={report.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                Open Event Report in Drive →
              </a>
            )
          )}
        </>
      )}
    </div>
  );
}

const headingStyle   = { fontSize: 16, fontWeight: 700, color: COLORS._DARKBLUE, marginBottom: 4 };
const weekLabelStyle = { fontSize: 12, color: COLORS.TEXT_MUTED, marginBottom: 12 };
const mutedStyle     = { color: COLORS.TEXT_MUTED, fontSize: 13 };
const linkStyle      = {
  display: "inline-block", marginTop: 12,
  color: COLORS.AQUA, fontSize: 14, fontWeight: 700, textDecoration: "none",
};
