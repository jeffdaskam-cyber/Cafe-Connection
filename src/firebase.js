import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// ── Upload file to Storage and return downloadURL ──────────────────────────
export function uploadReport(campus, file, onProgress) {
  const safeCampus = campus.replace(/\s+/g, "_");
  const timestamp  = Date.now();
  const storageRef = ref(storage, `reports/${safeCampus}/${timestamp}_${file.name}`);
  const task       = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress && onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

// ── Call the Vercel serverless parse function ──────────────────────────────
export async function parseReport(fileUrl, campus, fileName) {
  const res = await fetch("/api/parse-report", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ fileUrl, campus, fileName }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Listen to last 30 days of daily metrics for a campus ──────────────────
export function subscribeToCampus(campus, callback) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    where("date",   ">=", thirtyDaysAgo),
    orderBy("date", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Listen to ALL reports for a campus (all report_types, all dates) ──────
export function subscribeAllReports(campus, callback) {
  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    orderBy("date", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Fetch month-end accounting data for all three campuses ────────────────
// Used by the Month-End Report button.
// Looks for a period report first; falls back to summing daily reports.
// Returns: { "Mesa Lab": { total_taxes, cash_drop }, "Foothills": {...}, "Center Green": {...} }
export async function getMonthEndData(year, month) {
  const CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

  // Build date range for the requested month
  const startDate = new Date(year, month - 1, 1);          // e.g. Oct 1
  const endDate   = new Date(year, month, 1);               // e.g. Nov 1 (exclusive)

  const results = {};

  await Promise.all(CAMPUSES.map(async (campus) => {
    // Query all docs for this campus in this month
    const q = query(
      collection(db, "daily_metrics"),
      where("campus", "==", campus),
      where("date",   ">=", startDate),
      where("date",   "<",  endDate),
      orderBy("date", "asc")
    );

    const snap = await new Promise((resolve, reject) => {
      // Use getDocs-style via onSnapshot with unsubscribe
      const unsub = onSnapshot(q, resolve, reject);
      // Immediately unsubscribe after first snapshot
      setTimeout(unsub, 0);
    });

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Prefer period report (has direct total_taxes and cash_drop)
    const periodDoc = docs.find(d => d.report_type === "period");

    if (periodDoc) {
      results[campus] = {
        total_taxes: periodDoc.total_taxes ?? null,
        cash_drop:   periodDoc.cash_drop   ?? null,
        source:      "period",
      };
    } else {
      // Fall back to summing daily reports
      const total_taxes = docs.reduce((s, d) => s + (d.total_taxes ?? 0), 0);
      const cash_drop   = docs.reduce((s, d) => s + (d.cash_drop   ?? 0), 0);
      results[campus] = {
        total_taxes: docs.length > 0 ? Math.round(total_taxes * 100) / 100 : null,
        cash_drop:   docs.length > 0 ? Math.round(cash_drop   * 100) / 100 : null,
        source:      docs.length > 0 ? "daily" : "none",
      };
    }
  }));

  return results;
}
