/**
 * DropBox — sales report upload widget.
 *
 * Accepts PDF and Excel InfoGenesis Sales Summary files, uploads to Firebase
 * Storage, and calls the /api/parse-report serverless function to extract and
 * store metrics in Firestore. Campus is auto-detected from the report file.
 *
 * Moved from FinancialsPage to Weekly Ops in Phase 5 per the Architecture Map.
 * Self-contained: manages its own upload state internally.
 */

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { uploadReport, parseReport } from "../firebase.js";
import Widget from "./Widget.jsx";
import { COLORS } from "../theme.js";

// ── Upload state machine ───────────────────────────────────────────────────────
// IDLE → UPLOADING → PROCESSING → SUCCESS | ERROR

function UploadZone({ onDrop, uploadState }) {
  const isProcessing = uploadState.status === "UPLOADING" || uploadState.status === "PROCESSING";
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onDrop(files[0]),
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [],
    },
    multiple: false,
    disabled: isProcessing,
    // react-dropzone 20 enables paste-to-upload by default. This zone uploads to
    // Storage and files a parsed report, so a stray Ctrl+V would create junk data.
    noPaste: true,
  });

  const { status, campus, errorMsg } = uploadState;
  const accentColor = COLORS.AQUA;

  const icon = isProcessing        ? "⏳"
    : status === "SUCCESS"         ? "✓"
    : status === "ERROR"           ? "✕"
    : "↑";

  const message = isProcessing
    ? (status === "UPLOADING" ? "Uploading to storage…" : "Parsing report data…")
    : status === "SUCCESS"
      ? (campus ? `Filed to ${campus}. Drop another.` : "Uploaded! Drop another.")
    : status === "ERROR"
      ? (errorMsg || "Upload failed — try again")
    : isDragActive
      ? "Release to upload"
      : "Drop any campus Sales Summary (Excel). Campus is auto-detected.";

  return (
    <div {...getRootProps()} style={{
      border: `1.5px dashed ${isDragActive ? accentColor : COLORS.BORDER}`,
      borderRadius: 10, padding: "28px 20px",
      cursor: isProcessing ? "default" : "pointer",
      background: isDragActive ? `${accentColor}0e` : COLORS.BG_SURFACE_ALT,
      transition: "all 0.22s", textAlign: "center",
      position: "relative", overflow: "hidden",
    }}>
      <input {...getInputProps()} />

      {/* Top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: accentColor, borderRadius: "10px 10px 0 0" }} />

      {/* Icon circle */}
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: `${accentColor}14`, border: `1px solid ${accentColor}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 12px", fontSize: 20, color: accentColor, fontWeight: 700,
      }}>{icon}</div>

      <div style={{ color: COLORS.TEXT_PRIMARY, fontSize: 13, fontFamily: "'Poppins',sans-serif",
        fontWeight: 600, marginBottom: 6 }}>
        Upload Sales Report
      </div>
      <div style={{ color: COLORS.TEXT_SECONDARY, fontSize: 11, fontFamily: "'Poppins',sans-serif",
        fontWeight: 500 }}>
        {message}
      </div>

      {/* Campus badge on success */}
      {status === "SUCCESS" && campus && (
        <div style={{
          display: "inline-block", marginTop: 12, padding: "4px 14px",
          borderRadius: 20,
          background: `${COLORS.AQUA}18`,
          border: `1px solid ${COLORS.AQUA}55`,
          color: COLORS.AQUA,
          fontSize: 11, fontWeight: 700,
          fontFamily: "'Poppins',sans-serif",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {campus}
        </div>
      )}

      {/* Error badge */}
      {status === "ERROR" && (
        <div style={{
          display: "inline-block", marginTop: 12, padding: "4px 14px",
          borderRadius: 20, background: `${COLORS.WARNING}15`,
          border: `1px solid ${COLORS.WARNING}44`, color: COLORS.WARNING,
          fontSize: 11, fontWeight: 700,
          fontFamily: "'Poppins',sans-serif", letterSpacing: "0.04em",
        }}>
          Error — try again
        </div>
      )}

      {/* Progress bar during processing */}
      {isProcessing && (
        <div style={{ marginTop: 14, height: 2, background: COLORS.BORDER,
          borderRadius: 4, overflow: "hidden", maxWidth: 200, margin: "14px auto 0" }}>
          <div style={{ height: "100%", width: "55%", background: accentColor,
            borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
        </div>
      )}
    </div>
  );
}

// ── DropBox ────────────────────────────────────────────────────────────────────
export default function DropBox() {
  const [uploadState, setUploadState] = useState({
    status: "IDLE", campus: null, errorMsg: null,
  });

  const handleDrop = useCallback(async (file) => {
    setUploadState({ status: "UPLOADING", campus: null, errorMsg: null });
    try {
      const url    = await uploadReport("auto", file, () => {});
      setUploadState({ status: "PROCESSING", campus: null, errorMsg: null });
      const result = await parseReport(url, null, file.name);
      setUploadState({ status: "SUCCESS", campus: result?.campus ?? null, errorMsg: null });
    } catch (err) {
      console.error("[DropBox] Upload failed:", err);
      setUploadState({ status: "ERROR", campus: null, errorMsg: err?.message ?? "Upload failed" });
    }
  }, []);

  return (
    <Widget
      title="Sales Report Drop Box"
      subtitle="Drop any campus Sales Summary (Excel). Campus is auto-detected."
      icon="📥"
      accentColor={COLORS.AQUA}
    >
      <UploadZone onDrop={handleDrop} uploadState={uploadState} />
    </Widget>
  );
}
