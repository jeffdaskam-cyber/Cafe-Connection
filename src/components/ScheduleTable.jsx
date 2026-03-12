/**
 * ScheduleTable — renders the weekly staff schedule from Google Sheets data.
 */

import { COLORS } from "../theme.js";

const SCHED_HEADER_BG   = "#00357A";
const SCHED_SUBHEAD_BG  = "#1a4a7a";
const SCHED_SUBHEAD_ALT = "#0a2a5a";
const YELLOW = "#FFDD31";

// ── Color classifier ───────────────────────────────────────────────────────────
export function classifyColor(rgb) {
  if (!rgb) return null;
  const { r, g, b } = rgb;
  if (b > 180 && r < 100 && g > 180) return { label: "WFH", bg: "#00BCD422", border: "#00BCD4", text: "#00BCD4" };
  if (r < 100 && g > 180 && b > 200) return { label: "WFH", bg: "#00BCD422", border: "#00BCD4", text: "#00BCD4" };
  if (r > 200 && g > 200 && b < 80)  return { label: "PTO", bg: "#FFDD3122", border: YELLOW,    text: YELLOW   };
  if (r < 60  && g < 100 && b > 120) return { label: "header",    bg: SCHED_HEADER_BG,  border: SCHED_HEADER_BG,  text: "#FFFFFF" };
  if (r < 100 && g < 140 && b > 150) return { label: "subheader", bg: SCHED_SUBHEAD_BG, border: SCHED_SUBHEAD_BG, text: "#FFFFFF" };
  return null;
}

// ── Merge consecutive rows that share the same name (col A merged cell pattern) ──
// The Sheets API returns merged-name rows as two flat rows with the name repeated.
// We collapse them so each staff member shows as one row with stacked cell content.
function mergeStaffRows(rows, colorMap, startRi) {
  const merged = [];
  let i = 0;
  while (i < rows.length) {
    const { cells, ri } = rows[i];
    const name = (cells[0] || "").toString().trim();

    // Look ahead: if next row has the same non-empty name, merge them
    if (
      name &&
      i + 1 < rows.length &&
      (rows[i + 1].cells[0] || "").toString().trim() === name
    ) {
      const next = rows[i + 1];
      // Build merged cells: name col stays, data cols get [primary, secondary]
      const mergedCells = cells.map((val, ci) => {
        if (ci === 0) return val; // name col — same in both rows
        const secondary = (next.cells[ci] || "").toString().trim();
        const primary   = (val || "").toString().trim();
        return { primary, secondary };
      });
      merged.push({ cells: mergedCells, ri, ri2: next.ri, isMerged: true });
      i += 2;
    } else {
      merged.push({ cells, ri, isMerged: false });
      i += 1;
    }
  }
  return merged;
}

// ── ScheduleTable component ────────────────────────────────────────────────────
export default function ScheduleTable({ rows, colorMap }) {
  if (!rows || rows.length === 0) return null;

  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(cell))
  );
  const dayHeaders = dayHeaderIdx >= 0 ? rows[dayHeaderIdx] : [];
  const dateRow    = dayHeaderIdx >= 0 && rows[dayHeaderIdx + 1] ? rows[dayHeaderIdx + 1] : [];

  const colHeaders = dayHeaders.map((h, i) => {
    const date = dateRow[i] || "";
    if (!h && !date) return null;
    return { day: h, date };
  });

  const sections = [];
  let currentSection = null;

  rows.forEach((row, ri) => {
    if (ri <= dayHeaderIdx + 1) return;

    const color     = colorMap[`${ri},0`] || colorMap[`${ri},1`];
    const colorInfo = classifyColor(color);
    const firstCell = (row[0] || row[1] || "").toString().trim();

    if (!firstCell && row.every(c => !c)) return;

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
      {sections.map((section, si) => {
        const mergedRows = mergeStaffRows(section.rows, colorMap, 0);

        return (
          <div key={si} style={{
            background: COLORS.BG_SURFACE, borderRadius: 12,
            border: `1px solid ${COLORS.BORDER}`,
            boxShadow: "0 1px 4px rgba(1,24,55,0.06)",
            overflow: "hidden",
          }}>
            {/* Section header */}
            <div style={{
              background: SCHED_HEADER_BG, padding: "10px 18px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: "#FFFFFF",
                fontFamily: "'Poppins',sans-serif", letterSpacing: "0.03em",
              }}>{section.title}</div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse",
                fontSize: 11, fontFamily: "'Poppins',sans-serif" }}>
                <thead>
                  <tr style={{ background: COLORS.BG_SURFACE_ALT }}>
                    <th style={{ padding: "8px 14px", textAlign: "left",
                      color: COLORS.TEXT_MUTED, fontWeight: 600,
                      borderBottom: `1px solid ${COLORS.BORDER}`,
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
                  {mergedRows.map((rowData, rowIdx) => {
                    const { cells, ri, ri2, isMerged } = rowData;
                    const nameCell = (cells[0] || "").toString().trim();
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
                        {/* Name cell */}
                        <td style={{
                          padding: "7px 14px",
                          color: nameCell ? COLORS.TEXT_PRIMARY : COLORS.TEXT_MUTED,
                          fontWeight: nameCell ? 600 : 400, whiteSpace: "nowrap",
                          verticalAlign: "middle",
                        }}>
                          {nameCell || "—"}
                        </td>

                        {/* Day cells */}
                        {dayCols.map((_, ci) => {
                          const cellIdx = ci + 1;

                          // For merged rows, cells[ci+1] is { primary, secondary }
                          // For plain rows, it's a string
                          const cellData  = isMerged ? cells[cellIdx] : null;
                          const primary   = isMerged
                            ? (cellData?.primary   || "")
                            : (cells[cellIdx] || "").toString().trim();
                          const secondary = isMerged
                            ? (cellData?.secondary || "")
                            : "";

                          // Use primary row's color for the cell background
                          const cellRgb = colorMap[`${ri},${cellIdx}`]
                            || (isMerged ? colorMap[`${ri2},${cellIdx}`] : null);
                          const info    = classifyColor(cellRgb);

                          const hasContent = primary || secondary;

                          return (
                            <td key={ci} style={{
                              padding: "6px 10px", textAlign: "center",
                              background: info ? info.bg : "transparent",
                              verticalAlign: "middle",
                            }}>
                              {hasContent ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                                  {/* Primary line — time/shift */}
                                  {primary && (
                                    <span style={{
                                      display: "inline-block",
                                      padding: info ? "2px 8px" : "0",
                                      borderRadius: info ? 20 : 0,
                                      border: info ? `1px solid ${info.border}44` : "none",
                                      color: info ? info.text : COLORS.TEXT_SECONDARY,
                                      fontWeight: info ? 700 : 500,
                                      fontSize: 10, whiteSpace: "nowrap",
                                    }}>
                                      {primary}
                                      {info?.label && info.label !== "header" && (
                                        <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>
                                          ({info.label})
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {/* Secondary line — event/context note */}
                                  {secondary && (
                                    <span style={{
                                      display: "inline-block",
                                      color: COLORS.TEXT_MUTED,
                                      fontSize: 9,
                                      fontStyle: "italic",
                                      whiteSpace: "nowrap",
                                    }}>
                                      {secondary}
                                    </span>
                                  )}
                                </div>
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
        );
      })}
    </div>
  );
}
