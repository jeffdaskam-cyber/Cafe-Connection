import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "../../firebase.js";
import { launchInviteEmail } from "../../utils/emailLauncher.js";
import { COLORS } from "../../theme.js";

const ROLES = ["user", "manager", "senior_leader", "administrator"];
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function formatRoleLabel(role) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSentDate(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function invitedAtMs(timestamp) {
  if (!timestamp?.toDate) return 0;
  return timestamp.toDate().getTime();
}

async function authedFetch(url, init = {}) {
  const token = await auth.currentUser.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export default function UserInvitations() {
  const [email, setEmail]             = useState("");
  const [role, setRole]               = useState("user");
  const [submitting, setSubmitting]   = useState(false);
  const [errorMsg, setErrorMsg]       = useState("");
  const [invites, setInvites]         = useState([]);
  const [listError, setListError]     = useState("");
  const [rowBusy, setRowBusy]         = useState(null); // email being resent/deleted

  // Subscribe to pending invites, newest first
  useEffect(() => {
    const q = query(collection(db, "pending_invites"), orderBy("invitedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setListError("");
      setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("[UserInvitations] Subscribe error:", err);
      setListError(
        err?.code === "permission-denied"
          ? "Couldn't load pending invites — Firestore rules may not be deployed."
          : `Couldn't load pending invites: ${err?.message || "unknown error"}`
      );
    });
    return () => unsub();
  }, []);

  const generateLink = useCallback(async (toEmail, targetRole) => {
    const res = await authedFetch("/api/generate-invite-link", {
      method: "POST",
      body: JSON.stringify({ email: toEmail, role: targetRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to generate invite.");
    return data.link;
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith("@ucar.edu")) {
      setErrorMsg("Email must be a @ucar.edu address.");
      return;
    }
    setSubmitting(true);
    try {
      const link = await generateLink(trimmed, role);
      launchInviteEmail(trimmed, link);
      setEmail("");
      setRole("user");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(invite) {
    setRowBusy(invite.email);
    try {
      const link = await generateLink(invite.email, invite.role);
      launchInviteEmail(invite.email, link);
    } catch (err) {
      alert(`Resend failed: ${err.message}`);
    } finally {
      setRowBusy(null);
    }
  }

  async function handleDelete(invite) {
    setRowBusy(invite.email);
    try {
      const res = await authedFetch("/api/delete-invite", {
        method: "DELETE",
        body: JSON.stringify({ email: invite.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete invite.");
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setRowBusy(null);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${COLORS.BORDER}`,
    background: COLORS.BG_SURFACE_ALT,
    color: COLORS.TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: "'Poppins',sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: COLORS.TEXT_MUTED,
    marginBottom: 6,
  };

  const now = Date.now();

  return (
    <div>
      {/* ── Create invite form ── */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={labelStyle}>Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@ucar.edu"
            disabled={submitting}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
            style={inputStyle}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{formatRoleLabel(r)}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          style={{
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: (submitting || !email.trim()) ? `${COLORS.AQUA}55` : COLORS.AQUA,
            color: COLORS.TEXT_ON_ACCENT,
            fontFamily: "'Poppins',sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: (submitting || !email.trim()) ? "not-allowed" : "pointer",
            transition: "all .2s",
          }}
        >
          {submitting ? "Sending…" : "Send Invite"}
        </button>

        {errorMsg && (
          <div style={{
            fontSize: 12,
            color: COLORS.ERROR,
            background: `${COLORS.ERROR}12`,
            border: `1px solid ${COLORS.ERROR}33`,
            borderRadius: 6,
            padding: "8px 10px",
          }}>
            {errorMsg}
          </div>
        )}
      </form>

      {/* ── Pending Invites list ── */}
      <div style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: `1px solid ${COLORS.BORDER}`,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.TEXT_MUTED,
          marginBottom: 12,
        }}>
          Pending Invites
        </div>

        {listError ? (
          <div style={{
            fontSize: 12,
            color: COLORS.ERROR,
            background: `${COLORS.ERROR}12`,
            border: `1px solid ${COLORS.ERROR}33`,
            borderRadius: 6,
            padding: "8px 10px",
          }}>
            {listError}
          </div>
        ) : invites.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED, fontStyle: "italic" }}>
            No pending invites.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {invites.map((inv) => {
              const sentMs = invitedAtMs(inv.invitedAt);
              const expired = sentMs === 0 ? false : (now - sentMs) >= EXPIRY_MS;
              const busy = rowBusy === inv.email;
              return (
                <div key={inv.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 12px",
                  background: COLORS.BG_SURFACE_ALT,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.BORDER}`,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: COLORS.TEXT_PRIMARY,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {inv.email}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: COLORS.TEXT_MUTED,
                      marginTop: 3,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}>
                      <span>{formatRoleLabel(inv.role)}</span>
                      <span>·</span>
                      <span>Sent {formatSentDate(inv.invitedAt) || "—"}</span>
                      <span>·</span>
                      <span style={{
                        fontWeight: 700,
                        color: expired ? COLORS.WARNING : COLORS.SUCCESS,
                      }}>
                        {expired ? "Expired" : "Pending"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
                    <button
                      onClick={() => handleResend(inv)}
                      disabled={busy}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: COLORS.AQUA,
                        fontFamily: "'Poppins',sans-serif",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: busy ? "not-allowed" : "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => handleDelete(inv)}
                      disabled={busy}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: COLORS.TEXT_MUTED,
                        fontFamily: "'Poppins',sans-serif",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: busy ? "not-allowed" : "pointer",
                        textDecoration: "underline",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ERROR; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.TEXT_MUTED; }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
