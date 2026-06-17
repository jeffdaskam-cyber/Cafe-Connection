/**
 * SetupReportEntryModal — create / edit / delete a native setup/reset entry.
 *
 * Writes to the `setup_report_entries` Firestore collection (Phase 1 schema).
 * Create mode when `existingEntry` is null; Edit mode (with Delete) otherwise.
 * The date picker is constrained to the viewed week (Sunday–Saturday).
 *
 * Phase 2 scope: authoring only. The Setup Report display still reads from
 * Google Sheets until the Phase 3 cutover, so onSaved/onDeleted just close.
 */

import { useEffect, useState } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
  query, where, orderBy, getDocs,
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

const ACTION_OPTIONS = [
  { value: "setup", label: "Setup" },
  { value: "reset", label: "Reset" },
  { value: "both",  label: "Both" },
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

// "HH:MM" (24h) → "H:MM AM/PM" for read-only display of a sourced start time
function formatTime12hr(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const CAMPUS_LABELS = { mesa: "Mesa", foothills: "Foothills", center_green: "Center Green" };

// Label for an Event Report entry in the picker dropdown, e.g. "Wed, Jun 17 6:00 PM — Mixer (Mesa)"
function formatEventOption(ev) {
  const campusLabel = CAMPUS_LABELS[ev.campus] || ev.campus || "";
  const dateStr = ev.date?.toDate
    ? ev.date.toDate().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";
  const timeStr = ev.startTime ? formatTime12hr(ev.startTime) : "";
  const when = `${dateStr}${timeStr ? " " + timeStr : ""}`.trim();
  return `${when ? when + " — " : ""}${ev.eventName || "(untitled)"}${campusLabel ? ` (${campusLabel})` : ""}`;
}

// Local "YYYY-MM-DD" (toISOString would shift across the UTC boundary)
function toIsoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local"> values
function toDatetimeLocal(date) {
  return `${toIsoLocal(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function emptyForm() {
  return {
    campus: "",
    date: "",
    action: "",
    setupLocation: "",
    resetLocation: "",
    availableAt: "",
    deadlineAt: "",
    description: "",
    diagram: false,
    eventName: "",
    attendeeCount: "",
    eventDate: "",
    eventStartTime: "",
  };
}

function formFromEntry(entry) {
  return {
    campus: entry.campus ?? "",
    date: entry.date?.toDate ? toIsoLocal(entry.date.toDate()) : "",
    action: entry.action ?? "",
    setupLocation: entry.setupLocation ?? "",
    resetLocation: entry.resetLocation ?? "",
    availableAt: entry.availableAt?.toDate ? toDatetimeLocal(entry.availableAt.toDate()) : "",
    deadlineAt: entry.deadlineAt?.toDate ? toDatetimeLocal(entry.deadlineAt.toDate()) : "",
    description: entry.description ?? "",
    diagram: !!entry.diagram,
    eventName: entry.eventName ?? "",
    attendeeCount: entry.attendeeCount ?? "",
    eventDate: entry.eventDate?.toDate ? toIsoLocal(entry.eventDate.toDate()) : "",
    eventStartTime: entry.eventStartTime ?? "",
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

// Applied to event fields that are auto-filled from a chosen Event Report entry.
const readOnlyStyle = {
  background: COLORS.BG_SURFACE_HOVER,
  color: COLORS.TEXT_MUTED,
  cursor: "not-allowed",
};

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

export default function SetupReportEntryModal({
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showEventDetails, setShowEventDetails] = useState(true);

  // Event picker — events from the Event Report for this same week.
  const [eventOptions, setEventOptions] = useState([]);
  const [eventOptionsLoading, setEventOptionsLoading] = useState(false);
  // '' = nothing chosen, 'new' = manual entry, any other string = an event_report_entries doc ID
  const [selectedEventId, setSelectedEventId] = useState("");

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
    // Expand the event section when editing an entry that has event data
    setShowEventDetails(
      !!existingEntry &&
        !!(existingEntry.eventName || existingEntry.attendeeCount != null ||
           existingEntry.eventDate || existingEntry.eventStartTime)
    );
    // A saved event can't be reverse-matched to its source doc, so edit mode
    // with saved event data defaults to manual entry (fields pre-filled, editable).
    setSelectedEventId(existingEntry && existingEntry.eventName ? "new" : "");
  }, [isOpen, existingEntry]);

  // Load this week's Event Report entries to offer as picker options.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function loadEventOptions() {
      setEventOptionsLoading(true);
      try {
        const ws = new Date(weekOf);
        ws.setHours(0, 0, 0, 0);
        const q = query(
          collection(db, "event_report_entries"),
          where("weekOf", "==", Timestamp.fromDate(ws)),
          orderBy("date"),
          orderBy("startTime"),
        );
        const snapshot = await getDocs(q);
        if (!cancelled) {
          setEventOptions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error("Failed to load event options:", err);
        if (!cancelled) setEventOptions([]);
      } finally {
        if (!cancelled) setEventOptionsLoading(false);
      }
    }

    loadEventOptions();
    return () => { cancelled = true; };
  }, [isOpen, weekOf]);

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

  // Action drives which location fields are shown; clear the hidden one.
  const handleActionChange = (e) => {
    const action = e.target.value;
    setForm((f) => ({
      ...f,
      action,
      setupLocation: action === "reset" ? "" : f.setupLocation,
      resetLocation: action === "setup" ? "" : f.resetLocation,
    }));
    setErrors((prev) => ({ ...prev, action: null, setupLocation: null, resetLocation: null }));
  };

  // Event picker selection → drive the event form fields.
  function handleEventSelect(value) {
    setSelectedEventId(value);

    if (value === "") {
      // Clear all event fields
      setForm((f) => ({ ...f, eventName: "", attendeeCount: "", eventDate: "", eventStartTime: "" }));
      return;
    }
    if (value === "new") {
      // Manual entry — keep whatever's there for the user to edit
      return;
    }
    // A real Event Report entry was chosen — auto-fill from it
    const ev = eventOptions.find((e) => e.id === value);
    if (!ev) return;
    setForm((f) => ({
      ...f,
      eventName: ev.eventName || "",
      attendeeCount: ev.attendeeCount != null ? String(ev.attendeeCount) : "",
      eventDate: ev.date?.toDate ? toIsoLocal(ev.date.toDate()) : "",
      eventStartTime: ev.startTime || "",   // stored as "HH:MM"
    }));
  }

  const showSetupLocation = form.action === "setup" || form.action === "both";
  const showResetLocation = form.action === "reset" || form.action === "both";

  function validate() {
    const next = {};
    if (!form.campus) next.campus = "Select a campus.";
    if (!form.date) next.date = "Select a date.";
    else if (form.date < minDate || form.date > maxDate) {
      next.date = "Date must fall within the viewed week.";
    }
    if (!form.action) next.action = "Select an action.";
    if (showSetupLocation && !form.setupLocation.trim()) {
      next.setupLocation = "Setup location is required.";
    }
    if (showResetLocation && !form.resetLocation.trim()) {
      next.resetLocation = "Reset location is required.";
    }
    if (!form.availableAt) next.availableAt = "Set an available date/time.";
    if (!form.deadlineAt) next.deadlineAt = "Set a deadline date/time.";
    else if (form.availableAt && form.deadlineAt <= form.availableAt) {
      next.deadlineAt = "Deadline must be after the available time.";
    }
    if (!form.description.trim()) next.description = "Description is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function buildPayload() {
    return {
      weekOf: Timestamp.fromDate(weekStart),
      campus: form.campus,
      // Noon local avoids DST / UTC boundary day-shift (repo date convention).
      date: Timestamp.fromDate(new Date(form.date + "T12:00:00")),
      action: form.action,
      setupLocation: form.action !== "reset" ? form.setupLocation.trim() : null,
      resetLocation: form.action !== "setup" ? form.resetLocation.trim() : null,
      availableAt: Timestamp.fromDate(new Date(form.availableAt)),
      deadlineAt: Timestamp.fromDate(new Date(form.deadlineAt)),
      description: form.description.trim(),
      diagram: !!form.diagram,
      eventName: form.eventName.trim() || null,
      attendeeCount: form.attendeeCount === "" ? null : Number(form.attendeeCount),
      eventDate: form.eventDate ? Timestamp.fromDate(new Date(form.eventDate + "T12:00:00")) : null,
      eventStartTime: form.eventStartTime || null,
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
        await updateDoc(doc(db, "setup_report_entries", existingEntry.id), buildPayload());
      } else {
        await addDoc(collection(db, "setup_report_entries"), {
          ...buildPayload(),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onSaved?.();
    } catch (err) {
      console.error("Error saving setup report entry:", err);
      setSubmitError("Could not save the task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSubmitError("");
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "setup_report_entries", existingEntry.id));
      onDeleted?.();
    } catch (err) {
      console.error("Error deleting setup report entry:", err);
      setSubmitError("Could not delete the task. Please try again.");
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
              }}>{isEdit ? "Edit Task" : "Add Task"}</div>
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
          {/* Event Details — collapsible, expanded by default */}
          <div style={{
            marginBottom: 14, paddingBottom: 14,
            borderBottom: `1px solid ${COLORS.BORDER}`,
          }}>
            <button
              type="button"
              onClick={() => setShowEventDetails((s) => !s)}
              aria-expanded={showEventDetails}
              style={{
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                color: COLORS.AQUA, fontFamily: FONT_FAMILY,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {showEventDetails ? "Hide Event Details ▴" : "Show Event Details ▾"}
            </button>

            {showEventDetails && (
              <div style={{ marginTop: 14 }}>
                {/* Event picker — events from the Event Report for this week */}
                <Field label="Event">
                  {eventOptionsLoading ? (
                    <p style={{ fontSize: 13, color: COLORS.TEXT_MUTED, fontFamily: FONT_FAMILY, margin: 0 }}>
                      Loading events…
                    </p>
                  ) : (
                    <select
                      value={selectedEventId}
                      onChange={(e) => handleEventSelect(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">— Select an event —</option>
                      {eventOptions.map((ev) => (
                        <option key={ev.id} value={ev.id}>{formatEventOption(ev)}</option>
                      ))}
                      <option value="new">+ New Event (manual entry)</option>
                    </select>
                  )}
                </Field>

                {/* Event fields — read-only when sourced from the Event Report, editable for manual entry */}
                {selectedEventId !== "" && (
                  <>
                    <Field label="Event Name">
                      <input
                        type="text"
                        value={form.eventName}
                        onChange={set("eventName")}
                        readOnly={selectedEventId !== "new"}
                        style={{ ...inputStyle, ...(selectedEventId !== "new" ? readOnlyStyle : {}) }}
                      />
                    </Field>

                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <Field label="# of Attendees">
                          <input
                            type="number"
                            min={0}
                            value={form.attendeeCount}
                            onChange={set("attendeeCount")}
                            readOnly={selectedEventId !== "new"}
                            style={{ ...inputStyle, ...(selectedEventId !== "new" ? readOnlyStyle : {}) }}
                          />
                        </Field>
                      </div>
                      <div style={{ flex: 1 }}>
                        <Field label="Event Date">
                          <input
                            type="date"
                            value={form.eventDate}
                            onChange={set("eventDate")}
                            readOnly={selectedEventId !== "new"}
                            style={{ ...inputStyle, ...(selectedEventId !== "new" ? readOnlyStyle : {}) }}
                          />
                        </Field>
                      </div>
                    </div>

                    <Field label="Event Start Time">
                      {selectedEventId !== "new" ? (
                        <input
                          type="text"
                          value={formatTime12hr(form.eventStartTime)}
                          readOnly
                          style={{ ...inputStyle, ...readOnlyStyle }}
                        />
                      ) : (
                        <select
                          value={form.eventStartTime}
                          onChange={set("eventStartTime")}
                          style={inputStyle}
                        >
                          <option value="">—</option>
                          {TIME_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                  </>
                )}
              </div>
            )}
          </div>

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

          <Field label="Action" required error={errors.action}>
            <select
              value={form.action}
              onChange={handleActionChange}
              style={{ ...inputStyle, ...(errors.action ? errorInputStyle : {}) }}
            >
              <option value="">Select action…</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </Field>

          {showSetupLocation && (
            <Field label="Setup Location" required error={errors.setupLocation}>
              <input
                type="text"
                value={form.setupLocation}
                onChange={set("setupLocation")}
                placeholder="Where to set up"
                style={{ ...inputStyle, ...(errors.setupLocation ? errorInputStyle : {}) }}
              />
            </Field>
          )}

          {showResetLocation && (
            <Field label="Reset Location" required error={errors.resetLocation}>
              <input
                type="text"
                value={form.resetLocation}
                onChange={set("resetLocation")}
                placeholder="Where to reset"
                style={{ ...inputStyle, ...(errors.resetLocation ? errorInputStyle : {}) }}
              />
            </Field>
          )}

          {/* Available / Deadline side by side */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Available Date/Time" required error={errors.availableAt}>
                <input
                  type="datetime-local"
                  step={900}
                  value={form.availableAt}
                  onChange={set("availableAt")}
                  style={{ ...inputStyle, ...(errors.availableAt ? errorInputStyle : {}) }}
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Deadline Date/Time" required error={errors.deadlineAt}>
                <input
                  type="datetime-local"
                  step={900}
                  value={form.deadlineAt}
                  onChange={set("deadlineAt")}
                  style={{ ...inputStyle, ...(errors.deadlineAt ? errorInputStyle : {}) }}
                />
              </Field>
            </div>
          </div>

          <Field label="Description" required error={errors.description}>
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={3}
              placeholder="What needs to be done"
              style={{ ...inputStyle, resize: "vertical", ...(errors.description ? errorInputStyle : {}) }}
            />
          </Field>

          {/* Diagram toggle */}
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, fontWeight: 600, color: COLORS.TEXT_SECONDARY,
              fontFamily: FONT_FAMILY, cursor: "pointer", userSelect: "none",
            }}>
              <input
                type="checkbox"
                checked={form.diagram}
                onChange={set("diagram")}
                style={{ width: 16, height: 16, accentColor: COLORS.AQUA, cursor: "pointer" }}
              />
              Diagram Available
            </label>
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
                  {isEdit ? "Save Changes" : "Add Task"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
