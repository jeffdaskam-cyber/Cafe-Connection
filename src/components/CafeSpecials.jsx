/**
 * CafeSpecials — weekly specials pulled from Google Drive.
 *
 * Mirrors the Staff Schedule pattern: fetches a Google Doc via
 * /api/get-specials and displays the plain text content.
 * Read-only — edit the source Google Doc in Drive to update.
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
    loading,
    error,
    reload,
  } = useWidget(() => fetchSpecials(weekOf, campus), [weekOf, campus]);

  const body = (specialsData?.body ?? "").replace(/\*[^*]*Menu Items May Be Substituted[\s\S]*$/, "").trim();

  return (
    <Widget
      title={`${campus} Specials`}
      subtitle={specialsData?.weekLabel ?? "Weekly menu specials"}
      icon="🍽️"
      accentColor={accent}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={!loading && !error && !body}
      emptyIcon="🍽️"
      emptyMessage="No specials found for this week."
      expandable
      actions={[{ label: "↻ Refresh", onClick: reload }]}
    >
      {body && (
        <div style={{
          whiteSpace: "pre-wrap",
          color: COLORS.TEXT_PRIMARY,
          fontSize: 12,
          fontFamily: "'Poppins',sans-serif",
          lineHeight: 1.7,
        }}>
          {body}
        </div>
      )}
    </Widget>
  );
}
