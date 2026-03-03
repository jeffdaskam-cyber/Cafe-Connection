import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { uploadReport, parseReport, subscribeToCampus } from "./firebase.js";

// ── UCAR Brand Palette (Brand Style Guide, Dec 2025) ─────────────────────────
const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
const CAMPUS_COLOR = {
  "Mesa Lab":     "#00A2B4", // UCAR Aqua
  Foothills:      "#34E1F4", // Light Aqua
  "Center Green": "#00818F", // UCAR Aqua Contrast
};

const SPACE     = "#011837";
const DARKBLUE  = "#00357A";
const PANEL     = "#001f4d";
const BORDER    = "#003070";
const TPRI      = "#FFFFFF";
const TSEC      = "#7aaec8";
const TMID      = "#b0d0e8";
const AQUA      = "#00A2B4";
const LAQUA     = "#34E1F4";
const ORANGE    = "#FAA119";
const YELLOW    = "#FFDD31";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return "";
  const dt = d.toDate ? d.toDate() : new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// ── Wave SVG (UCAR graphic element per brand guide) ───────────────────────────
function WaveGraphic({ color = AQUA, opacity = 0.18, width = 420, height = 80 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
      style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
      {[0, 14, 28, 42].map((offset, i) => (
        <path key={i}
          d={`M0,${30 + offset} C80,${10 + offset} 160,${50 + offset} 240,${28 + offset} S380,${8 + offset} ${width},${30 + offset}`}
          fill="none" stroke={color} strokeWidth="1.5" opacity={opacity - i * 0.02} />
      ))}
    </svg>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, delta, accentColor }) {
  const pos = delta >= 0;
  return (
    <div style={{
      flex: 1,
      background: PANEL,
      borderRadius: 14,
      padding: "20px 22px",
      border: `1px solid ${BORDER}`,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
        borderRadius: "14px 14px 0 0",
      }} />
      <div style={{
        color: TSEC, fontSize: 10, fontFamily: "'Poppins',sans-serif",
        fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px"
      }}>{label}</div>
      <div style={{
        color: TPRI, fontSize: 28, fontWeight: 700, margin: "8px 0 6px",
        fontFamily: "'Poppins',sans-serif", letterSpacing: "-0.5px"
      }}>{value}</div>
      <div style={{
        fontSize: 11, fontFamily: "'Poppins',sans-serif", fontWeight: 500,
        color: pos ? AQUA : ORANGE,
      }}>
        {pos ? "▲" : "▼"} {Math.abs(delta)}% vs last period
      </div>
      {/* subtle wave watermark */}
      <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.07 }}>
        <WaveGraphic color={accentColor} opacity={1} width={180} height={50} />
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: DARKBLUE, border: `1px solid ${AQUA}44`,
      borderRadius: 10, padding: "10px 14px",
      fontSize: 12, fontFamily: "'Poppins',sans-serif",
      boxShadow: `0 4px 20px ${AQUA}22`
    }}>
      <div style={{ color: TMID, marginBottom: 6, fontSize: 11 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.dataKey === "cafe_sales"
            ? `$${Number(p.value).toLocaleString()}` : p.value}
        </div>
      ))}
    </div>
  );
};

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ campus, onUpload, uploadState }) {
  const color = CAMPUS_COLOR[campus];
  const isProcessing = uploadState === "UPLOADING" || uploadState === "PROCESSING";

  const onDrop = useCallback(
    (files) => files[0] && onUpload(campus, files[0]),
    [campus, onUpload]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [],
    },
    multiple: false,
  });

  const icon = isProcessing ? "⏳"
    : uploadState === "SUCCESS" ? "✓"
    : uploadState === "ERROR"   ? "✕"
    : "↑";

  const sub = isProcessing
    ? (uploadState === "UPLOADING" ? "Uploading…" : "Analyzing report data…")
    : uploadState === "SUCCESS" ? "Uploaded! Drop another."
    : uploadState === "ERROR"   ? "Error — try again"
    : isDragActive              ? "Release to upload"
    : ".xlsx or .pdf";

  return (
    <div {...getRootProps()} style={{
      border: `1.5px dashed ${isDragActive ? color : BORDER}`,
      borderRadius: 12,
      padding: "22px 16px",
      cursor: "pointer",
      background: isDragActive ? `${color}18` : `${SPACE}cc`,
      transition: "all 0.25s",
      textAlign: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      <input {...getInputProps()} />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: color, borderRadius: "12px 12px 0 0"
      }} />
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: `${color}22`, border: `1px solid ${color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 10px", fontSize: 16, color: color, fontWeight: 700
      }}>{icon}</div>
      <div style={{
        color: TMID, fontSize: 11,
        fontFamily: "'Poppins',sans-serif", fontWeight: 500
      }}>{sub}</div>
      {isProcessing && (
        <div style={{
          marginTop: 12, height: 2, background: BORDER,
          borderRadius: 4, overflow: "hidden"
        }}>
          <div style={{
            height: "100%", width: "55%", background: color,
            borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate"
          }} />
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [campus, setCampus]   = useState("Mesa Lab");
  const [metrics, setMetrics] = useState([]);
  const [uploadStates, setUploadStates] = useState({
    "Mesa Lab": "IDLE", Foothills: "IDLE", "Center Green": "IDLE",
  });

  useEffect(() => {
    const unsub = subscribeToCampus(campus, setMetrics);
    return unsub;
  }, [campus]);

  const color = CAMPUS_COLOR[campus];

  const totalSales  = metrics.reduce((s, d) => s + (d.cafe_sales  || 0), 0);
  const avgVolume   = metrics.length
    ? Math.round(metrics.reduce((s, d) => s + (d.cafe_volume || 0), 0) / metrics.length) : 0;
  const totalEvents = metrics.reduce((s, d) => s + (d.event_volume || 0), 0);

  const chartData = metrics.map((d) => ({
    date:         fmt(d.date),
    cafe_sales:   d.cafe_sales   || 0,
    cafe_volume:  d.cafe_volume  || 0,
    event_volume: d.event_volume || 0,
  }));

  const anyProcessing = Object.values(uploadStates)
    .some((s) => s === "UPLOADING" || s === "PROCESSING");

  const handleUpload = useCallback(async (camp, file) => {
    setUploadStates((s) => ({ ...s, [camp]: "UPLOADING" }));
    try {
      const url = await uploadReport(camp, file, () => {});
      setUploadStates((s) => ({ ...s, [camp]: "PROCESSING" }));
      await parseReport(url, camp, file.name);
      setUploadStates((s) => ({ ...s, [camp]: "SUCCESS" }));
    } catch (err) {
      console.error(err);
      setUploadStates((s) => ({ ...s, [camp]: "ERROR" }));
    }
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${SPACE}; }
        @keyframes ucar-slide {
          from { transform: translateX(-120%); }
          to   { transform: translateX(220%);  }
        }
        @keyframes ucar-pulse {
          0%,100% { opacity:1; } 50% { opacity:.4; }
        }
        @keyframes ucar-fadein {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        .ucar-campus-btn {
          transition: all .22s ease;
        }
        .ucar-campus-btn:hover {
          filter: brightness(1.15);
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${SPACE} 0%, #001230 100%)`,
        color: TPRI,
        fontFamily: "'Poppins',sans-serif",
        paddingBottom: 48,
      }}>

        {/* ── Header ── */}
        <div style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: "0 36px",
          background: `${SPACE}f0`,
          position: "sticky", top: 0, zIndex: 20,
          backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          height: 64,
          overflow: "hidden",
        }}>
          {/* wave graphic in header — UCAR brand element */}
          <div style={{ position: "absolute", right: 200, top: 0, opacity: 0.25 }}>
            <WaveGraphic color={AQUA} opacity={0.6} width={500} height={64} />
          </div>

          {/* Logo area */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1 }}>
            {/* UCAR logomark approximation using brand colors */}
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: `linear-gradient(135deg, ${AQUA}, ${DARKBLUE})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 16px ${AQUA}44`,
              flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <ellipse cx="12" cy="12" rx="10" ry="10" stroke="white" strokeWidth="1.2" />
                <path d="M4 10 Q8 6 12 10 Q16 14 20 10" stroke="white" strokeWidth="1.4" fill="none" />
                <path d="M4 14 Q8 10 12 14 Q16 18 20 14" stroke="white" strokeWidth="1.4" fill="none" />
              </svg>
            </div>
            <div>
              <div style={{
                fontWeight: 800, fontSize: 15, letterSpacing: "0.02em",
                color: TPRI,
              }}>
                <span style={{ color: AQUA }}>UCAR</span> Cafe Connection
              </div>
              <div style={{
                fontSize: 10, color: TSEC, fontWeight: 500,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Catering &amp; Cafe Information Hub</div>
            </div>
          </div>

          {/* Date + processing badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, zIndex: 1 }}>
            <div style={{
              fontSize: 11, color: TSEC, fontWeight: 500,
              letterSpacing: "0.04em",
            }}>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>

            {anyProcessing && (
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                background: `${DARKBLUE}cc`,
                border: `1px solid ${AQUA}55`,
                padding: "5px 14px", borderRadius: 20,
                fontSize: 11, fontWeight: 600, color: AQUA,
                animation: "ucar-pulse 1.6s ease-in-out infinite",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: ORANGE,
                  boxShadow: `0 0 6px ${ORANGE}`,
                }} />
                Processing report…
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 36px" }}>

          {/* ── Campus Selector ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 10, color: TSEC, fontWeight: 600,
              letterSpacing: "1.5px", textTransform: "uppercase",
              marginBottom: 10,
            }}>Campus</div>
            <div style={{ display: "flex", gap: 8 }}>
              {CAMPUSES.map((c) => {
                const active = c === campus;
                const cc = CAMPUS_COLOR[c];
                return (
                  <button key={c} className="ucar-campus-btn"
                    onClick={() => setCampus(c)}
                    style={{
                      padding: "9px 24px", borderRadius: 6,
                      border: active ? `1.5px solid ${cc}` : `1.5px solid ${BORDER}`,
                      cursor: "pointer",
                      fontFamily: "'Poppins',sans-serif",
                      fontWeight: 600, fontSize: 12,
                      letterSpacing: "0.03em",
                      background: active ? `${cc}22` : "transparent",
                      color: active ? cc : TSEC,
                      boxShadow: active ? `0 0 18px ${cc}33` : "none",
                    }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div style={{
            display: "flex", gap: 18, marginBottom: 28,
            animation: "ucar-fadein .5s ease both",
          }}>
            <StatCard
              label="30-Day Cafe Sales"
              value={`$${(totalSales / 1000).toFixed(1)}k`}
              delta={4.2}
              accentColor={AQUA}
            />
            <StatCard
              label="Avg Daily Transactions"
              value={avgVolume || "—"}
              delta={-1.8}
              accentColor={LAQUA}
            />
            <StatCard
              label="Total Events"
              value={totalEvents || "—"}
              delta={11.3}
              accentColor={color}
            />
          </div>

          {/* ── Charts ── */}
          {chartData.length > 0 ? (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 20, marginBottom: 28,
              animation: "ucar-fadein .6s ease both",
            }}>
              {/* Bar Chart */}
              <div style={{
                background: PANEL, borderRadius: 16, padding: "24px 28px",
                border: `1px solid ${BORDER}`, position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.06 }}>
                  <WaveGraphic color={AQUA} opacity={1} width={340} height={90} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Cafe Sales</div>
                <div style={{ fontSize: 10, color: TSEC, fontWeight: 500, marginBottom: 20, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Last 30 days · {campus}
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={chartData} barSize={7}>
                    <CartesianGrid strokeDasharray="3 3" stroke={`${BORDER}88`} vertical={false} />
                    <XAxis dataKey="date"
                      tick={{ fill: TSEC, fontSize: 9, fontFamily: "'Poppins'" }}
                      tickLine={false} axisLine={false} interval={4} />
                    <YAxis
                      tick={{ fill: TSEC, fontSize: 9, fontFamily: "'Poppins'" }}
                      tickLine={false} axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="cafe_sales" name="Cafe Sales" fill={AQUA} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Line Chart */}
              <div style={{
                background: PANEL, borderRadius: 16, padding: "24px 28px",
                border: `1px solid ${BORDER}`, position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.06 }}>
                  <WaveGraphic color={LAQUA} opacity={1} width={340} height={90} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Volume Comparison</div>
                <div style={{ fontSize: 10, color: TSEC, fontWeight: 500, marginBottom: 20, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Cafe volume vs Event volume · {campus}
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={`${BORDER}88`} vertical={false} />
                    <XAxis dataKey="date"
                      tick={{ fill: TSEC, fontSize: 9, fontFamily: "'Poppins'" }}
                      tickLine={false} axisLine={false} interval={4} />
                    <YAxis
                      tick={{ fill: TSEC, fontSize: 9, fontFamily: "'Poppins'" }}
                      tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Poppins'", fontWeight: 600 }} />
                    <Line type="monotone" dataKey="cafe_volume"  name="Cafe Volume"  stroke={AQUA}  strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="event_volume" name="Event Volume" stroke={LAQUA} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div style={{
              background: PANEL,
              border: `1.5px dashed ${BORDER}`,
              borderRadius: 16, padding: 56, textAlign: "center",
              marginBottom: 28,
              animation: "ucar-fadein .5s ease both",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: `${AQUA}18`, border: `1px solid ${AQUA}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px", fontSize: 22,
              }}>📊</div>
              <div style={{ color: TPRI, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                No data yet for {campus}
              </div>
              <div style={{ color: TSEC, fontSize: 12, fontWeight: 500 }}>
                Upload a report below to populate the charts
              </div>
            </div>
          )}

          {/* ── Upload Section ── */}
          <div style={{
            background: PANEL, borderRadius: 16, padding: "26px 28px",
            border: `1px solid ${BORDER}`,
            animation: "ucar-fadein .7s ease both",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, right: 0, opacity: 0.07 }}>
              <WaveGraphic color={AQUA} opacity={1} width={500} height={80} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, position: "relative" }}>
              Upload Reports
            </div>
            <div style={{
              fontSize: 10, color: TSEC, fontWeight: 500,
              letterSpacing: "0.04em", textTransform: "uppercase",
              marginBottom: 22, position: "relative",
            }}>
              Drop .xlsx or .pdf files per campus to ingest data
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {CAMPUSES.map((c) => (
                <div key={c}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, marginBottom: 8,
                    color: CAMPUS_COLOR[c], letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}>{c}</div>
                  <UploadZone campus={c} onUpload={handleUpload} uploadState={uploadStates[c]} />
                </div>
              ))}
            </div>
          </div>

          {/* ── UCAR footer tag ── */}
          <div style={{
            marginTop: 32, textAlign: "center",
            fontSize: 10, color: `${TSEC}88`,
            fontWeight: 500, letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            University Corporation for Atmospheric Research · Internal Tool
          </div>

        </div>
      </div>
    </>
  );
}
