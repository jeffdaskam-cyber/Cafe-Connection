/**
 * CafeSpecials — weekly specials pulled from Google Drive.
 *
 * Mirrors the Staff Schedule pattern: fetches a Google Doc via
 * /api/get-specials, displays the plain text content.
 *
 * Props:
 *   weekOf  {string} — ISO Monday "YYYY-MM-DD"
 *   campus  {string} — e.g. "Mesa Lab" (used for accent color only)
 */

import { useWidget } from "../hooks/useWidget.js";
import { fetchSpecials } from "../firebase.js";
import Widget from "./Widget.jsx";
import { CAMPUS_COLOR } from "./CampusSelector.jsx";
import { COLORS } from "../theme.js";

export default function CafeSpecials({ weekOf, campus }) {
  const accent = CAMPUS_COLOR[campus] ?? COLORS.AQUA;

  const {
    data:    specialsData,
    loading: specialsLoading,
    error:   specialsError,
    reload:  reloadSpecials,
  } = useWidget(() => fetchSpecials(weekOf), [weekOf]);

  return (
    <Widget
      title="Cafe Specials"
      subtitle={specialsData?.weekLabel ?? `Week of ${weekOf}`}
      icon="🍽️"
      accentColor={accent}
      loading={specialsLoading}
      error={specialsError}
      onRetry={reloadSpecials}
      expandable
      actions={[{ label: "↻ Refresh", onClick: reloadSpecials }]}
    >
      {!specialsLoading && !specialsError && !specialsData?.body && (
        <div style={{
          textAlign: "center", padding: "24px 0",
          color: COLORS.TEXT_MUTED, fontSize: 12,
          fontFamily: "'Poppins',sans-serif",
        }}>
          No specials posted for this week.
        </div>
      )}
      {specialsData?.body && (
        <div style={{
          whiteSpace: "pre-wrap",
          color: COLORS.TEXT_PRIMARY,
          fontSize: 12,
          fontFamily: "'Poppins',sans-serif",
          lineHeight: 1.7,
        }}>
          {specialsData.body}
        </div>
      )}
    </Widget>
  );
}
