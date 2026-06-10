/**
 * EventReportEntryModal — create / edit / delete a native event report entry.
 *
 * Writes to the `event_report_entries` Firestore collection (Phase 1 schema).
 * Create mode when `existingEntry` is null; Edit mode (with Delete) otherwise.
 * The date picker is constrained to the viewed week (Sunday–Saturday).
 */

import { useEffect, useState } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { COLORS, RADIUS } from "../theme.js";

const FONT_FAMILY = "'Poppins',sans-serif";

const CAMPUS_OPTIONS = [
  { value: "mesa",         label: "Mesa Lab" },
  { value: "foothills",    label: "Foothills Lab" },
  { value: "center_green", label: "Center Green" },
];

// 15-minute increments from 07:00 through 22:00 inclusive
const TIME_OPTIONS = (() => {
  const opts = [];
  for (let mins = 7 * 60; mins <= 22 * 60; mins += 15) {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    opts.push({ value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` });
  }
  return opts;
})();

// Local "YYYY-MM-DD" (toISOString would shift across the UTC boundary)
function toIsoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyForm() {
  return {
    campus: "",
    date: "",
    location: "",
    eventName: "",
    startTime: "",
    endTime: "",
    eventType: "",
    attendeeCount: "",
    catering: false,
    wasteNeeds: "",
    security: "",
    securityPostHours: "",
    notes: "",
    contactName: "",
    contactPhone: "",
  };
}

function formFromEntry(entry) {
  return {
    campus: entry.campus ?? "",
    date: entry.date?.toDate ? toIsoLocal(entry.date.toDate()) : "",
    location: entry.location ?? "",
    eventName: entry.eventName ?? "",
    startTime: entry.startTime ?? "",
    endTime: entry.endTime ?? "",
    eventType: entry.eventType ?? "",
    attendeeCount: entry.attendeeCount ?? "",
    catering: !!entry.catering,
    wasteNeeds: entry.wasteNeeds ?? "",
    security: entry.security ?? "",
    securityPostHours: entry.securityPostHours ?? "",
    notes: entry.notes ?? "",
    contactName: entry.contactName ?? "",
    contactPhone: entry.contactPhone ?? "",
  };
}

// ── Small styled primitives ────────────────────────────────────────────────────

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: COLORS.TEXT_SECONDARY, fontFamily: FONT_FAMILY,
  marginBottom: 4, letterSpacing: "0.02em",
};

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 10px", fontSize: 13,
  fontFamily: FONT_FAMILY, color: COLORS.TEXT_PRIMARY,
  background: COLORS.BG_SURFACE_ALT,
  border: `1px solid ${COLORS.BORDER}`,
  borderRadius: RADIUS.MD, outline: "none",
};

const errorInputStyle = { borderColor: COLORS.ERROR };

function FieldError({ message }) {
  if (!message) return null;
  return (
    <div style={{ fontSize: 10.5, color: COLORS.ERROR, fontFamily: FONT_FAMILY, marginTop: 3 }}>
      {message}
    </div>
  );
}

function Field({ label, error, required = false, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: COLORS.ERROR }}> *</span>}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EventReportEntryModal({
  isOpen,
  onClose,
  weekOf,            // JS Date — Sunday 00:00:00 of the viewed week
  existingEntry = null,
  onSaved,
  onDeleted,
}) {
  const { user } = useAuth();
  const isEdit = !!existingEntry;

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Week bounds (Sunday through Saturday inclusive)
  const weekStart = new Date(weekOf);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const minDate = toIsoLocal(weekStart);
  const maxDate = toIsoLocal(weekEnd);

  // Reset form when opened / target entry changes
  useEffect(() => {
    if (!isOpen) return;
    setForm(existingEntry ? formFromEntry(existingEntry) : emptyForm());
    setErrors({});
    setSubmitError("");
    setConfirmingDelete(false);
    setShowDetails(existingEntry
      ? !!(existingEntry.wasteNeeds || existingEntry.security || existingEntry.securityPostHours)
      : false);
  }, [isOpen, existingEntry]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: null } : prev));
  };

  function validate() {
    const next = {};
    if (!form.campus) next.campus = "Select a campus.";
    if (!form.date) next.date = "Select a date.";
    else if (form.date < minDate || form.date > maxDate) {
      next.date = "Date must fall within the viewed week.";
    }
    if (!form.location.trim()) next.location = "Location is required.";
    if (!form.eventName.trim()) next.eventName = "Event name is required.";
    if (!form.startTime) next.startTime = "Select a start time.";
    if (!form.endTime) next.endTime = "Select an end time.";
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      next.endTime = "End time must be after start time.";
    }
    if (!form.eventType.trim()) next.eventType = "Event type is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function buildPayload() {
    return {
      weekOf: Timestamp.fromDate(weekStart),
      campus: form.campus,
      // Noon local avoids DST boundary issues (repo date convention)
      date: Timestamp.fromDate(new Date(form.date + "T12:00:00")),
      location: form.location.trim(),
      eventName: form.eventName.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      eventType: form.eventType.trim(),
      attendeeCount: form.attendeeCount === "" ? null : Number(form.attendeeCount),
      catering: !!form.catering,
      wasteNeeds: form.wasteNeeds.trim() || null,
      security: form.security.trim() || null,
      securityPostHours: form.securityPostHours.trim() || null,
      notes: form.notes.trim() || null,
      contactName: form.contactName.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    };
  }

  async function handleSave() {
    setSubmitError("");
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, "event_report_entries", existingEntry.id), buildPayload());
      } else {
        await addDoc(collection(db, "event_report_entries"), {
          ...buildPayload(),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onSaved?.();
    } catch (err) {
      console.error("Error saving event report entry:", err);
      setSubmitError("Could not save the event. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSubmitError("");
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "event_report_entries", existingEntry.id));
      onDeleted?.();
    } catch (err) {
      console.error("Error deleting event report entry:", err);
      setSubmitError("Could not delete the event. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  const primaryBtnStyle = {
    background: COLORS.AQUA, border: "none",
    borderRadius: 8, padding: "8px 20px",
    color: COLORS.TEXT_ON_ACCENT, fontSize: 12,
    fontFamily: FONT_FAMILY, fontWeight: 700,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
    display: "flex", alignItems: "center", gap: 8,
  };

  const secondaryBtnStyle = {
    background: "transparent",
    border: `1px solid ${COLORS.BORDER}`,
    borderRadius: 8, padding: "8px 16px",
    color: COLORS.TEXT_MUTED, fontSize: 12,
    fontFamily: FONT_FAMILY, fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
  };

  const spinner = (
    <span style={{
      width: 12, height: 12, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.4)",
      borderTopColor: "#fff",
      display: "inline-block",
      animation: "ucar-spin 0.8s linear infinite",
    }} />
  );

  const weekRangeLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(1,24,55,0.82)",
        display: "flex", alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 24px",
        overflowY: "auto",
      }}
    >
      <style>{`@keyframes ucar-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.BG_SURFACE,
          borderRadius: 16,
          border: `1px solid ${COLORS.BORDER}`,
          width: "100%", maxWidth: 560,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 24px",
          borderBottom: `1px solid ${COLORS.BORDER}`,
          background: COLORS.BG_SURFACE_ALT,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: COLORS.TEXT_PRIMARY, fontFamily: FONT_FAMILY,
              }}>{isEdit ? "Edit Event" : "Add Event"}</div>
              <div style={{ fontSize: 11, color: COLORS.TEXT_MUTED, fontFamily: FONT_FAMILY }}>
                Week of {weekRangeLabel}
              </div>
            </div>
          </div>
          <button
            onClick={busy ? undefined : onClose}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: 8, padding: "5px 14px",
              color: COLORS.TEXT_MUTED, fontSize: 16,
              cursor: busy ? "not-allowed" : "pointer", lineHeight: 1,
            }}>&#10005;</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: "auto" }}>
          <Field label="Campus" required error={errors.campus}>
            <select
              value={form.campus}
              onChange={set("campus")}
              style={{ ...inputStyle, ...(errors.campus ? errorInputStyle : {}) }}
            >
              <option value="">Select campus…</option>
              {CAMPUS_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Date" required error={errors.date}>
            <input
              type="date"
              value={form.date}
              min={minDate}
              max={maxDate}
              onChange={set("date")}
              style={{ ...inputStyle, ...(errors.date ? errorInputStyle : {}) }}
            />
          </Field>

          <Field label="Location" required error={errors.location}>
            <input
              type="text"
              value={form.location}
              onChange={set("location")}
              placeholder="Room / space name"
              style={{ ...inputStyle, ...(errors.location ? errorInputStyle : {}) }}
            />
          </Field>

          <Field label="Event Name" required error={errors.eventName}>
            <input
              type="text"
              value={form.eventName}
              onChange={set("eventName")}
              style={{ ...inputStyle, ...(errors.eventName ? errorInputStyle : {}) }}
            />
          </Field>

          {/* Start / End time side by side */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Start Time" required error={errors.startTime}>
                <select
                  value={form.startTime}
                  onChange={set("startTime")}
                  style={{ ...inputStyle, ...(errors.startTime ? errorInputStyle : {}) }}
                >
                  <option value="">—</option>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="End Time" required error={errors.endTime}>
                <select
                  value={form.endTime}
                  onChange={set("endTime")}
                  style={{ ...inputStyle, ...(errors.endTime ? errorInputStyle : {}) }}
                >
                  <option value="">—</option>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <Field label="Event Type" required error={errors.eventType}>
            <input
              type="text"
              value={form.eventType}
              onChange={set("eventType")}
              placeholder="e.g. Meeting, Gathering"
              style={{ ...inputStyle, ...(errors.eventType ? errorInputStyle : {}) }}
            />
          </Field>

          <Field label="# of Attendees" error={errors.attendeeCount}>
            <input
              type="number"
              min={0}
              value={form.attendeeCount}
              onChange={set("attendeeCount")}
              style={inputStyle}
            />
          </Field>

          {/* Catering toggle */}
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, fontWeight: 600, color: COLORS.TEXT_SECONDARY,
              fontFamily: FONT_FAMILY, cursor: "pointer", userSelect: "none",
            }}>
              <input
                type="checkbox"
                checked={form.catering}
                onChange={set("catering")}
                style={{ width: 16, height: 16, accentColor: COLORS.AQUA, cursor: "pointer" }}
              />
              Catering Required
            </label>
          </div>

          {/* Details section (collapsed by default) */}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            style={{
              background: "transparent", border: "none", padding: 0,
              marginBottom: showDetails ? 12 : 14,
              color: COLORS.AQUA, fontSize: 12, fontWeight: 700,
              fontFamily: FONT_FAMILY, cursor: "pointer",
            }}
          >
            {showDetails ? "Hide Details ▴" : "Show Details ▾"}
          </button>

          {showDetails && (
            <div style={{
              padding: "14px 14px 2px",
              background: COLORS.BG_SURFACE_ALT,
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: RADIUS.MD,
              marginBottom: 14,
            }}>
              <Field label="Waste Needs">
                <input type="text" value={form.wasteNeeds} onChange={set("wasteNeeds")}
                  style={{ ...inputStyle, background: COLORS.BG_SURFACE }} />
              </Field>
              <Field label="Security">
                <input type="text" value={form.security} onChange={set("security")}
                  style={{ ...inputStyle, background: COLORS.BG_SURFACE }} />
              </Field>
              <Field label="Security Post Hours">
                <input type="text" value={form.securityPostHours} onChange={set("securityPostHours")}
                  style={{ ...inputStyle, background: COLORS.BG_SURFACE }} />
              </Field>
            </div>
          )}

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Contact Name">
                <input type="text" value={form.contactName} onChange={set("contactName")} style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Contact Phone">
                <input type="text" value={form.contactPhone} onChange={set("contactPhone")} style={inputStyle} />
              </Field>
            </div>
          </div>

          {submitError && (
            <div style={{
              padding: "10px 14px", marginTop: 4,
              background: `${COLORS.ERROR}10`,
              border: `1px solid ${COLORS.ERROR}44`,
              borderRadius: RADIUS.MD,
              fontSize: 12, color: COLORS.ERROR, fontFamily: FONT_FAMILY,
            }}>
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: `1px solid ${COLORS.BORDER}`,
          background: COLORS.BG_SURFACE_ALT,
          flexShrink: 0,
        }}>
          {confirmingDelete ? (
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ERROR, fontFamily: FONT_FAMILY }}>
                Are you sure? This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmingDelete(false)} disabled={busy} style={secondaryBtnStyle}>
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  style={{ ...primaryBtnStyle, background: COLORS.ERROR }}
                >
                  {deleting && spinner}
                  Confirm Delete
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                {isEdit && (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    disabled={busy}
                    style={{
                      ...secondaryBtnStyle,
                      color: COLORS.ERROR,
                      borderColor: `${COLORS.ERROR}55`,
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} disabled={busy} style={secondaryBtnStyle}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={busy} style={primaryBtnStyle}>
                  {saving && spinner}
                  {isEdit ? "Save Changes" : "Add Event"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
