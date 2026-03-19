/**
 * WeeklyExceptions — read-only PTO / WFH exception list for the current week.
 * Parses colorMap from /api/get-schedule, groups by day, filters to today+.
 */

import { useCallback } from "react";
import { fetchSchedule } from "../firebase.js";
import { useWidget }     from "../hooks/useWidget.js";

// ── Color classifier ────────────────────────────────────────────────────────
function classifyRgb({ r, g, b }) {
  if (r > 180 && g > 180 && b < 100) return "PTO";
  if (b > 180 && g > 180 && r < 100) return "WFH";
  return null;
}

// ── Date parser — handles "3/17", "3/17/26", full date strings ───────────────
function parseDateValue(val, fallbackYear) {
  if (!val) return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const mo   = parseInt(m[1], 10);
    const day  = parseInt(m[2], 10);
    const rawY = m[3] ? parseInt(m[3], 10) : fallbackYear;
    const yr   = rawY < 100 ? 2000 + rawY : rawY;
    return new Date(yr, mo - 1, day);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ── Main parser ──────────────────────────────────────────────────────────────
function buildExceptions(rows, colorMap) {
  if (!rows?.length) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the row that has "Monday", "Tuesday", etc.
  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(String(cell ?? "")))
  );
  if (dayHeaderIdx < 0) {
    console.warn("[WeeklyExceptions] Could not find day header row. First 5 rows:", rows.slice(0, 5));
    return [];
  }

  const dayHeaders = rows[dayHeaderIdx]     ?? [];
  const dateRow    = rows[dayHeaderIdx + 1] ?? [];

  // Map column index → JS Date
  const colToDate = {};
  dayHeaders.forEach((_, ci) => {
    const d = parseDateValue(dateRow[ci], today.getFullYear());
    if (d) colToDate[ci] = d;
  });

  const exceptions = [];

  for (const key of Object.keys(colorMap)) {
    const [riStr, ciStr] = key.split(",");
    const ri = parseInt(riStr, 10);
    const ci = parseInt(ciStr, 10);

    if (ri <= dayHeaderIdx + 1) continue;   // skip header area
    const date = colToDate[ci];
    if (!date || date < today) continue;     // skip past days

    const type = classifyRgb(colorMap[key]);
    if (!type) continue;

    const name = String(rows[ri]?.[0] ?? "").trim();
    if (!name) continue;

    exceptions.push({ name, date, type });
  }

  return exceptions;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function dayHeading(date) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${date.getMonth() + 1}-${date.getDate()}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CARD = {
  background:   "#00357A",
  border:       "1px solid #00A2B4",
  borderRadius: 12,
  padding:      "18px 20px",
  fontFamily:   "'Poppins', sans-serif",
};
const TITLE = {
  color:        "#FFFFFF",
  fontSize:     13,
  fontWeight:   700,
  letterSpacing: "0.01em",
  marginBottom: 14,
};
const DAY_LABEL = {
  color:        "#FFFFFF",
  fontSize:     12,
  fontWeight:   700,
  marginBottom: 3,
};
const NAME_LINE = {
  color:        "#5A7A91",
  fontSize:     11,
  lineHeight:   1.65,
};
const MUTED = {
  color:        "#5A7A91",
  fontSize:     12,
  paddingTop:   4,
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function WeeklyExceptions() {
  const fetcher = useCallback(() => fetchSchedule(), []);
  const { data, loading, error } = useWidget(fetcher, []);

  let body;

  if (loading) {
    body = <div style={MUTED}>Loading…</div>;
  } else if (error) {
    body = <div style={MUTED}>Could not load schedule.</div>;
  } else {
    const exceptions = data ? buildExceptions(data.rows, data.colorMap) : [];

    if (exceptions.length === 0) {
      body = <div style={MUTED}>No exceptions this week.</div>;
    } else {
      // Group by date
      const byDate = {};
      exceptions.forEach(ex => {
        const key = ex.date.toISOString().slice(0, 10);
        if (!byDate[key]) byDate[key] = { date: ex.date, items: [] };
        byDate[key].items.push(ex);
      });

      const days = Object.values(byDate)
        .sort((a, b) => a.date - b.date);

      days.forEach(d => d.items.sort((a, b) => a.name.localeCompare(b.name)));

      body = days.map(({ date, items }) => (
        <div key={date.toISOString()} style={{ marginBottom: 14 }}>
          <div style={DAY_LABEL}>{dayHeading(date)}</div>
          {items.map((item, i) => (
            <div key={i} style={NAME_LINE}>
              {item.name} — {item.type === "WFH" ? "Home" : "PTO"}
            </div>
          ))}
        </div>
      ));
    }
  }

  return (
    <div style={CARD}>
      <div style={TITLE}>Schedule Notes</div>
      {body}
    </div>
  );
}
