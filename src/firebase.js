/**
 * firebase.js — Firebase client initialization and Firestore/Storage helpers.
 *
 * Initializes the Firebase app (Auth, Firestore, Storage) using VITE_ environment
 * variables. Exports reusable async helpers used by all widgets and serverless
 * functions: file uploads, Firestore reads/writes, real-time subscriptions,
 * and the schedule/specials fetch wrappers.
 */
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, orderBy, onSnapshot, getDocs, getDoc, addDoc, setDoc, doc, limit, serverTimestamp, Timestamp, deleteDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getAuth, getIdToken, setPersistence, browserLocalPersistence } from "firebase/auth";

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
export const auth    = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);

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
  await addDoc(collection(db, "event_orders"), {
    fileName:    file.name,
    downloadURL,
    uploadedAt:  serverTimestamp(),
    size:        file.size,
  });

  return downloadURL;
}

// ── Helper: get Firebase ID token for authenticated API calls ─────────────
async function getAuthToken() {
  if (!auth.currentUser) throw new Error("Not authenticated.");
  return getIdToken(auth.currentUser);
}

// ── Call the Vercel serverless parse function ─────────────────────────────
export async function parseReport(fileUrl, campus, fileName) {
  const token = await getAuthToken();
  const res = await fetch("/api/parse-report", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ fileUrl, campus, fileName }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Fetch week's schedule from Google Drive ───────────────────────────────
// weekOf: ISO Monday string "YYYY-MM-DD" (optional; omit for auto-detect)
export async function fetchSchedule(weekOf = null) {
  const token = await getAuthToken();
  const url   = weekOf ? `/api/get-schedule?weekOf=${weekOf}` : "/api/get-schedule";
  const res   = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch schedule");
  }
  return res.json();
}

