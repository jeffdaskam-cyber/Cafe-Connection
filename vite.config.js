import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serve the Vercel serverless functions in `api/` from the Vite dev server.
 *
 * Vercel runs these in production; without this, `npm run dev` returns 404 for
 * every /api/* call and serverless behavior can't be exercised locally at all.
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
        const candidates = [`api/${route}.mjs`, `api/${route}.js`]
          .map((p) => resolve(process.cwd(), p))
          .filter((p) => existsSync(p));

        if (candidates.length === 0) return next();

        try {
          const body = await readJsonBody(req);
          const mod = await server.ssrLoadModule(pathToFileURL(candidates[0]).pathname);
          await mod.default({ ...req, body, headers: req.headers, method: req.method },
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
