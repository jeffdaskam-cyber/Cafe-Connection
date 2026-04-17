/**
 * MobileDashboardPage — single-column widget stack for mobile.
 *
 * Reuses the existing dashboard mini-widget components directly.
 * Each widget has its own internal campus switcher, so no top-level
 * campus selector is needed here.
 */

import SalesSummaryWidget  from "../../components/dashboard/SalesSummaryWidget.jsx";
import ScheduleWidget      from "../../components/dashboard/ScheduleWidget.jsx";
import CafeSpecialsWidget  from "../../components/dashboard/CafeSpecialsWidget.jsx";
import CashDropWidget      from "../../components/dashboard/CashDropWidget.jsx";
import { COLORS } from "../../theme.js";

export default function MobileDashboardPage() {
  return (
    <div style={{ padding: 16 }}>
      <h2 style={headingStyle}>Dashboard</h2>

      {/* Single-column stack — each widget gets full width */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SalesSummaryWidget  config={{}} />
        <ScheduleWidget      config={{}} />
        <CafeSpecialsWidget  config={{}} />
        <CashDropWidget      config={{}} />
      </div>
    </div>
  );
}

const headingStyle = { fontSize: 16, fontWeight: 700, color: COLORS._DARKBLUE, marginBottom: 12 };
