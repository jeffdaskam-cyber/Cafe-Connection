/**
 * ScheduleNoteWidget — dashboard mini-widget
 *
 * Shows this week's manager note from the schedule_notes collection.
 *
 * Props:
 *   config  {} (no campus — schedule note is org-wide per week)
 */

import Widget from "../Widget.jsx";
import { useWidgetSubscription } from "../../hooks/useWidget.js";
import { subscribeScheduleNote } from "../../firebase.js";

const AQUA = "#00A2B4";
const TSEC = "#7aaec8";
const TPRI = "#FFFFFF";

function currentMonday() {
  const d   = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export default function ScheduleNoteWidget({ config = {} }) {
  const weekOf = currentMonday();

  const { data: note, loading, error } = useWidgetSubscription(
    (cb) => subscribeScheduleNote(weekOf, cb),
    [weekOf]
  );

  const body    = note?.body ?? "";
  const author  = note?.updated_by ?? null;

  return (
    <Widget
      title="Manager's Note"
      subtitle={`Week of ${weekOf}`}
      icon="📝"
      accentColor={AQUA}
      loading={loading}
      error={error}
      empty={!loading && !error && !body}
      emptyIcon="📝"
      emptyMessage="No note posted for this week."
    >
      {body && (
        <div>
          <div style={{
            fontSize: 12, color: TPRI, lineHeight: 1.65, fontWeight: 400,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 160, overflowY: "auto",
          }}>
            {body}
          </div>
          {author && (
            <div style={{ fontSize: 10, color: `${TSEC}88`, marginTop: 10,
              borderTop: "1px solid #003070", paddingTop: 8 }}>
              Posted by {author}
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}
