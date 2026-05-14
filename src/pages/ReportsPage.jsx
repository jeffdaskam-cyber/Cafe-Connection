/**
 * ReportsPage — report generation engine.
 *
 * Live reports:
 *   - Monthly Accounting Report  ✅  five-field accounting summary
 *   - Cafe Charges               ✅  itemized charge summary by date range + campus
 *   - Weekly Packet              ✅  schedule + BEOs + setup + event PDFs
 */

import FpaReport from "../components/reports/FpaReport.jsx";
import WeeklyPacketReport from "../components/reports/WeeklyPacketReport.jsx";
import AccountingReport   from "../components/reports/AccountingReport.jsx";

import { COLORS } from "../theme.js";

// ── Reports Page ───────────────────────────────────────────────────────────────
export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 6,
          fontFamily: "'Poppins',sans-serif" }}>Reports</div>
        <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, fontWeight: 500,
          maxWidth: 560, lineHeight: 1.6, fontFamily: "'Poppins',sans-serif" }}>
          Generate, copy, and print operational reports. All report types are live.
        </div>
      </div>

      {/* ── Accounting reports ── */}
      <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
        textTransform: "uppercase", marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>
        Accounting
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
        marginBottom: 32, animation: "ucar-fadein .5s ease both" }}>
        <AccountingReport />
        <FpaReport />
      </div>

      {/* ── Operations reports ── */}
      <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600, letterSpacing: "1.5px",
        textTransform: "uppercase", marginBottom: 14, fontFamily: "'Poppins',sans-serif" }}>
        Operations
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20,
        marginBottom: 32, animation: "ucar-fadein .5s ease both" }}>
        <WeeklyPacketReport />
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: COLORS.TEXT_DISABLED,
        fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
        fontFamily: "'Poppins',sans-serif" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
