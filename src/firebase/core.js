import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import {
  getAuth, getIdToken, setPersistence, browserLocalPersistence, connectAuthEmulator,
} from "firebase/auth";

// ── Sandbox mode ─────────────────────────────────────────────────────────────
// When VITE_USE_FIREBASE_EMULATORS=true the SDK is pointed at the local
// Firebase Emulator Suite instead of a live project, so catering development
// can never touch production Cafe Connection data. See docs/catering/SANDBOX.md.
// This must never be set in the production Vercel environment.
const USE_EMULATORS = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

const EMULATOR_HOST = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
const EMULATOR_PORTS = {
  auth:      Number(import.meta.env.VITE_FIREBASE_EMULATOR_AUTH_PORT)      || 9099,
  firestore: Number(import.meta.env.VITE_FIREBASE_EMULATOR_FIRESTORE_PORT) || 8080,
  storage:   Number(import.meta.env.VITE_FIREBASE_EMULATOR_STORAGE_PORT)   || 9199,
};

// The emulators only need a project ID. A "demo-" prefixed ID is recognized by
// the Emulator Suite as offline-only — it can never reach a live project even
// if credentials were present — so sandbox runs require no real secrets.
const SANDBOX_CONFIG = {
  apiKey:        "demo-api-key",
  authDomain:    "localhost",
  projectId:     "demo-cafe-connection",
  storageBucket: "demo-cafe-connection.firebasestorage.app",
  appId:         "1:000000000000:web:demo",
};

const envConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Drop unset keys so they don't clobber the sandbox defaults below.
const definedEnvConfig = Object.fromEntries(
  Object.entries(envConfig).filter(([, value]) => value !== undefined && value !== "")
);

const firebaseConfig = USE_EMULATORS
  ? { ...SANDBOX_CONFIG, ...definedEnvConfig }
  : envConfig;

const REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];
const missingConfig = REQUIRED_CONFIG_KEYS.filter((key) => !firebaseConfig[key]);
if (missingConfig.length) {
  throw new Error(
    `Missing required Firebase config: ${missingConfig
      .map((key) => `VITE_FIREBASE_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`)
      .join(", ")}. Check your .env file.`
  );
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORTS.storage);
  // Loud on purpose: this banner is the signal that no live data is in play.
  console.warn(
    `[firebase] SANDBOX MODE — project "${firebaseConfig.projectId}" on emulators at ` +
      `${EMULATOR_HOST} (auth:${EMULATOR_PORTS.auth} firestore:${EMULATOR_PORTS.firestore} ` +
      `storage:${EMULATOR_PORTS.storage}). No production data is reachable.`
  );
}

setPersistence(auth, browserLocalPersistence).catch(console.error);

export async function getAuthToken() {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  return getIdToken(auth.currentUser);
}
