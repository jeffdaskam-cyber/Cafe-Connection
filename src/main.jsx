import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { CATERING_ENABLED } from "./config/features.js";
import { isCateringPath } from "./catering/routing.js";

// Second entry point. Lazily imported so that when VITE_CATERING_ENABLED is off
// the catering chunk is never fetched and the production bundle is unaffected.
const CateringApp = lazy(() => import("./catering/CateringApp.jsx"));

// With the flag off, /catering is not a route at all — it falls through to the
// normal Cafe Connection shell ("dark" in production until Phase 5 sign-off).
const onCateringPath = isCateringPath(window.location.pathname);
const showCatering = CATERING_ENABLED && onCateringPath;

// The fall-through is deliberate in production but baffling in development: the
// Cafe Connection shell has no requester self-provisioning, so signing in there
// reports "You don't have access to this application" — which reads as a
// permissions problem rather than a routing one. Say which decision was made and
// why, so the console answers the question instead of the rules doc.
if (import.meta.env.DEV) {
  if (showCatering) {
    console.info("[catering] mounting the Catering Companion at", window.location.pathname);
  } else if (onCateringPath) {
    console.warn(
      "[catering] VITE_CATERING_ENABLED is not 'true' — falling through to the " +
        "Cafe Connection shell. Signing in here will say you have no access; " +
        "that is this flag, not your account. Start with `npm run sandbox`."
    );
  } else {
    console.info(
      `[catering] not a catering path (${window.location.pathname}) — ` +
        "Cafe Connection shell. The Catering Companion lives at /catering."
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {showCatering ? (
      <Suspense fallback={null}>
        <CateringApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);
