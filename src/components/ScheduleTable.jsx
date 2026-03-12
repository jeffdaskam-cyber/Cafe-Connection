/**
 * ScheduleTable — renders the weekly staff schedule from Google Sheets data.
 *
 * Extracted from WeeklyOps.jsx in Phase 6 so it can be used inside a
 * Widget (expandable, printable) without duplicating the parsing logic.
 *
 * Props:
 *   rows      {string[][]} — 2-D cell array from the Sheets API
 *   colorMap  {object}     — "row,col" → { r, g, b } background color map
 */

import { COLORS } from "../theme.js";

// Schedule section headers intentionally keep dark-blue backgrounds
// (they reflect the actual color-coded structure from Google Sheets)
const SCHED_HEADER_BG   = "#00357A";
const SCHED_SUBHEAD_BG  = "#1a4a7a";
const SCHED_SUBHEAD_ALT = "#0a2a5a";
const YELLOW = "#FFDD31";

// ── Color classifier ───────────────────────────────────────────────────────────
// Maps RGB values from Google Sheets cell backgrounds to semantic meanings.
export function classifyColor(rgb) {
  if (!rgb) return null;
  const { r, g, b } = rgb;
  // Cyan / light blue — WFH / Remote
  if (b > 180 && r < 100 && g > 180) return { label: "WFH",       bg: "#00BCD422", border: "#00BCD4", text: "#00BCD4" };
  if (r < 100 && g > 180 && b > 200) return { label: "WFH",       bg: "#00BCD422", border: "#00BCD4", text: "#00BCD4" };
  // Yellow — PTO / Sick
  if (r > 200 && g > 200 && b < 80)  return { label: "PTO",       bg: "#FFDD3122", border: YELLOW,    text: YELLOW   };
  // Dark blue — section header rows (intentionally dark on the schedule)
  if (r < 60  && g < 100 && b > 120) return { label: "header",    bg: SCHED_HEADER_BG,  border: SCHED_HEADER_BG,  text: "#FFFFFF" };
  // Medium blue — sub-header rows (e.g. "Café Thru Line")
  if (r < 100 && g < 140 && b > 150) return { label: "subheader", bg: SCHED_SUBHEAD_BG, border: SCHED_SUBHEAD_BG, text: "#FFFFFF" };
  return null;
}

