import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { uploadReport, parseReport, subscribeToCampus } from "./firebase.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];
const CAMPUS_COLOR = { "Mesa Lab": "#f97316", Foothills: "#06b6d4", "Center Green": "#22c55e" };

const BG      = "#020617";
const PANEL   = "#0f172a";
const BORDER  = "#1e293b";
const TSEC    = "#64748b";
const TMID    = "#94a3b8";
const TPRI    = "#f1f5f9";
const PURPLE  = "#7c3aed";
const GREEN   = "#22c55e";
const RED     = "#ef4444";
const AMBER   = "#f59e0b";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return "";
  const dt = d.toDate ? d.toDate() : new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, delta }) {
  const pos = delta >= 0;
  return (
    <div style={{ flex: 1, background: PANEL, borderRadius: 12, padding: "16px 20px", border: `1px solid ${BORDER}` }}>
      <div style={{ color: TSEC, fontSize: 11, fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color: TPRI, fontSize: 26, fontWeight: 700, margin: "6px 0 4px", fontFamily: "'Syne',sans-serif" }}>{value}</div>
      <div style={{ fontSize: 12, color: pos ? GREEN : RED, fontFamily: "'DM Mono',monospace" }}>
        {pos ? "▲" : "▼"} {Math.abs(delta)}% vs last period
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
      <div style={{ color: TMID, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === "cafe_sales" ? `$${Number(p.value).toLocaleString()}` : p.value}
        </div>
      ))}
    </div>
  );
};

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

  const icon = isProcessing ? "⏳" : uploadState === "SUCCESS" ? "✅" : uploadState === "ERROR" ? "❌" : "📁";
  const sub  = isProcessing
    ? uploadState === "UPLOADING" ? "Uploading…" : "Analyzing report data…"
    : uploadState === "SUCCESS" ? "Done! Drop another."
    : uploadState === "ERROR"   ? "Error — try again"
    : isDragActive              ? "Release to upload"
    : ".xlsx or .pdf";

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragActive ? color : BORDER}`,
        borderRadius: 12,
        padding: "20px 16px",
        cursor: "pointer",
        background: isDragActive ? `${color}18` : PANEL,
        transition: "all 0.2s",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <input {...getInputProps()} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "12px 12px 0 0" }} />
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: TMID, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{sub}</div>
      {isProcessing && (
        <div style={{ marginTop: 10, height: 3, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "60%", background: color, borderRadius: 4, animation: "slide 1.2s ease-in-out infinite alternate" }} />
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

  // Live Firestore subscription
  useEffect(() => {
    const unsub = subscribeToCampus(campus, setMetrics);
    return unsub;
  }, [campus]);

  const color = CAMPUS_COLOR[campus];

  // Derived stats
  const totalSales  = metrics.reduce((s, d) => s + (d.cafe_sales  || 0), 0);
  const avgVolume   = metrics.length ? Math.round(metrics.reduce((s, d) => s + (d.cafe_volume || 0), 0) / metrics.length) : 0;
  const totalEvents = metrics.reduce((s, d) => s + (d.event_volume || 0), 0);

  const chartData = metrics.map((d) => ({
    date:         fmt(d.date),
    cafe_sales:   d.cafe_sales   || 0,
    cafe_volume:  d.cafe_volume  || 0,
    event_volume: d.event_volume || 0,
  }));

  const anyProcessing = Object.values(uploadStates).some(
    (s) => s === "UPLOADING" || s === "PROCESSING"
  );

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
        @keyframes slide { from { transform:translateX(-100%) } to { transform:translateX(200%) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <div style={{ minHeight: "100vh", background: BG, color: TPRI, fontFamily: "'Syne',sans-serif", paddingBottom: 40 }}>

        {/* ── Header ── */}
        <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: BG, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${color},#7c3aed)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "background .4s" }}>☕</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>Cafe Connection</div>
              <div style={{ fontSize: 11, color: TSEC, fontFamily: "'DM Mono',monospace" }}>Information Hub · {new Date().toLocaleDateString()}</div>
            </div>
          </div>
          {anyProcessing && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1e293b", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontFamily: "'DM Mono',monospace", color: TMID, animation: "pulse 1.5s ease-in-out infinite" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: AMBER }} />
              Processing report…
            </div>
          )}
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>

          {/* ── Campus Selector ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
            {CAMPUSES.map((c) => (
              <button key={c} onClick={() => setCampus(c)} style={{ padding: "9px 22px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 600, fontSize: 13, transition: "all .2s", background: campus === c ? CAMPUS_COLOR[c] : "#1e293b", color: campus === c ? "#fff" : TSEC, boxShadow: campus === c ? `0 0 20px ${CAMPUS_COLOR[c]}55` : "none" }}>
                {c}
              </button>
            ))}
          </div>

          {/* ── Stat Cards ── */}
          <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
            <StatCard label="30-Day Sales"            value={`$${(totalSales / 1000).toFixed(1)}k`} delta={4.2}  />
            <StatCard label="Avg Daily Transactions"  value={avgVolume || "—"}                       delta={-1.8} />
            <StatCard label="Total Events"            value={totalEvents || "—"}                     delta={11.3} />
          </div>

          {/* ── Charts ── */}
          {chartData.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
              <div style={{ background: PANEL, borderRadius: 16, padding: 24, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Cafe Sales</div>
                <div style={{ fontSize: 11, color: TSEC, fontFamily: "'DM Mono',monospace", marginBottom: 20 }}>Last 30 days · {campus}</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} barSize={6}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="cafe_sales" name="Cafe Sales" fill={color} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: PANEL, borderRadius: 16, padding: 24, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Volume Comparison</div>
                <div style={{ fontSize: 11, color: TSEC, fontFamily: "'DM Mono',monospace", marginBottom: 20 }}>Cafe volume vs Event volume · {campus}</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'DM Mono'" }} />
                    <Line type="monotone" dataKey="cafe_volume"  name="Cafe Volume"  stroke={color}  strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="event_volume" name="Event Volume" stroke={PURPLE} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div style={{ background: PANEL, border: `1px dashed ${BORDER}`, borderRadius: 16, padding: 48, textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ color: TPRI, fontWeight: 700, marginBottom: 6 }}>No data yet for {campus}</div>
              <div style={{ color: TSEC, fontSize: 13, fontFamily: "'DM Mono',monospace" }}>Upload a report below to populate the charts</div>
            </div>
          )}

          {/* ── Upload Section ── */}
          <div style={{ background: PANEL, borderRadius: 16, padding: 24, border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Upload Reports</div>
            <div style={{ fontSize: 11, color: TSEC, fontFamily: "'DM Mono',monospace", marginBottom: 20 }}>Drop .xlsx or .pdf files per campus to ingest data</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {CAMPUSES.map((c) => (
                <div key={c}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: CAMPUS_COLOR[c], fontFamily: "'DM Mono',monospace" }}>{c}</div>
                  <UploadZone campus={c} onUpload={handleUpload} uploadState={uploadStates[c]} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
