/**
 * CafeSpecialsWidget — dashboard mini-widget
 *
 * Shows this week's cafe specials for the configured campus.
 *
 * Props:
 *   config  { campus: string }
 */

import Widget from "../Widget.jsx";
import { CAMPUS_COLOR } from "../CampusSelector.jsx";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { subscribeCafeSpecials } from "../../firebase.js";

const AQUA = "#00A2B4";
const TSEC = "#7aaec8";
const TPRI = "#FFFFFF";

function currentMonday() {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export default function CafeSpecialsWidget({ config = {} }) {
  const campus      = config.campus ?? "Mesa Lab";
  const accentColor = CAMPUS_COLOR[campus] ?? AQUA;
  const weekOf      = currentMonday();

  const { data: specials, loading, error } = useWidgetSubscription(
    (cb) => subscribeCafeSpecials(weekOf, campus, cb),
    [weekOf, campus]
  );

  const body = specials?.body ?? "";

  return (
    <Widget
      title="Cafe Specials"
      subtitle={campus}
      icon="🍽️"
      accentColor={accentColor}
      loading={loading}
      error={error}
      empty={!loading && !error && !body}
      emptyIcon="🍽️"
      emptyMessage="No specials posted for this week."
    >
      {body && (
        <div style={{
          fontSize: 12, color: TPRI, lineHeight: 1.65,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: 180, overflowY: "auto",
        }}>
          {body}
        </div>
      )}
    </Widget>
  );
}