// ── Fetch week's cafe specials from Google Drive ──────────────────────────
// weekOf: ISO Monday string "YYYY-MM-DD" (optional; omit for auto-detect)
// campus: e.g. "Mesa Lab" — used to select the campus-specific Drive file
export async function fetchSpecials(weekOf = null, campus = "Mesa Lab") {
  const token  = await getAuthToken();
  const params = new URLSearchParams({ campus });
  if (weekOf) params.set("weekOf", weekOf);
  const url = `/api/get-specials?${params}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (res.status === 404) return null; // No specials posted yet — show empty state
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch specials");
  }
  return res.json();
}

// ── Fetch week's event report PDF from Google Drive ─────────────────────
// weekOf: ISO date string "YYYY-MM-DD" (optional; omit for auto-detect)
export async function fetchEventReport(weekOf = null) {
  const token = await getAuthToken();
  const url = weekOf
    ? `/api/get-event-report?weekOf=${weekOf}`
    : "/api/get-event-report";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch event report");
  }
  return res.json();
}

// ── Fetch week's set up report PDF from Google Drive ─────────────────────
// weekOf: ISO date string "YYYY-MM-DD" (optional; omit for auto-detect)
export async function fetchSetupReport(weekOf = null) {
  const token = await getAuthToken();
  const url = weekOf
    ? `/api/get-setup-report?weekOf=${weekOf}`
    : "/api/get-setup-report";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch setup report");
  }
  return res.json();
}

// ── Fetch week's schedule as PDF (for Weekly Packet) ────────────────────
// weekOf: ISO date string "YYYY-MM-DD" (optional; omit for auto-detect)
export async function fetchSchedulePdf(weekOf = null) {
  const token = await getAuthToken();
  const url = weekOf
    ? `/api/get-schedule-pdf?weekOf=${weekOf}`
    : "/api/get-schedule-pdf";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch schedule PDF");
  }
  return res.json();
}

// ── Get event orders matching a week (by filename date parsing) ─────────
// BEO filenames follow patterns like "BEOs - Mar 9th - 13th".
// We parse the start date from the filename and check if it falls within
// the given week (Monday–Sunday), matching the EventOrderLibraryWidget logic.
export async function getEventOrdersByWeek(weekOfIso) {
  const monday = new Date(weekOfIso + "T00:00:00");
  const mondayTime = monday.getTime();
  const sundayEnd  = mondayTime + 7 * 24 * 60 * 60 * 1000 - 1; // end of Sunday

  const months = {
    jan:0, january:0, feb:1, february:1, mar:2, march:2,
    apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6,
    aug:7, august:7, sep:8, sept:8, september:8, oct:9, october:9,
    nov:10, november:10, dec:11, december:11,
  };

  function parseTitleDate(fileName) {
    if (!fileName) return 0;
    const m = fileName.match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(\d+)/i
    );
    if (!m) return 0;
    const mon = months[m[1].toLowerCase()];
    if (mon === undefined) return 0;
    const day = parseInt(m[2], 10);
    return new Date(monday.getFullYear(), mon, day).getTime();
  }

  // Fetch all event orders then filter by parsed filename date
  const q = query(
    collection(db, "event_orders"),
    orderBy("uploadedAt", "desc")
  );
  const snap = await getDocs(q);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return all.filter(order => {
    const t = parseTitleDate(order.fileName);
    return t >= mondayTime && t <= sundayEnd;
  });
}

// ── Listen to last 30 days of daily metrics for a campus ─────────────────
// campus: specific campus name OR "All Campuses" to merge all three live
export function subscribeToCampus(campus, callback, startDate) {
  const sinceDate = startDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  })();

  if (campus === "All Campuses") {
    const ALL   = ["Mesa Lab", "Foothills", "Center Green"];
    const cache = {};
    const unsubs = ALL.map(c => {
      const q = query(
        collection(db, "daily_metrics"),
        where("campus", "==", c),
        where("date",   ">=", sinceDate),
        orderBy("date", "asc")
      );
      return onSnapshot(q, snap => {
        cache[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(Object.values(cache).flat());
      });
    });
    return () => unsubs.forEach(u => u());
  }

  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    where("date",   ">=", sinceDate),
    orderBy("date", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Listen to ALL reports for a campus ───────────────────────────────────
export function subscribeAllReports(campus, callback) {
  if (campus === "All Campuses") {
    const ALL   = ["Mesa Lab", "Foothills", "Center Green"];
    const cache = {};
    const unsubs = ALL.map(c => {
      const q = query(
        collection(db, "daily_metrics"),
        where("campus", "==", c),
        orderBy("date", "asc")
      );
      return onSnapshot(q, snap => {
        cache[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(Object.values(cache).flat());
      });
    });
    return () => unsubs.forEach(u => u());
  }

  const q = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    orderBy("date", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
// ── Listen to all event orders (most recent first) ────────────────────────
export function subscribeEventOrders(callback) {
  const q = query(
    collection(db, "event_orders"),
    orderBy("uploadedAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  });
}
// Returns event orders uploaded during the week starting on `weekOf` (a JS Date or ISO string)
// weekOf should be the Monday of the target week
export function subscribeEventOrdersForWeek(weekOf, callback) {
  const monday = new Date(weekOf);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "event_orders"),
    where("uploadedAt", ">=", Timestamp.fromDate(monday)),
    where("uploadedAt", "<=", Timestamp.fromDate(sunday)),
    orderBy("uploadedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  });
}

// ── Cafe Specials (per campus + week) ────────────────────────────────────
// doc ID: specials_{weekOf}_{campus_underscored}  e.g. "specials_2026-03-09_Mesa_Lab"
function specialsDocId(weekOf, campus) {
  return `specials_${weekOf}_${campus.replace(/\s+/g, "_")}`;
}

export function subscribeCafeSpecials(weekOf, campus, callback) {
  const docRef = doc(db, "cafe_specials", specialsDocId(weekOf, campus));
  return onSnapshot(docRef, snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function saveCafeSpecials(weekOf, campus, body, uid, email) {
  const docRef = doc(db, "cafe_specials", specialsDocId(weekOf, campus));
  await setDoc(docRef, {
    weekOf,
    campus,
    body,
    updated_by:    email,
    updated_by_uid: uid,
    updated_at:    serverTimestamp(),
  }, { merge: true });
}

// ── Cash Drops ────────────────────────────────────────────────────────────
export async function addCashDrop({ campus, amount, date, notes, uid, email }) {
  await addDoc(collection(db, "cash_drops"), {
    campus,
    amount:     Number(amount),
    date,
    notes:      notes || "",
    created_by: email,
    created_by_uid: uid,
    created_at: serverTimestamp(),
  });
}

export function subscribeRecentCashDrops(campus, callback) {
  const q = query(
    collection(db, "cash_drops"),
    where("campus", "==", campus),
    orderBy("created_at", "desc"),
    limit(10)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function removeCashDrop(dropId) {
  if (!dropId) throw new Error("Missing cash drop id.");
  await deleteDoc(doc(db, "cash_drops", dropId));
}

// ── Cafe Charges — daily_metrics for a date range + campus ───────────────
// campus: specific campus name OR "All Campuses" to fetch all three
export async function getCafeChargesData(campus, startDate, endDate) {
  const ALL     = ["Mesa Lab", "Foothills", "Center Green"];
  const targets = campus === "All Campuses" ? ALL : [campus];
  const start   = Timestamp.fromDate(new Date(startDate + "T00:00:00"));
  const end     = Timestamp.fromDate(new Date(endDate   + "T23:59:59"));

  const results = {};
  await Promise.all(targets.map(async (c) => {
    const q = query(
      collection(db, "daily_metrics"),
      where("campus", "==", c),
      where("date",   ">=", start),
      where("date",   "<=", end),
      orderBy("date", "asc")
    );
    const snap = await getDocs(q);
    results[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));
  return results;
}

// ── Shared weekOf helper ──────────────────────────────────────────────────
function isoMondayOf(dateStr) {
  const d   = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

// ── Setup Reports ─────────────────────────────────────────────────────────
export async function saveSetupReport({ title, campus, eventDate, instructions, uid, email }) {
  await addDoc(collection(db, "setup_reports"), {
    title,
    campus,
    eventDate:    Timestamp.fromDate(new Date(eventDate + "T12:00:00")),
    weekOf:       isoMondayOf(eventDate),
    instructions: instructions || "",
    created_by:     email,
    created_by_uid: uid,
    created_at:   serverTimestamp(),
    updated_at:   serverTimestamp(),
    status:       "active",
  });
}

export function subscribeSetupReports(callback) {
  const q = query(
    collection(db, "setup_reports"),
    orderBy("created_at", "desc"),
    limit(20)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Event Reports ─────────────────────────────────────────────────────────
export async function saveEventReport({ title, campus, eventDate, attendance, revenue, notes, uid, email }) {
  await addDoc(collection(db, "event_reports"), {
    title,
    campus,
    eventDate:  Timestamp.fromDate(new Date(eventDate + "T12:00:00")),
    weekOf:     isoMondayOf(eventDate),
    attendance: attendance ? Number(attendance) : null,
    revenue:    revenue    ? Number(revenue)    : null,
    notes:      notes || "",
    created_by:     email,
    created_by_uid: uid,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    status:     "submitted",
  });
}

export function subscribeEventReports(callback) {
  const q = query(
    collection(db, "event_reports"),
    orderBy("created_at", "desc"),
    limit(20)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── User Dashboard Prefs ──────────────────────────────────────────────────
// doc ID: Firebase Auth UID
export function subscribeDashboardPrefs(uid, callback) {
  const docRef = doc(db, "user_dashboard_prefs", uid);
  return onSnapshot(docRef, snap => callback(snap.exists() ? snap.data() : null));
}

export async function saveDashboardPrefs(uid, data) {
  const docRef = doc(db, "user_dashboard_prefs", uid);
  await setDoc(docRef, { uid, ...data, updated_at: serverTimestamp() }, { merge: true });
}

// ── Fetch month-end accounting data for all three campuses ────────────────
// ── Create user_roles document on first login if missing ─────────────────
export async function createUserRoleIfMissing(user) {
  const ref = doc(db, "user_roles", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || "",
      role:        "user",
      assignedBy:  user.uid,
      assignedAt:  serverTimestamp(),
      createdAt:   serverTimestamp(),
    });
  }
}

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
