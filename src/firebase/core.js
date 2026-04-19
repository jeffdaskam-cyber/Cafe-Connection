import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, getIdToken, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

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
setPersistence(auth, browserLocalPersistence).catch(console.error);

export async function getAuthToken() {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  return getIdToken(auth.currentUser);
}
