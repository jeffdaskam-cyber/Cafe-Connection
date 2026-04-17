import { useState, useEffect } from "react";
import { sendSignInLinkToEmail, signInWithEmailLink, isSignInWithEmailLink } from "firebase/auth";
import { auth } from "../firebase.js";
import { COLORS, SHADOWS, RADIUS } from "../theme.js";

// localStorage key used to persist the email across the magic-link redirect
const EMAIL_STORAGE_KEY = "cafeConnectionSignInEmail";

function WaveGraphic({ color = COLORS.AQUA, opacity = 0.18, width = 420, height = 80 }) {
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

// ── Login Page ─────────────────────────────────────────────────────────────────
// Supports Firebase magic-link (passwordless) email auth restricted to @ucar.edu.
//
// Firebase setup required:
//   1. Firebase Console → Authentication → Sign-in methods → enable "Email link (passwordless)"
//   2. Firebase Console → Authentication → Settings → Authorized Domains →
//      add "cafe-connection-eosin.vercel.app" (and "localhost" for local dev)
//
// Flow:
//   A. User visits app → not a magic link URL → show email form
//   B. User enters @ucar.edu email → magic link sent → "check your email" state
//   C. User clicks link in email → redirected to app with ?oobCode=... params
//   D. App detects magic link URL → auto-completes sign-in → AuthContext updates
//   E. (Cross-device) If email not in localStorage → prompt user to re-enter email

export default function LoginPage() {
  const [email,    setEmail]    = useState("");
  const [status,   setStatus]   = useState("idle");
  // idle | sending | sent | completing | crossDevice | error
  const [errorMsg, setErrorMsg] = useState("");

  // On mount: check if this is a magic-link return URL
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const savedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
      if (savedEmail) {
        completeMagicLink(savedEmail);
      } else {
        // Cross-device: link opened on a different device than where it was requested
        setStatus("crossDevice");
      }
    }
  }, []);

  async function completeMagicLink(emailForLink) {
    setStatus("completing");
    try {
      await signInWithEmailLink(auth, emailForLink, window.location.href);
      localStorage.removeItem(EMAIL_STORAGE_KEY);
      // Remove magic-link params from URL without triggering a reload
      window.history.replaceState(null, "", window.location.pathname);
      // AuthContext's onAuthStateChanged will update user state automatically
    } catch (err) {
      console.error("[LoginPage] Magic link sign-in failed:", err);
      setStatus("error");
      setErrorMsg(
        err.code === "auth/invalid-action-code"
          ? "This link has already been used or has expired. Please request a new one."
          : err.message || "Sign-in failed. Please request a new link."
      );
    }
  }

  async function handleSendLink(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.endsWith("@ucar.edu")) {
      setStatus("error");
      setErrorMsg("Access is restricted to @ucar.edu email addresses.");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    try {
      await sendSignInLinkToEmail(auth, trimmed, {
        // Redirect back to the same origin (works for both prod and localhost)
        url: window.location.origin,
        handleCodeInApp: true,
      });
      // Save email so we can complete sign-in after the redirect
      localStorage.setItem(EMAIL_STORAGE_KEY, trimmed);
      setStatus("sent");
    } catch (err) {
      console.error("[LoginPage] sendSignInLinkToEmail failed:", err);
      setStatus("error");
      setErrorMsg(err.message || "Could not send login link. Please try again.");
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isBusy = status === "sending" || status === "completing";

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.BG_PAGE,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Poppins',sans-serif",
      padding: "24px",
    }}>

      <div style={{
        width: "100%", maxWidth: 420,
        background: COLORS.BG_SURFACE, borderRadius: RADIUS.XL,
        border: `1px solid ${COLORS.BORDER}`,
        padding: "40px 40px 36px",
        position: "relative", overflow: "hidden",
        boxShadow: SHADOWS.XL,
      }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${COLORS.AQUA}, ${COLORS.LAQUA}, transparent)`,
          borderRadius: `${RADIUS.XL} ${RADIUS.XL} 0 0` }} />

        {/* Background wave */}
        <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.06 }}>
          <WaveGraphic color={COLORS.AQUA} opacity={1} width={500} height={120} />
        </div>

        {/* Logo mark */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.TEXT_PRIMARY }}>
            <span style={{ color: COLORS.AQUA }}>UCAR</span> Cafe Connection
          </div>
          <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 500,
            letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Internal Operations Hub
          </div>
        </div>

        {/* ── States ─────────────────────────────────────────────────────────── */}

        {/* Completing sign-in */}
        {status === "completing" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✨</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT_PRIMARY, marginBottom: 8 }}>
              Signing you in…
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_MUTED }}>Just a moment.</div>
            <div style={{ marginTop: 20, height: 2, background: COLORS.BORDER, borderRadius: 4,
              overflow: "hidden", maxWidth: 180, margin: "20px auto 0" }}>
              <div style={{ height: "100%", width: "60%", background: COLORS.AQUA,
                borderRadius: 4, animation: "ucar-slide 1.4s ease-in-out infinite alternate" }} />
            </div>
          </div>
        )}

        {/* Link sent */}
        {status === "sent" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT_PRIMARY, marginBottom: 10 }}>
              Check your inbox
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, lineHeight: 1.7, marginBottom: 24 }}>
              A sign-in link was sent to{" "}
              <span style={{ color: COLORS.AQUA, fontWeight: 600 }}>{email}</span>.{" "}
              Click the link in the email to sign in. The link expires in 1 hour.
            </div>
            <button
              onClick={() => { setStatus("idle"); setEmail(""); }}
              style={{ background: "transparent", border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 8, padding: "8px 20px", color: COLORS.TEXT_SECONDARY,
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12,
                cursor: "pointer" }}>
              Use a different email
            </button>
          </div>
        )}

        {/* Cross-device: magic link but no saved email */}
        {status === "crossDevice" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.TEXT_PRIMARY, marginBottom: 8 }}>
              Confirm your email
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, marginBottom: 20, lineHeight: 1.6 }}>
              You opened the sign-in link on a different device. Please re-enter your
              @ucar.edu email to complete sign-in.
            </div>
            <form onSubmit={(e) => { e.preventDefault(); completeMagicLink(email.trim().toLowerCase()); }}>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@ucar.edu"
                autoFocus
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 8,
                  border: `1px solid ${COLORS.BORDER}`, background: COLORS.BG_SURFACE_ALT,
                  color: COLORS.TEXT_PRIMARY, fontFamily: "'Poppins',sans-serif",
                  fontSize: 13, fontWeight: 500, outline: "none",
                  boxSizing: "border-box", marginBottom: 12,
                }} />
              <button type="submit" disabled={!email.trim()}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
                  background: email.trim() ? COLORS.AQUA : `${COLORS.AQUA}55`,
                  color: COLORS.TEXT_ON_ACCENT, fontFamily: "'Poppins',sans-serif",
                  fontWeight: 700, fontSize: 13,
                  cursor: email.trim() ? "pointer" : "not-allowed",
                }}>
                Complete Sign-In
              </button>
            </form>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div>
            <div style={{ background: `${COLORS.WARNING}15`, border: `1px solid ${COLORS.WARNING}44`,
              borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: COLORS.WARNING, fontWeight: 600, marginBottom: 4 }}>
                Sign-in error
              </div>
              <div style={{ fontSize: 11, color: COLORS.TEXT_SECONDARY }}>{errorMsg}</div>
            </div>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
                background: COLORS.AQUA, color: COLORS.TEXT_ON_ACCENT,
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Try Again
            </button>
          </div>
        )}

        {/* Idle / initial email form */}
        {(status === "idle" || status === "sending") && (
          <form onSubmit={handleSendLink}>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 8 }}>
              Sign In
            </div>
            <div style={{ fontSize: 12, color: COLORS.TEXT_SECONDARY, marginBottom: 24, lineHeight: 1.6 }}>
              Enter your UCAR email and we'll send you a one-click sign-in link.
              No password required.
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: COLORS.TEXT_MUTED, fontWeight: 600,
                letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>
                Email Address
              </div>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@ucar.edu"
                autoFocus
                disabled={isBusy}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 8,
                  border: `1px solid ${COLORS.BORDER}`, background: COLORS.BG_SURFACE_ALT,
                  color: COLORS.TEXT_PRIMARY, fontFamily: "'Poppins',sans-serif",
                  fontSize: 13, fontWeight: 500, outline: "none",
                  boxSizing: "border-box",
                  opacity: isBusy ? 0.6 : 1,
                }} />
            </div>

            <button
              type="submit"
              disabled={isBusy || !email.trim()}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
                background: (isBusy || !email.trim()) ? `${COLORS.AQUA}55` : COLORS.AQUA,
                color: COLORS.TEXT_ON_ACCENT, fontFamily: "'Poppins',sans-serif",
                fontWeight: 700, fontSize: 13,
                cursor: (isBusy || !email.trim()) ? "not-allowed" : "pointer",
                transition: "all .2s",
              }}>
              {status === "sending" ? "Sending link…" : "Send Sign-In Link"}
            </button>

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 10,
              color: COLORS.TEXT_MUTED, fontWeight: 500, letterSpacing: "0.04em" }}>
              🔒 Restricted to @ucar.edu email addresses
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
