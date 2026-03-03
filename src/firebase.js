import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, query, where, orderBy, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey:            import.meta.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        import.meta.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     import.meta.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
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

// ── Listen to last 30 days of metrics for a campus ────────────────────────
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
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(data);
  });
}
