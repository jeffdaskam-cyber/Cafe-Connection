import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { fetchSchedule, uploadEventOrder, subscribeEventOrders } from "./firebase.js";

// ── Brand Palette ─────────────────────────────────────────────────────────────
const SPACE    = "#011837";
const DARKBLUE = "#00357A";
const PANEL    = "#001f4d";
const BORDER   = "#003070";
const TPRI     = "#FFFFFF";
const TSEC     = "#7aaec8";
const TMID     = "#b0d0e8";
const AQUA     = "#00A2B4";
const LAQUA    = "#34E1F4";
const ORANGE   = "#FAA119";
const YELLOW   = "#FFDD31";

// ── Wave SVG ──────────────────────────────────────────────────────────────────
function WaveGraphic({ color = AQUA, opacity = 0.18, width = 420, height = 80 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
      {[0, 14, 28, 42].map((offset, i) => (
        <path key={i}
          d={`M0,${30+offset} C80,${10+offset} 160,${50+offset} 240,${28+offset} S380,${8+offset} ${width},${30+offset}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={opacity - i * 0.02} />
      ))}
    </svg>
  );
}

// ── Color detection helpers ───────────────────────────────────────────────────
// Maps RGB from Google Sheets to a semantic meaning and display color
function classifyColor(rgb) {
  if (!rgb) return null;
  const { r, g, b } = rgb;
  // Cyan / light blue — WFH / Remote
  if (b > 180 && r < 100 && g > 180) return { label: "WFH", bg: "#00BCD422", border: "#00BCD4", text: "#00BCD4" };
  if (r < 100 && g > 180 && b > 200) return { label: "WFH", bg: "#00BCD422", border: "#00BCD4", text: "#00BCD4" };
  // Yellow — PTO / Sick
  if (r > 200 && g > 200 && b < 80)  return { label: "PTO", bg: "#FFDD3122", border: YELLOW,   text: YELLOW };
  // Dark blue header rows (section headers)
  if (r < 60  && g < 100 && b > 120) return { label: "header", bg: DARKBLUE, border: DARKBLUE, text: TPRI };
  // Medium blue sub-headers
  if (r < 100 && g < 140 && b > 150) return { label: "subheader", bg: "#1a4a7a", border: "#1a4a7a", text: TPRI };
  return null;
}

// ── Schedule renderer ─────────────────────────────────────────────────────────
// Parses the raw 2D array from Google Sheets into a readable schedule table
function ScheduleTable({ rows, colorMap }) {
  if (!rows || rows.length === 0) return null;

  // Find the day header row (contains Mon/Tue/Wed/Thu/Fri pattern)
  const dayHeaderIdx = rows.findIndex(row =>
    row.some(cell => /monday|tuesday|wednesday|thursday|friday/i.test(cell))
  );
  const dayHeaders = dayHeaderIdx >= 0 ? rows[dayHeaderIdx] : [];
  // Find date row (usually right after day header)
  const dateRow = dayHeaderIdx >= 0 && rows[dayHeaderIdx + 1] ? rows[dayHeaderIdx + 1] : [];

  // Build column headers: merge day name + date
  const colHeaders = dayHeaders.map((h, i) => {
    const date = dateRow[i] || "";
    if (!h && !date) return null;
    return { day: h, date };
  });

  // Parse all rows into sections
  const sections = [];
  let currentSection = null;

  rows.forEach((row, ri) => {
    if (ri <= dayHeaderIdx + 1) return; // skip header rows

    const color = colorMap[`${ri},0`] || colorMap[`${ri},1`];
    const colorInfo = classifyColor(color);
    const firstCell = (row[0] || row[1] || "").toString().trim();

    if (!firstCell && row.every(c => !c)) return; // skip truly empty rows

    // Section header detection: dark blue background OR all-caps short text in col A/B
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

  const numDayCols = Math.max(...rows.map(r => r.length), 6);
  const dayCols    = colHeaders.filter(h => h && (h.day || h.date)).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sections.map((section, si) => (
        <div key={si} style={{
          background: PANEL, borderRadius: 12,
          border: `1px solid ${BORDER}`, overflow: "hidden",
        }}>
          {/* Section header */}
          <div style={{
            background: DARKBLUE, padding: "10px 18px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: TPRI,
              fontFamily: "'Poppins',sans-serif", letterSpacing: "0.03em",
            }}>{section.title}</div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11,
              fontFamily: "'Poppins',sans-serif" }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 14px", textAlign: "left", color: TSEC,
                    fontWeight: 600, borderBottom: `1px solid ${BORDER}`,
                    whiteSpace: "nowrap", minWidth: 100 }}>Staff</th>
                  {dayCols.map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", textAlign: "center",
                      color: TSEC, fontWeight: 600, borderBottom: `1px solid ${BORDER}`,
                      whiteSpace: "nowrap", minWidth: 110 }}>
                      <div style={{ color: TPRI, fontWeight: 700 }}>{h.day}</div>
                      <div style={{ color: TSEC, fontSize: 10 }}>{h.date}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map(({ cells, ri }, rowIdx) => {
                  const nameCell = (cells[0] || cells[1] || "").toString().trim();
                  // Skip sub-header rows (Café Thru Line etc)
                  const isSubHeader = colorMap[`${ri},0`] && classifyColor(colorMap[`${ri},0`])?.label === "subheader";
                  if (isSubHeader) {
                    return (
                      <tr key={rowIdx}>
                        <td colSpan={dayCols.length + 1} style={{
                          padding: "6px 14px", background: "#0a2a5a",
                          color: LAQUA, fontWeight: 600, fontSize: 10,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                        }}>{nameCell}</td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={rowIdx} style={{
                      borderBottom: `1px solid ${BORDER}44`,
                      background: rowIdx % 2 === 0 ? "transparent" : `${SPACE}88`,
                    }}>
                      <td style={{ padding: "7px 14px", color: nameCell ? TPRI : TSEC,
                        fontWeight: nameCell ? 600 : 400, whiteSpace: "nowrap" }}>
                        {nameCell || "—"}
                      </td>
                      {dayCols.map((_, ci) => {
                        // Day cells start at col index 1 (col A is name)
                        const cellIdx = ci + 1;
                        const cellVal = (cells[cellIdx] || "").toString().trim();
                        const cellColor = colorMap[`${ri},${cellIdx}`];
                        const colorInfo = classifyColor(cellColor);

                        return (
                          <td key={ci} style={{
                            padding: "6px 10px", textAlign: "center",
                            background: colorInfo ? colorInfo.bg : "transparent",
                          }}>
                            {cellVal ? (
                              <span style={{
                                display: "inline-block",
                                padding: colorInfo ? "2px 8px" : "0",
                                borderRadius: colorInfo ? 20 : 0,
                                border: colorInfo ? `1px solid ${colorInfo.border}44` : "none",
                                color: colorInfo ? colorInfo.text : TMID,
                                fontWeight: colorInfo ? 700 : 400,
                                fontSize: 10, whiteSpace: "nowrap",
                              }}>
                                {cellVal}
                                {colorInfo?.label && colorInfo.label !== "header" && (
                                  <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>
                                    ({colorInfo.label})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: `${TSEC}44`, fontSize: 10 }}>—</span>
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

// ── Event Order Upload Zone ───────────────────────────────────────────────────
function EventOrderUpload({ onUpload, uploadState }) {
  const isProcessing = uploadState === "UPLOADING";
  const onDrop = useCallback((files) => files[0] && onUpload(files[0]), [onUpload]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [] },
    multiple: false,
  });

  const icon = isProcessing          ? "⏳"
    : uploadState === "SUCCESS"      ? "✓"
    : uploadState === "ERROR"        ? "✕" : "↑";

  const sub = isProcessing           ? "Uploading…"
    : uploadState === "SUCCESS"      ? "Uploaded! Drop another."
    : uploadState === "ERROR"        ? "Error — try again"
    : isDragActive                   ? "Release to upload"
    : "Drop Event Order PDF here";

  return (
    <div {...getRootProps()} style={{
      border: `1.5px dashed ${isDragActive ? AQUA : BORDER}`,
      borderRadius: 12, padding: "20px 16px", cursor: "pointer",
      background: isDragActive ? `${AQUA}18` : `${SPACE}cc`,
      transition: "all 0.25s", textAlign: "center",
      position: "relative", overflow: "hidden",
    }}>
      <input {...getInputProps()} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: AQUA, borderRadius: "12px 12px 0 0" }} />
      <div style={{ width: 36, height: 36, borderRadius: "50%",
        background: `${AQUA}22`, border: `1px solid ${AQUA}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 8px", fontSize: 16, color: AQUA, fontWeight: 700 }}>{icon}</div>
      <div style={{ color: TMID, fontSize: 11, fontFamily: "'Poppins',sans-serif", fontWeight: 500 }}>{sub}</div>
      {isProcessing && (
        <div style={{ marginTop: 10, height: 2, background: BORDER, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "55%", background: AQUA,
            borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
        </div>
      )}
    </div>
  );
}

// ── Main WeeklyOps Component ──────────────────────────────────────────────────
export default function WeeklyOps() {
  const [scheduleState, setScheduleState] = useState("idle"); // idle | loading | done | error
  const [scheduleData,  setScheduleData]  = useState(null);
  const [scheduleError, setScheduleError] = useState(null);
  const [eventOrders,   setEventOrders]   = useState([]);
  const [uploadState,   setUploadState]   = useState("IDLE");

  // Load schedule on mount
  useEffect(() => {
    loadSchedule();
    const unsub = subscribeEventOrders(setEventOrders);
    return unsub;
  }, []);

  async function loadSchedule() {
    setScheduleState("loading");
    setScheduleError(null);
    try {
      const data = await fetchSchedule();
      setScheduleData(data);
      setScheduleState("done");
    } catch (err) {
      setScheduleError(err.message);
      setScheduleState("error");
    }
  }

  const handleEventOrderUpload = useCallback(async (file) => {
    setUploadState("UPLOADING");
    try {
      await uploadEventOrder(file, () => {});
      setUploadState("SUCCESS");
      setTimeout(() => setUploadState("IDLE"), 3000);
    } catch (err) {
      console.error(err);
      setUploadState("ERROR");
    }
  }, []);

  function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatUploadDate(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

      {/* ── Schedule Section ── */}
      <div style={{ marginBottom: 32, animation: "ucar-fadein .5s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TPRI,
              fontFamily: "'Poppins',sans-serif", marginBottom: 4 }}>
              Staff Schedule
            </div>
            <div style={{ fontSize: 11, color: TSEC, fontWeight: 500,
              fontFamily: "'Poppins',sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {scheduleState === "done" ? scheduleData?.weekLabel : "Loading current week…"}
            </div>
          </div>
          <button onClick={loadSchedule} disabled={scheduleState === "loading"}
            style={{ display: "flex", alignItems: "center", gap: 7,
              background: "transparent", border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "8px 16px", cursor: "pointer",
              fontFamily: "'Poppins',sans-serif", fontWeight: 600,
              fontSize: 11, color: TSEC, transition: "all .2s" }}>
            {scheduleState === "loading" ? "⏳ Loading…" : "↻ Refresh"}
          </button>
        </div>

        {scheduleState === "loading" && (
          <div style={{ background: PANEL, borderRadius: 16, padding: 56,
            textAlign: "center", border: `1px solid ${BORDER}` }}>
            <div style={{ color: TSEC, fontSize: 13, fontFamily: "'Poppins',sans-serif" }}>
              Fetching schedule from Google Drive…
            </div>
            <div style={{ marginTop: 16, height: 2, background: BORDER,
              borderRadius: 4, overflow: "hidden", maxWidth: 200, margin: "16px auto 0" }}>
              <div style={{ height: "100%", width: "60%", background: AQUA,
                borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
            </div>
          </div>
        )}

        {scheduleState === "error" && (
          <div style={{ background: PANEL, borderRadius: 16, padding: 40,
            textAlign: "center", border: `1.5px dashed ${ORANGE}44` }}>
            <div style={{ fontSize: 22, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: TPRI, fontWeight: 700, fontSize: 14, marginBottom: 8,
              fontFamily: "'Poppins',sans-serif" }}>Could not load schedule</div>
            <div style={{ color: TSEC, fontSize: 12, fontFamily: "'Poppins',sans-serif",
              marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
              {scheduleError}
            </div>
            <button onClick={loadSchedule}
              style={{ background: AQUA, border: "none", borderRadius: 8,
                padding: "9px 24px", color: SPACE, fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Try Again
            </button>
          </div>
        )}

        {scheduleState === "done" && scheduleData && (
          <ScheduleTable rows={scheduleData.rows} colorMap={scheduleData.colorMap} />
        )}
      </div>

      {/* ── Event Orders Section ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20,
        animation: "ucar-fadein .6s ease both" }}>

        {/* Upload zone */}
        <div style={{ background: PANEL, borderRadius: 16, padding: "24px 24px",
          border: `1px solid ${BORDER}`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, opacity: 0.06 }}>
            <WaveGraphic color={AQUA} opacity={1} width={280} height={80} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TPRI,
            fontFamily: "'Poppins',sans-serif", marginBottom: 4, position: "relative" }}>
            Event Orders
          </div>
          <div style={{ fontSize: 10, color: TSEC, fontWeight: 500, letterSpacing: "0.04em",
            textTransform: "uppercase", marginBottom: 18, position: "relative" }}>
            Upload PDF event orders
          </div>
          <EventOrderUpload onUpload={handleEventOrderUpload} uploadState={uploadState} />
        </div>

        {/* Event order list */}
        <div style={{ background: PANEL, borderRadius: 16, padding: "24px 24px",
          border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TPRI,
            fontFamily: "'Poppins',sans-serif", marginBottom: 4 }}>
            Event Order Library
          </div>
          <div style={{ fontSize: 10, color: TSEC, fontWeight: 500, letterSpacing: "0.04em",
            textTransform: "uppercase", marginBottom: 18 }}>
            Click to open · most recent first
          </div>

          {eventOrders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: TSEC,
              fontSize: 12, fontFamily: "'Poppins',sans-serif" }}>
              No event orders uploaded yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {eventOrders.map(order => (
                <a key={order.id} href={order.downloadURL} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", borderRadius: 10, background: `${SPACE}cc`,
                    border: `1px solid ${BORDER}`, textDecoration: "none",
                    transition: "all .2s", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${AQUA}88`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8,
                      background: `${ORANGE}22`, border: `1px solid ${ORANGE}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, flexShrink: 0 }}>📄</div>
                    <div>
                      <div style={{ color: TPRI, fontSize: 12, fontWeight: 600,
                        fontFamily: "'Poppins',sans-serif" }}>{order.fileName}</div>
                      <div style={{ color: TSEC, fontSize: 10, fontFamily: "'Poppins',sans-serif" }}>
                        {formatUploadDate(order.uploadedAt)}
                        {order.size ? ` · ${formatFileSize(order.size)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ color: AQUA, fontSize: 11, fontWeight: 600,
                    fontFamily: "'Poppins',sans-serif", whiteSpace: "nowrap" }}>
                    View →
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 32, textAlign: "center", fontSize: 10,
        color: `${TSEC}88`, fontWeight: 500, letterSpacing: "0.08em",
        textTransform: "uppercase", fontFamily: "'Poppins',sans-serif" }}>
        University Corporation for Atmospheric Research · Internal Tool
      </div>

    </div>
  );
}
