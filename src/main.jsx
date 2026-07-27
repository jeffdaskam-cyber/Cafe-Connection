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
const showCatering = CATERING_ENABLED && isCateringPath(window.location.pathname);

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
