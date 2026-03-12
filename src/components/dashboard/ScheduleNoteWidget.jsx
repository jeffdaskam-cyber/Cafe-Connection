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
import { COLORS } from "../../theme.js";

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
      accentColor={COLORS.AQUA}
      loading={loading}
      error={error}
      empty={!loading && !error && !body}
      emptyIcon="📝"
      emptyMessage="No note posted for this week."
    >
      {body && (
        <div>
          <div style={{
            fontSize: 12, color: COLORS.TEXT_PRIMARY, lineHeight: 1.65, fontWeight: 400,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 160, overflowY: "auto",
          }}>
            {body}
          </div>
          {author && (
            <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, marginTop: 10,
              borderTop: `1px solid ${COLORS.BORDER}`, paddingTop: 8 }}>
              Posted by {author}
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}
