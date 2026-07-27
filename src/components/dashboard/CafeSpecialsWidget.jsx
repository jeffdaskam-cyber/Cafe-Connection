/**
 * CafeSpecialsWidget — dashboard mini-widget
 *
 * Shows this week's cafe specials for the selected campus,
 * fetched from Google Drive via /api/get-specials.
 * Includes an inline campus switcher.
 *
 * Props:
 *   config  { campus: string }
 */

import { useState } from "react";
import Widget from "../Widget.jsx";
import { SPECIALS_CAMPUSES } from "../CampusSelector.jsx";
import { useWidget } from "../../hooks/useWidget.js";
import { fetchSpecials } from "../../firebase.js";
import { COLORS } from "../../theme.js";

function currentMonday() {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function CampusPills({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
      {SPECIALS_CAMPUSES.map(c => {
        const active = c === value;
        const color  = COLORS.AQUA;
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              padding: "3px 9px",
              borderRadius: 4,
              border: `1px solid ${active ? color : COLORS.BORDER}`,
              background: active ? `${color}18` : "transparent",
              color: active ? color : COLORS.TEXT_MUTED,
              fontFamily: "'Poppins',sans-serif",
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: "0.03em",
              cursor: "pointer",
              transition: "all .15s",
            }}>
            {c}
          </button>
        );
      })}
    </div>
  );
}

export default function CafeSpecialsWidget({ config = {} }) {
  // A user's saved campus may be one that has no specials (e.g. Center Green) —
  // fall back to the first campus that does.
  const [activeCampus, setActiveCampus] = useState(
    SPECIALS_CAMPUSES.includes(config.campus) ? config.campus : SPECIALS_CAMPUSES[0]
  );
  const accentColor = COLORS.AQUA;
  const weekOf      = currentMonday();

  const { data: specials, loading, error, reload } = useWidget(
    () => fetchSpecials(weekOf, activeCampus),
    [weekOf, activeCampus]
  );

  const body = (specials?.body ?? "").replace(/\*[^*]*Menu Items May Be Substituted[\s\S]*$/, "").trim();

  return (
    <Widget
      title="Cafe Specials"
      subtitle={activeCampus}
      icon="🍽️"
      accentColor={accentColor}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      <CampusPills value={activeCampus} onChange={setActiveCampus} />
      {!body ? (
        <div style={{ textAlign: "center", padding: "20px 0 8px",
          fontSize: 12, color: COLORS.TEXT_MUTED }}>
          No specials posted for this week.
        </div>
      ) : (
        <div style={{
          fontSize: 12, color: COLORS.TEXT_PRIMARY, lineHeight: 1.65,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: 180, overflowY: "auto",
        }}>
          {body}
        </div>
      )}
    </Widget>
  );
}
