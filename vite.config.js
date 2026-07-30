import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Only the Catering Companion's own endpoint is served locally. Deliberately
// NOT every function in api/: the rest belong to Cafe Connection proper, need
// real Google credentials, and used to 404 in dev — serving them here would
// change existing behavior (to a 500) for no benefit to this module.
const DEV_API_ROUTES = new Set(["catering"]);

/**
 * Serve the Catering Companion's Vercel functions from the Vite dev server.
 *
 * Vercel runs these in production; without this, `npm run dev` returns 404 for
 * /api/catering and none of it can be exercised locally.
 * Dev only — it never affects a production build.
 */
function devApiRoutes() {
  return {
    name: "dev-api-routes",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const route = req.url.split("?")[0].replace(/^\/api\//, "");
        // Everything else falls through to Vite, exactly as before.
        if (!DEV_API_ROUTES.has(route)) return next();
        const candidates = [`api/${route}.mjs`, `api/${route}.js`]
          .map((p) => resolve(process.cwd(), p))
          .filter((p) => existsSync(p));

        if (candidates.length === 0) return next();

        try {
          const body = await readJsonBody(req);
          // Vercel supplies req.query; a raw Node request does not, and the
          // cron invokes /api/catering?action=reconcile as a GET.
          const query = Object.fromEntries(
            new URL(req.url, "http://localhost").searchParams
          );
          const mod = await server.ssrLoadModule(pathToFileURL(candidates[0]).pathname);
          await mod.default({ ...req, body, query, headers: req.headers, method: req.method },
            expressLikeResponse(res));
        } catch (err) {
          server.config.logger.error(`[dev-api] ${route} failed: ${err.stack || err}`);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: String(err.message || err) }));
          }
        }
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve_, reject) => {
    if (req.method === "GET" || req.method === "HEAD") return resolve_({});
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve_({});
      try { resolve_(JSON.parse(raw)); } catch { resolve_({}); }
    });
    req.on("error", reject);
  });
}

/** Minimal shim of the res.status().json() surface the handlers use. */
function expressLikeResponse(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    json(payload) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
      return this;
    },
    send(payload) { res.end(payload); return this; },
  };
}

export default defineConfig(({ mode }) => {
  // In sandbox mode, point the dev-server-hosted API handlers at the local
  // emulator too. Vite only exposes VITE_-prefixed vars to the client, so the
  // Admin SDK vars the handlers read have to be set on process.env here —
  // otherwise `npm run dev:sandbox` would serve /api routes that try to reach a
  // live Firebase project.
  const env = loadEnv(mode, process.cwd(), "");
  if (env.VITE_USE_FIREBASE_EMULATORS === "true") {
    const host = env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
    const firestorePort = env.VITE_FIREBASE_EMULATOR_FIRESTORE_PORT || "8080";
    const authPort = env.VITE_FIREBASE_EMULATOR_AUTH_PORT || "9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= `${host}:${firestorePort}`;
    // Without this the Admin SDK verifies ID tokens against Google's public
    // keys, which rejects every token the Auth emulator issues.
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `${host}:${authPort}`;
    process.env.GCLOUD_PROJECT ??= env.VITE_FIREBASE_PROJECT_ID || "demo-cafe-connection";
    const storagePort = env.VITE_FIREBASE_EMULATOR_STORAGE_PORT || "9199";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= `${host}:${storagePort}`;
    process.env.FIREBASE_STORAGE_BUCKET ??=
      env.VITE_FIREBASE_STORAGE_BUCKET || "demo-cafe-connection.firebasestorage.app";
  }

  return {
    plugins: [react(), devApiRoutes()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("firebase")) return "firebase";
            if (id.includes("recharts")) return "charts";
            if (id.includes("exceljs") || id.includes("pdf-parse")) return "documents";
            if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf-export";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("react-dropzone")) return "uploads";
            return "vendor";
          },
        },
      },
    },
  };
});
