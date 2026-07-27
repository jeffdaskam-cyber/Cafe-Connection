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
import { SPECIALS_CAMPUSES } from "./CampusSelector.jsx";
import { COLORS } from "../theme.js";

export default function CafeSpecials({ weekOf, campus }) {
  const accent = COLORS.AQUA;

  // Some campuses (Center Green) don't publish specials — skip the fetch entirely.
  const hasSpecials = SPECIALS_CAMPUSES.includes(campus);

  const {
    data:    specialsData,
    loading,
    error,
    reload,
  } = useWidget(
    () => (hasSpecials ? fetchSpecials(weekOf, campus) : Promise.resolve(null)),
    [weekOf, campus, hasSpecials]
  );

  const body = !hasSpecials
    ? ""
    : (specialsData?.body ?? "").replace(/\*[^*]*Menu Items May Be Substituted[\s\S]*$/, "").trim();

  return (
    <Widget
      title={`${campus} Specials`}
      subtitle={
        !hasSpecials
          ? "Not offered at this campus"
          : specialsData?.weekLabel ?? "Weekly menu specials"
      }
      icon="🍽️"
      accentColor={accent}
      loading={loading}
      error={error}
      onRetry={reload}
      empty={!loading && !error && !body}
      emptyIcon="🍽️"
      emptyMessage={
        hasSpecials
          ? "No specials found for this week."
          : `${campus} does not offer weekly specials.`
      }
      expandable
      actions={hasSpecials ? [{ label: "↻ Refresh", onClick: reload }] : []}
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
