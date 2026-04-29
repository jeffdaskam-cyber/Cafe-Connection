/**
 * ScheduleTable — renders the weekly staff schedule from Google Sheets data.
 */

import { COLORS } from "../theme.js";

const SCHED_HEADER_BG   = COLORS._DARKBLUE;
const SCHED_SUBHEAD_BG  = COLORS.MOBILE_SUBHEAD_BG;
const SCHED_SUBHEAD_ALT = COLORS.MOBILE_SUBHEAD_ALT;

// Only these labels create top-level sections.
const ALLOWED_HEADERS = ["CG2", "Banquets", "Center Green", "Foothills", "Mesa"];

// ── Color classifier ───────────────────────────────────────────────────────────
export function classifyColor(rgb) {
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const WFH_BG = `${COLORS.SCHED_WFH}22`; // 22 = alpha
  if (b > 180 && r < 100 && g > 180) return { label: "WFH", bg: WFH_BG, border: COLORS.SCHED_WFH, text: COLORS.SCHED_WFH };
  if (r < 100 && g > 180 && b > 200) return { label: "WFH", bg: WFH_BG, border: COLORS.SCHED_WFH, text: COLORS.SCHED_WFH };
  if (r > 200 && g > 200 && b < 80)  return { label: "PTO", bg: COLORS._DARKBLUE, border: COLORS.AQUA, text: COLORS.AQUA };
  if (r < 60  && g < 100 && b > 120) return { label: "header",    bg: SCHED_HEADER_BG,  border: SCHED_HEADER_BG,  text: COLORS.TEXT_ON_ACCENT };
  if (r < 100 && g < 140 && b > 150) return { label: "subheader", bg: SCHED_SUBHEAD_BG, border: SCHED_SUBHEAD_BG, text: COLORS.TEXT_ON_ACCENT };
  return null;
}

// ── Format a date string from the Sheets API into "Mon 3/9" style ─────────────
function formatDateHeader(raw) {
  if (!raw) return raw;
  // Sheets returns dates as e.g. "Mon Mar 09 2026 00:00:00 GMT+0000"
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const day  = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const date = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
  return { day, date };
}

// ── Check if columns B–F contain date values ─────────────────────────────────
function hasDateColumns(row) {
  const dateCols = row.slice(1, 6).filter(Boolean);
  if (dateCols.length < 3) return false;
  return dateCols.every(v => {
    const s = String(v);
    return s.includes("2026") || s.includes("2025") || /\d{1,2}\/\d{1,2}/.test(s);
  });
}

// ── Detect if a row is a campus header row (known campus name + dates) ────────
function isCampusHeaderRow(row) {
  if (!row[0]) return false;
  const label = row[0].toString().trim();
  return ALLOWED_HEADERS.includes(label) && hasDateColumns(row);
}