// ── ScheduleTable component ────────────────────────────────────────────────────
export default function ScheduleTable({ rows, colorMap }) {
  if (!rows || rows.length === 0) return null;

  // Find the day header row (contains Mon/Tue/Wed/Thu/Fri)
  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(cell))
  );
  const dayHeaders = dayHeaderIdx >= 0 ? rows[dayHeaderIdx] : [];
  const dateRow    = dayHeaderIdx >= 0 && rows[dayHeaderIdx + 1] ? rows[dayHeaderIdx + 1] : [];

  // Build merged day + date column headers
  const colHeaders = dayHeaders.map((h, i) => {
    const date = dateRow[i] || "";
    if (!h && !date) return null;
    return { day: h, date };
  });

  // Parse rows into named sections based on background color / capitalisation
  const sections = [];
  let currentSection = null;

  rows.forEach((row, ri) => {
    if (ri <= dayHeaderIdx + 1) return; // skip the day/date header rows themselves

    const color     = colorMap[`${ri},0`] || colorMap[`${ri},1`];
    const colorInfo = classifyColor(color);
    const firstCell = (row[0] || row[1] || "").toString().trim();

    if (!firstCell && row.every(c => !c)) return; // skip blank rows

    // Detect a new section: dark-blue background OR short all-caps text in col A/B
    const isHeader = colorInfo?.label === "header" ||
      (firstCell && firstCell.length < 30 && firstCell === firstCell.toUpperCase() && !firstCell.match(/^\d/));

    if (isHeader && firstCell) {
      currentSection = { title: firstCell, rows: [], colorInfo };
      sections.push(currentSection);
      return;
    }

    if (currentSection) {
      currentSection.rows.push({ cells: row, ri });
    }
  });

  const dayCols = colHeaders.filter(h => h && (h.day || h.date)).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sections.map((section, si) => (
        <div key={si} style={{
          background: COLORS.BG_SURFACE, borderRadius: 12,
          border: `1px solid ${COLORS.BORDER}`,
          boxShadow: "0 1px 4px rgba(1,24,55,0.06)",
          overflow: "hidden",
        }}>
          {/* Section header bar — intentionally dark-blue (schedule branding) */}
          <div style={{
            background: SCHED_HEADER_BG, padding: "10px 18px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#FFFFFF",
              fontFamily: "'Poppins',sans-serif", letterSpacing: "0.03em",
            }}>{section.title}</div>
          </div>

          {/* Scrollable table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse",
              fontSize: 11, fontFamily: "'Poppins',sans-serif" }}>
              <thead>
                <tr style={{ background: COLORS.BG_SURFACE_ALT }}>
                  <th style={{ padding: "8px 14px", textAlign: "left",
                    color: COLORS.TEXT_MUTED,
                    fontWeight: 600, borderBottom: `1px solid ${COLORS.BORDER}`,
                    whiteSpace: "nowrap", minWidth: 100 }}>Staff</th>
                  {dayCols.map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: "center",
                      color: COLORS.TEXT_MUTED, fontWeight: 600,
                      borderBottom: `1px solid ${COLORS.BORDER}`,
                      whiteSpace: "nowrap", minWidth: 110 }}>
                      <div style={{ color: COLORS.TEXT_PRIMARY, fontWeight: 700 }}>{h.day}</div>
                      <div style={{ color: COLORS.TEXT_MUTED, fontSize: 10 }}>{h.date}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map(({ cells, ri }, rowIdx) => {
                  const nameCell    = (cells[0] || cells[1] || "").toString().trim();
                  const isSubHeader = colorMap[`${ri},0`] &&
                    classifyColor(colorMap[`${ri},0`])?.label === "subheader";

                  if (isSubHeader) {
                    return (
                      <tr key={rowIdx}>
                        <td colSpan={dayCols.length + 1} style={{
                          padding: "6px 14px", background: SCHED_SUBHEAD_ALT,
                          color: COLORS.LAQUA, fontWeight: 600, fontSize: 10,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                        }}>{nameCell}</td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={rowIdx} style={{
                      borderBottom: `1px solid ${COLORS.BORDER}`,
                      background: rowIdx % 2 === 0 ? "transparent" : COLORS.BG_SURFACE_ALT,
                    }}>
                      <td style={{
                        padding: "7px 14px",
                        color: nameCell ? COLORS.TEXT_PRIMARY : COLORS.TEXT_MUTED,
                        fontWeight: nameCell ? 600 : 400, whiteSpace: "nowrap",
                      }}>
                        {nameCell || "—"}
                      </td>
                      {dayCols.map((_, ci) => {
                        const cellIdx  = ci + 1;
                        const cellVal  = (cells[cellIdx] || "").toString().trim();
                        const cellRgb  = colorMap[`${ri},${cellIdx}`];
                        const info     = classifyColor(cellRgb);

                        return (
                          <td key={ci} style={{
                            padding: "6px 10px", textAlign: "center",
                            background: info ? info.bg : "transparent",
                          }}>
                            {cellVal ? (
                              <span style={{
                                display: "inline-block",
                                padding: info ? "2px 8px" : "0",
                                borderRadius: info ? 20 : 0,
                                border: info ? `1px solid ${info.border}44` : "none",
                                color: info ? info.text : COLORS.TEXT_SECONDARY,
                                fontWeight: info ? 700 : 400,
                                fontSize: 10, whiteSpace: "nowrap",
                              }}>
                                {cellVal}
                                {info?.label && info.label !== "header" && (
                                  <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>
                                    ({info.label})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: COLORS.TEXT_DISABLED, fontSize: 10 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
