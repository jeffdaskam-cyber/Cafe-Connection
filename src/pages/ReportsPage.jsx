// ── Brand Palette ─────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const PANEL    = "#001f4d";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const AQUA     = "#00A2B4";
const LAQUA    = "#34E1F4";
const ORANGE   = "#FAA119";

function WaveGraphic({ color = AQUA, opacity = 0.18, width = 420, height = 80 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
      {[0, 14, 28, 42].map((offset, i) => (
        <path key={i}
          d={`M0,${30+offset} C80,${10+offset} 160,${50+offset} 240,${28+offset} S380,${8+offset} ${width},${30+offset}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={opacity - i * 0.02} />
      ))}
    </svg>
  );
}

// Report definition cards - placeholders for Phase 7 report engine
const REPORT_DEFINITIONS = [
  {
    id: "cafe_charges",
    icon: "💳",
    title: "Cafe Charges",
    description: "Itemized charge summary across all campuses for a selected period.",
    inputs: ["Date range", "Campus filter"],
    accentColor: AQUA,
  },
  {
    id: "month_end",
    icon: "📋",
    title: "Month-End Report",
    description: "Accounting email template with total taxes and cash drop totals per campus.",
    inputs: ["Month", "Year"],
    accentColor: LAQUA,
    note: "Currently available in Financials tab during Phase 7 build-out.",
  },
  {
    id: "setup_report",
    icon: "🔧",
    title: "Set-Up Report",
    description: "Event setup instructions and requirements for catering staff.",
    inputs: ["Event date", "Event order"],
    accentColor: ORANGE,
  },
  {
    id: "event_report",
    icon: "🎪",
    title: "Event Report",
    description: "Post-event summary with attendance, revenue, and notes.",
    inputs: ["Event date", "Campus"],
    accentColor: "#9B59B6",
  },
];

function ReportCard({ report }) {
  const isAvailable = report.id === "month_end";
  return (
    <div style={{
      background: PANEL, borderRadius: 14,
      border: `1px solid ${isAvailable ? report.accentColor + "44" : BORDER}`,
      padding: "24px 24px",
      position: "relative", overflow: "hidden",
      opacity: isAvailable ? 1 : 0.65,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: isAvailable
          ? `linear-gradient(90deg, ${report.accentColor}, transparent)`
          : BORDER,
        borderRadius: "14px 14px 0 0" }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.04 }}>
        <WaveGraphic color={report.accentColor} opacity={1} width={200} height={60} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${report.accentColor}18`, border: `1px solid ${report.accentColor}44`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
        }}>{report.icon}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TPRI, marginBottom: 4 }}>
            {report.title}
          </div>
          <div style={{ fontSize: 11, color: TSEC, fontWeight: 500, lineHeight: 1.55 }}>
            {report.description}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: TSEC, fontWeight: 600, letterSpacing: "1px",
          textTransform: "uppercase", marginBottom: 8 }}>Inputs</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {report.inputs.map(inp => (
            <span key={inp} style={{
              fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: `${DARKBLUE}`, border: `1px solid ${BORDER}`, color: TSEC,
            }}>{inp}</span>
          ))}
        </div>
      </div>

      {report.note && (
        <div style={{ fontSize: 10, color: AQUA, fontWeight: 500, marginBottom: 12,
          padding: "6px 10px", borderRadius: 6, background: `${AQUA}10`,
          border: `1px solid ${AQUA}22` }}>
          ℹ️ {report.note}
        </div>
      )}

      <button
        disabled={!isAvailable}
        style={{
          width: "100%", padding: "9px 0", borderRadius: 8,
          border: isAvailable ? "none" : `1.5px dashed ${BORDER}`,
          background: isAvailable ? report.accentColor : "transparent",
          color: isAvailable ? SPACE : TSEC,
          fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 12,
          cursor: isAvailable ? "pointer" : "not-allowed",
          letterSpacing: "0.03em",
        }}>
        {isAvailable ? "Generate Report" : "Coming in Phase 7"}
      </button>
    </div>
  );
}

// ── Reports Page ───────────────────────────────────────────────────────────────
// Phase 7 will build this into a full report-generation engine with standardized
// definitions, input parameters, preview views, and print/export actions.
export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-end",
        justifyContent: "space-between", marginBottom: 32,
        flexWrap: "wrap", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TPRI, marginBottom: 6 }}>Reports</div>
          <div style={{ fontSize: 12, color: TSEC, fontWeight: 500, maxWidth: 520, lineHeight: 1.6 }}>
            A repeatable report-generation engine is coming in Phase 7. Each report will support
            parameter inputs, a print-ready preview, and export actions.
          </div>
        </div>
        <div style={{
          fontSize: 10, color: ORANGE, fontWeight: 700,
          background: `${ORANGE}18`, border: `1px solid ${ORANGE}44`,
          borderRadius: 20, padding: "5px 14px",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Phase 7 · Not yet built
        </div>
      </div>

      {/* ── Report Grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
        gap: 20, marginBottom: 32,
        animation: "ucar-fadein .5s ease both",
      }}>
        {REPORT_DEFINITIONS.map(report => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>

      {/* ── Engine Status ── */}
      <div style={{
        background: PANEL, borderRadius: 14,
        border: `1.5px dashed ${BORDER}`,
        padding: "24px 28px",
        animation: "ucar-fadein .6s ease both",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TPRI, marginBottom: 10 }}>
          Phase 7 Build Plan
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "Standardized report definition schema",
            "Shared input parameter components (date range, campus, period)",
            "Print-friendly preview rendering for all report types",
            "PDF export and clipboard copy actions",
            "Generated report archive in Firestore (generated_reports collection)",
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: BORDER, fontWeight: 700, flexShrink: 0 }}>○</span>
              <span style={{ fontSize: 12, color: TSEC, fontWeight: 500 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 32, textAlign: "center", fontSize: 10, color: `${TSEC}88`,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