// ── Merge consecutive rows sharing same name (col-A merged cell pattern) ──────
function mergeStaffRows(rows) {
  const merged = [];
  let i = 0;
  while (i < rows.length) {
    const { cells, ri } = rows[i];
    const name = (cells[0] || "").toString().trim();

    if (
      name &&
      i + 1 < rows.length &&
      (rows[i + 1].cells[0] || "").toString().trim() === name
    ) {
      const next = rows[i + 1];
      const mergedCells = cells.map((val, ci) => {
        if (ci === 0) return val;
        const primary   = (val || "").toString().trim();
        const secondary = (next.cells[ci] || "").toString().trim();
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

  // ── Find the global day-name header row (Mon/Tue/Wed…) ──────────────────────
  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(cell))
  );
  const dayHeaders = dayHeaderIdx >= 0 ? rows[dayHeaderIdx] : [];
  const dateRow    = dayHeaderIdx >= 0 && rows[dayHeaderIdx + 1] ? rows[dayHeaderIdx + 1] : [];

  // Global column headers (used by top sections like CG2, Banquets, PTO)
  const globalDayCols = dayHeaders
    .map((h, i) => {
      const date = dateRow[i] || "";
      if (!h && !date) return null;
      return { day: h, date };
    })
    .filter(h => h && (h.day || h.date))
    .slice(0, 5);

  // ── Parse all rows into sections ─────────────────────────────────────────────
  const sections = [];
  let currentSection = null;

  rows.forEach((row, ri) => {
    if (ri <= dayHeaderIdx + 1) return;

    const color     = colorMap[`${ri},0`] || colorMap[`${ri},1`];
    const colorInfo = classifyColor(color);
    const firstCell = (row[0] || row[1] || "").toString().trim();

    if (!firstCell && row.every(c => !c)) return; // skip blank rows

    // ── Campus header row (e.g. "Center Green" + dates in B–F) ─────────────
    // These start a new top-level section and carry their own column headers.
    if (isCampusHeaderRow(row)) {
      const localCols = row.slice(1, 6).map(v => formatDateHeader(String(v)));
      currentSection = {
        title: firstCell,
        rows: [],
        colorInfo,
        isCampus: true,
        dayCols: localCols,          // use these instead of globalDayCols
        subSections: [],
        currentSub: null,
      };
      sections.push(currentSection);
      return;
    }

    // All rows inside a campus section are staff rows (no sub-sections)
    if (currentSection?.isCampus) {
      if (!currentSection.currentSub) {
        currentSection.currentSub = { title: null, rows: [] };
        currentSection.subSections.push(currentSection.currentSub);
      }
      currentSection.currentSub.rows.push({ cells: row, ri });
      return;
    }

    // ── Top-level section header (CG2, Banquets) ────────────────────────────
    const isHeader = ALLOWED_HEADERS.includes(firstCell);

    if (isHeader && firstCell) {
      currentSection = {
        title: firstCell,
        rows: [],
        colorInfo,
        isCampus: false,
        dayCols: globalDayCols,
      };
      sections.push(currentSection);
      return;
    }

    if (currentSection && !currentSection.isCampus) {
      currentSection.rows.push({ cells: row, ri });
    }
  });

  // ── Cell renderer (shared by both section types) ─────────────────────────────
  function renderCell(cellData, isMerged, ri, ri2, ci, info) {
    const primary   = isMerged ? (cellData?.primary   || "") : (cellData || "").toString().trim();
    const secondary = isMerged ? (cellData?.secondary || "") : "";
    const cellRgb   = colorMap[`${ri},${ci}`] || (isMerged && ri2 ? colorMap[`${ri2},${ci}`] : null);
    const cellInfo  = info || classifyColor(cellRgb);
    const hasContent = primary || secondary;

    return hasContent ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
        {primary && (
          <span style={{
            display: "inline-block",
            padding: cellInfo ? "2px 8px" : "0",
            borderRadius: cellInfo ? 20 : 0,
            border: cellInfo ? `1px solid ${cellInfo.border}44` : "none",
            color: cellInfo ? cellInfo.text : COLORS.TEXT_SECONDARY,
            fontWeight: cellInfo ? 700 : 500,
            fontSize: 10, whiteSpace: "nowrap",
          }}>
            {primary}
            {cellInfo?.label && !["header","subheader"].includes(cellInfo.label) && (
              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>({cellInfo.label})</span>
            )}
          </span>
        )}
        {secondary && (
          <span style={{
            color: COLORS.TEXT_MUTED, fontSize: 9,
            fontStyle: "italic", whiteSpace: "nowrap",
          }}>
            {secondary}
          </span>
        )}
      </div>
    ) : (
      <span style={{ color: COLORS.TEXT_DISABLED, fontSize: 10 }}>—</span>
    );
  }

  // ── Table renderer (shared) ──────────────────────────────────────────────────
  function renderTable(mergedRows, dayCols) {
    return (
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
                  {typeof h === "object" && h.day ? (
                    <>
                      <div style={{ color: COLORS.TEXT_PRIMARY, fontWeight: 700 }}>{h.day}</div>
                      <div style={{ color: COLORS.TEXT_MUTED, fontSize: 10 }}>{h.date}</div>
                    </>
                  ) : (
                    <div style={{ color: COLORS.TEXT_PRIMARY, fontWeight: 700 }}>{h?.day || h}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mergedRows.map(({ cells, ri, ri2, isMerged }, rowIdx) => {
              const nameCell = (cells[0] || "").toString().trim();

              return (
                <tr key={rowIdx} style={{
                  borderBottom: `1px solid ${COLORS.BORDER}`,
                  background: rowIdx % 2 === 0 ? "transparent" : COLORS.BG_SURFACE_ALT,
                }}>
                  <td style={{
                    padding: "7px 14px",
                    color: nameCell ? COLORS.TEXT_PRIMARY : COLORS.TEXT_MUTED,
                    fontWeight: nameCell ? 600 : 400,
                    whiteSpace: "nowrap", verticalAlign: "middle",
                  }}>
                    {nameCell || "—"}
                  </td>
                  {dayCols.map((_, ci) => {
                    const cellIdx = ci + 1;
                    const cellData = cells[cellIdx];
                    const cellRgb  = colorMap[`${ri},${cellIdx}`]
                      || (isMerged ? colorMap[`${ri2},${cellIdx}`] : null);
                    return (
                      <td key={ci} style={{
                        padding: "6px 10px", textAlign: "center",
                        background: classifyColor(cellRgb)?.bg || "transparent",
                        verticalAlign: "middle",
                      }}>
                        {renderCell(cellData, isMerged, ri, ri2, cellIdx, null)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sections.map((section, si) => (
        <div key={si} style={{
          background: COLORS.BG_SURFACE, borderRadius: 12,
          border: `1px solid ${COLORS.BORDER}`,
          boxShadow: "0 1px 4px rgba(1,24,55,0.06)",
          overflow: "hidden",
        }}>
          {/* Section header bar */}
          <div style={{
            background: SCHED_HEADER_BG, padding: "10px 18px",
            display: "flex", alignItems: "center",
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: COLORS.TEXT_ON_ACCENT,
              fontFamily: "'Poppins',sans-serif", letterSpacing: "0.03em",
            }}>{section.title}</div>
          </div>

          {section.isCampus ? (
            // ── Campus layout: sub-sections with their own sub-headers ────────
            <div style={{ display: "flex", flexDirection: "column" }}>
              {section.subSections.map((sub, subi) => (
                <div key={subi}>
                  {sub.title && (
                    <div style={{
                      padding: "7px 18px",
                      background: SCHED_SUBHEAD_BG,
                      color: COLORS.TEXT_ON_ACCENT,
                      fontSize: 11, fontWeight: 600,
                      fontFamily: "'Poppins',sans-serif",
                      letterSpacing: "0.05em",
                      borderTop: subi > 0 ? `1px solid ${COLORS.BORDER}` : "none",
                    }}>
                      {sub.title}
                    </div>
                  )}
                  {renderTable(mergeStaffRows(sub.rows), section.dayCols)}
                </div>
              ))}
            </div>
          ) : (
            // ── Standard layout (CG2, Banquets, PTO) ─────────────────────────
            renderTable(mergeStaffRows(section.rows), section.dayCols)
          )}
        </div>
      ))}
    </div>
  );
}
