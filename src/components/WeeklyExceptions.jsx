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

// ── Parse a sheet date value → local-midnight JS Date ───────────────────────
// Handles: "3/17", "3/17/26", "3/17/2026",
//          "Mon Mar 17 2026 00:00:00 GMT+0000" (Sheets full date string)
function parseDateToLocal(val, fallbackYear) {
  if (!val) return null;
  const s = String(val).trim();

  // Slash format
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const mo  = parseInt(slash[1], 10);
    const day = parseInt(slash[2], 10);
    const rawY = slash[3] ? parseInt(slash[3], 10) : fallbackYear;
    const yr  = rawY < 100 ? 2000 + rawY : rawY;
    return new Date(yr, mo - 1, day); // already local midnight
  }

  // Full date string — parse then extract UTC fields to avoid TZ shift
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ── Build column→date map ────────────────────────────────────────────────────
// Campus header rows embed dates in cols 1-5 (e.g. "Mesa Lab | 3/17 | 3/18 …")
// The global dateRow (dayHeaderIdx+1) may also carry them.
// We scan both to ensure colToDate is populated regardless of sheet layout.
function buildColToDate(rows, dayHeaderIdx, fallbackYear) {
  const colToDate = {};

  // 1. Row immediately after the day-name header
  const dateRow = rows[dayHeaderIdx + 1] ?? [];
  dateRow.forEach((val, ci) => {
    const d = parseDateToLocal(val, fallbackYear);
    if (d) colToDate[ci] = d;
  });

  // 2. Any campus-header-style rows: non-empty col 0, date strings in cols 1-5
  rows.forEach(row => {
    if (!row[0]) return;
    const dateCols = (row.slice(1, 6) ?? []).filter(Boolean);
    if (dateCols.length < 3) return;
    const allDates = dateCols.every(v => {
      const s = String(v);
      return /\d{4}/.test(s) || /\d{1,2}\/\d{1,2}/.test(s);
    });
    if (!allDates) return;
    row.slice(1, 6).forEach((val, i) => {
      const d = parseDateToLocal(val, fallbackYear);
      if (d) colToDate[i + 1] = d;
    });
  });

  return colToDate;
}

// ── Main parser ──────────────────────────────────────────────────────────────
function buildExceptions(rows, colorMap) {
  if (!rows?.length) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(String(cell ?? "")))
  );

  if (dayHeaderIdx < 0) {
    console.warn("[WeeklyExceptions] Day header row not found. First 5 rows:", rows.slice(0, 5));
    return [];
  }

  const colToDate = buildColToDate(rows, dayHeaderIdx, today.getFullYear());

  console.log("[WeeklyExceptions] colToDate:", Object.fromEntries(
    Object.entries(colToDate).map(([k, v]) => [k, v.toLocaleDateString()])
  ));

  const exceptions = [];

  for (const key of Object.keys(colorMap)) {
    const [riStr, ciStr] = key.split(",");
    const ri = parseInt(riStr, 10);
    const ci = parseInt(ciStr, 10);

    if (ri <= dayHeaderIdx + 1) continue;

    const date = colToDate[ci];
    if (!date || date < today) continue;

    const type = classifyRgb(colorMap[key]);
    if (!type) continue;

    const name = String(rows[ri]?.[0] ?? "").trim();
    if (!name) continue;

    exceptions.push({ name, date, type });
  }

  console.log("[WeeklyExceptions]", exceptions.length, "exceptions found:", exceptions.map(e => `${e.name} ${e.type} ${e.date.toLocaleDateString()}`));
  return exceptions;
}

// ── Formatting ───────────────────────────────────────────────────────────────
function dayHeading(date) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${date.getMonth() + 1}-${date.getDate()}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CARD      = { background: "#00357A", border: "1px solid #00A2B4", borderRadius: 12, padding: "18px 20px", fontFamily: "'Poppins', sans-serif" };
const TITLE     = { color: "#FFFFFF", fontSize: 13, fontWeight: 700, letterSpacing: "0.01em", marginBottom: 14 };
const DAY_LABEL = { color: "#FFFFFF", fontSize: 12, fontWeight: 700, marginBottom: 3 };
const NAME_LINE = { color: "#5A7A91", fontSize: 11, lineHeight: 1.65 };
const MUTED     = { color: "#5A7A91", fontSize: 12, paddingTop: 4 };

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
      const byDate = {};
      exceptions.forEach(ex => {
        const key = ex.date.toISOString().slice(0, 10);
        if (!byDate[key]) byDate[key] = { date: ex.date, items: [] };
        byDate[key].items.push(ex);
      });

      const days = Object.values(byDate).sort((a, b) => a.date - b.date);
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
