import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, orderBy, onSnapshot, getDocs, Timestamp } from "firebase/firestore";
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

// ── Upload sales report to Storage and return downloadURL ─────────────────
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
      async () => { const url = await getDownloadURL(task.snapshot.ref); resolve(url); }
    );
  });
}

// ── Upload an Event Order PDF to Storage and save metadata to Firestore ───
export async function uploadEventOrder(file, onProgress) {
  const timestamp  = Date.now();
  const storageRef = ref(storage, `event_orders/${timestamp}_${file.name}`);
  const task       = uploadBytesResumable(storageRef, file);

  const downloadURL = await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress && onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => { const url = await getDownloadURL(task.snapshot.ref); resolve(url); }
    );
  });

  // Save metadata to Firestore
  const { addDoc, serverTimestamp } = await import("firebase/firestore");
  await addDoc(collection(db, "event_orders"), {
    fileName:    file.name,
    downloadURL,
    uploadedAt:  serverTimestamp(),
    size:        file.size,
  });

  return downloadURL;
}

// ── Call the Vercel serverless parse function ─────────────────────────────
export async function parseReport(fileUrl, campus, fileName) {
  const res = await fetch("/api/parse-report", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ fileUrl, campus, fileName }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Fetch current week's schedule from Google Drive ───────────────────────
export async function fetchSchedule() {
  const res = await fetch("/api/get-schedule");
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch schedule");
  }
  return res.json();
}

// ── Listen to last 30 days of daily metrics for a campus ─────────────────
export function subscribeToCampus(campus, callback) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    where("date",   ">=", thirtyDaysAgo),
    orderBy("date", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Listen to ALL reports for a campus ───────────────────────────────────
export function subscribeAllReports(campus, callback) {
  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    orderBy("date", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Listen to event orders (most recent first) ────────────────────────────
export function subscribeEventOrders(callback) {
  const q = query(
    collection(db, "event_orders"),
    orderBy("uploadedAt", "desc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Fetch month-end accounting data for all three campuses ────────────────
export async function getMonthEndData(year, month) {
  const CAMPUSES    = ["Mesa Lab", "Foothills", "Center Green"];
  const startDate   = Timestamp.fromDate(new Date(year, month - 1, 1));
  const endDate     = Timestamp.fromDate(new Date(year, month, 1));
  const results     = {};

  await Promise.all(CAMPUSES.map(async (campus) => {
    const q    = query(collection(db, "daily_metrics"),
      where("campus", "==", campus),
      where("date",   ">=", startDate),
      where("date",   "<",  endDate),
      orderBy("date", "asc"));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const periodDoc = docs.find(d => d.report_type === "period");
    if (periodDoc) {
      results[campus] = { total_taxes: periodDoc.total_taxes ?? null, cash_drop: periodDoc.cash_drop ?? null, source: "period" };
    } else {
      const total_taxes = docs.reduce((s, d) => s + (d.total_taxes ?? 0), 0);
      const cash_drop   = docs.reduce((s, d) => s + (d.cash_drop   ?? 0), 0);
      results[campus]   = {
        total_taxes: docs.length > 0 ? Math.round(total_taxes * 100) / 100 : null,
        cash_drop:   docs.length > 0 ? Math.round(cash_drop   * 100) / 100 : null,
        source:      docs.length > 0 ? "daily" : "none",
      };
    }
  }));

  return results;
}
