/**
 * CateringApp.jsx — Catering Companion entry point (mounted at /catering).
 *
 * A second entry point into the same Vite app, sharing Firebase config, theme,
 * and auth with the Cafe Connection staff shell. Any @ucar.edu user who signs
 * in here without an existing staff role is provisioned as `requester`.
 */
import { useState } from "react";

import { AuthProvider, useAuth } from "../contexts/AuthContext.jsx";
import { useRole } from "../hooks/useRole.js";
import LoginPage from "../pages/LoginPage.jsx";
import { COLORS, FONT, RADIUS, SHADOWS } from "../theme.js";
import { SANDBOX_MODE, isCateringAllowed } from "../config/features.js";
import { hasDraft } from "./formState.js";
import IntakeForm from "./IntakeForm.jsx";
import MyRequests from "./MyRequests.jsx";
import { Banner } from "./ui.jsx";

export default function CateringApp() {
  return (
    <AuthProvider selfProvisionRole="requester">
      <CateringShell />
    </AuthProvider>
  );
}

function CateringShell() {
  const { user, loading, logout } = useAuth();
  const { role, roleLoading } = useRole();
  // "list" | "form" — the form is a mode of the same page rather than a route,
  // matching the tab-state navigation the staff shell already uses.
  // An unfinished new request reopens itself, so a refresh mid-form lands the
  // user back in their work rather than on an empty list.
  const [view, setView] = useState(() => (hasDraft() ? "form" : "list"));
  // Set when reopening a saved event for editing; null for a brand-new request.
  const [editing, setEditing] = useState(null);
  // { id, kind } after a save/submit, to highlight and confirm on the list.
  const [justDone, setJustDone] = useState(null);

  if (loading) return <Splash label="Loading…" />;

  if (!user) {
    return (
      <LoginPage
        productName="Catering Companion"
        tagline="Event Services"
        description="Sign in with your UCAR Google account to request catering for an event."
      />
    );
  }

  // During the pilot the module is limited to named people. Say so plainly:
  // without this the rules deny self-provisioning and AuthContext reports
  // "We couldn't verify your account", which reads as a broken sign-in rather
  // than an intentional limit. The rules are the boundary; this is the message.
  if (!isCateringAllowed(user.email)) {
    return (
      <NoticeScreen
        title="Not open yet"
        body={`The Catering Companion is in a limited pilot and ${user.email} is not on the list yet. Event Services can add you.`}
        onSignOut={logout}
      />
    );
  }

  if (roleLoading) return <Splash label="Checking your access…" />;

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.BG_PAGE,
      color: COLORS.TEXT_PRIMARY,
      fontFamily: FONT.FAMILY,
    }}>
      {SANDBOX_MODE && <SandboxBanner />}

      <header style={{
        background: COLORS.NAV_BG,
        borderBottom: `1px solid ${COLORS.NAV_BORDER}`,
        padding: "0 clamp(16px, 4vw, 36px)",
        minHeight: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
        boxShadow: SHADOWS.SM,
      }}>
        <button
          onClick={() => { setView("list"); setEditing(null); setJustDone(null); }}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "12px 0",
            fontFamily: FONT.FAMILY, fontWeight: 800, fontSize: 20,
            letterSpacing: "0.02em", color: "#FFFFFF", textAlign: "left",
          }}>
          <span style={{ color: COLORS.AQUA }}>UCAR</span> Catering Companion
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 4 }}>
          <span style={{
            fontSize: 11, color: "#FFFFFF", maxWidth: 200,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {user.displayName || user.email}
          </span>
          <button onClick={logout} style={{
            background: "transparent", border: `1px solid ${COLORS.BORDER}`,
            borderRadius: RADIUS.MD, padding: "5px 12px", cursor: "pointer",
            fontFamily: FONT.FAMILY, fontWeight: 600, fontSize: 10,
            color: "#FFFFFF", letterSpacing: "0.04em",
          }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 940, margin: "0 auto", padding: "32px clamp(16px, 4vw, 24px) 64px" }}>
        {role === null && (
          <Banner tone="warning" title="Setting up your account">
            We&apos;re finishing your first sign-in. If this message stays put, sign out and back in.
          </Banner>
        )}

        {view === "form" ? (
          <IntakeForm
            user={user}
            existing={editing}
            onCancel={() => { setEditing(null); setView("list"); }}
            onDone={(eventId, kind) => {
              setJustDone(eventId ? { id: eventId, kind } : null);
              setEditing(null);
              setView("list");
            }}
          />
        ) : (
          <MyRequests
            user={user}
            justDone={justDone}
            onNewRequest={() => { setJustDone(null); setEditing(null); setView("form"); }}
            onEdit={(loaded) => { setJustDone(null); setEditing(loaded); setView("form"); }}
          />
        )}
      </main>
    </div>
  );
}

function SandboxBanner() {
  return (
    <div style={{
      background: COLORS.ORANGE, color: COLORS.TEXT_PRIMARY,
      padding: "8px 24px", fontSize: 12, fontWeight: FONT.WEIGHT_BOLD,
      letterSpacing: "0.04em", textAlign: "center",
    }}>
      SANDBOX — connected to the local Firebase Emulator Suite. No production data is reachable.
    </div>
  );
}

/** Full-page message for a signed-in user who cannot use the module yet. */
function NoticeScreen({ title, body, onSignOut }) {
  return (
    <div style={{
      minHeight: "100vh", background: COLORS.BG_PAGE,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT.FAMILY, padding: 24,
    }}>
      <div style={{
        background: COLORS.BG_CARD, border: `1px solid ${COLORS.BORDER}`,
        borderRadius: RADIUS.LG, boxShadow: SHADOWS.SM,
        padding: "32px 36px", maxWidth: 460,
      }}>
        <div style={{
          fontSize: 18, fontWeight: 800, color: COLORS.TEXT_PRIMARY, marginBottom: 10,
        }}>
          {title}
        </div>
        <p style={{
          fontSize: 13, color: COLORS.TEXT_SECONDARY, lineHeight: 1.65, marginBottom: 22,
        }}>
          {body}
        </p>
        <button onClick={onSignOut} style={{
          background: "transparent", border: `1px solid ${COLORS.BORDER}`,
          borderRadius: RADIUS.MD, padding: "7px 16px", cursor: "pointer",
          fontFamily: FONT.FAMILY, fontWeight: 600, fontSize: 11,
          color: COLORS.TEXT_SECONDARY,
        }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Splash({ label }) {
  return (
    <div style={{
      minHeight: "100vh", background: COLORS.BG_PAGE,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT.FAMILY,
    }}>
      <div style={{
        color: COLORS.TEXT_MUTED, fontSize: 12, fontWeight: 500,
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  );
}
