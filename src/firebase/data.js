import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "./core";

export async function getEventOrdersByWeek(weekOfIso) {
  const monday = new Date(weekOfIso + "T00:00:00");
  const mondayTime = monday.getTime();
  const sundayEnd = mondayTime + 7 * 24 * 60 * 60 * 1000 - 1;

  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };

  function parseTitleDate(fileName) {
    if (!fileName) return 0;
    const match = fileName.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(\d+)/i);
    if (!match) return 0;
    const month = months[match[1].toLowerCase()];
    if (month === undefined) return 0;
    const day = parseInt(match[2], 10);
    return new Date(monday.getFullYear(), month, day).getTime();
  }

  const snapshot = await getDocs(query(collection(db, "event_orders"), orderBy("uploadedAt", "desc")));
  const orders = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  return orders.filter((order) => {
    const time = parseTitleDate(order.fileName);
    return time >= mondayTime && time <= sundayEnd;
  });
}

export function subscribeToCampus(campus, callback, startDate) {
  const sinceDate = startDate || (() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  })();

  if (campus === "All Campuses") {
    const campuses = ["Mesa Lab", "Foothills", "Center Green"];
    const cache = {};
    const unsubs = campuses.map((value) => {
      const metricsQuery = query(
        collection(db, "daily_metrics"),
        where("campus", "==", value),
        where("date", ">=", sinceDate),
        orderBy("date", "asc")
      );
      return onSnapshot(metricsQuery, (snapshot) => {
        cache[value] = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        callback(Object.values(cache).flat());
      });
    });
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }

  const metricsQuery = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    where("date", ">=", sinceDate),
    orderBy("date", "asc")
  );
  return onSnapshot(metricsQuery, (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
}

export function subscribeAllReports(campus, callback) {
  if (campus === "All Campuses") {
    const campuses = ["Mesa Lab", "Foothills", "Center Green"];
    const cache = {};
    const unsubs = campuses.map((value) => {
      const reportsQuery = query(collection(db, "daily_metrics"), where("campus", "==", value), orderBy("date", "asc"));
      return onSnapshot(reportsQuery, (snapshot) => {
        cache[value] = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        callback(Object.values(cache).flat());
      });
    });
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }

  const reportsQuery = query(collection(db, "daily_metrics"), where("campus", "==", campus), orderBy("date", "asc"));
  return onSnapshot(reportsQuery, (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
}

export function subscribeEventOrders(callback) {
  const ordersQuery = query(collection(db, "event_orders"), orderBy("uploadedAt", "desc"));
  return onSnapshot(ordersQuery, (snapshot) => {
    callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  });
}

export function subscribeEventOrdersForWeek(weekOf, callback) {
  const monday = new Date(weekOf);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const ordersQuery = query(
    collection(db, "event_orders"),
    where("uploadedAt", ">=", Timestamp.fromDate(monday)),
    where("uploadedAt", "<=", Timestamp.fromDate(sunday)),
    orderBy("uploadedAt", "desc")
  );

  return onSnapshot(ordersQuery, (snapshot) => {
    callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  });
}

function specialsDocId(weekOf, campus) {
  return `specials_${weekOf}_${campus.replace(/\s+/g, "_")}`;
}

export function subscribeCafeSpecials(weekOf, campus, callback) {
  return onSnapshot(doc(db, "cafe_specials", specialsDocId(weekOf, campus)), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}

export async function saveCafeSpecials(weekOf, campus, body, uid, email) {
  await setDoc(doc(db, "cafe_specials", specialsDocId(weekOf, campus)), {
    weekOf,
    campus,
    body,
    updated_by: email,
    updated_by_uid: uid,
    updated_at: serverTimestamp(),
  }, { merge: true });
}

export async function addCashDrop({ campus, amount, date, notes, uid, email }) {
  await addDoc(collection(db, "cash_drops"), {
    campus,
    amount: Number(amount),
    date,
    notes: notes || "",
    created_by: email,
    created_by_uid: uid,
    created_at: serverTimestamp(),
  });
}

export function subscribeRecentCashDrops(campus, callback) {
  const dropsQuery = query(
    collection(db, "cash_drops"),
    where("campus", "==", campus),
    orderBy("created_at", "desc"),
    limit(10)
  );
  return onSnapshot(dropsQuery, (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
}

export async function removeCashDrop(dropId) {
  if (!dropId) throw new Error("Missing cash drop id.");
  await deleteDoc(doc(db, "cash_drops", dropId));
}

export async function getCafeChargesData(campus, startDate, endDate) {
  const campuses = campus === "All Campuses" ? ["Mesa Lab", "Foothills", "Center Green"] : [campus];
  const start = Timestamp.fromDate(new Date(startDate + "T00:00:00"));
  const end = Timestamp.fromDate(new Date(endDate + "T23:59:59"));
  const results = {};

  await Promise.all(campuses.map(async (value) => {
    const metricsQuery = query(
      collection(db, "daily_metrics"),
      where("campus", "==", value),
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "asc")
    );
    const snapshot = await getDocs(metricsQuery);
    results[value] = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  }));

  return results;
}

function isoMondayOf(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

export async function saveSetupReport({ title, campus, eventDate, instructions, uid, email }) {
  await addDoc(collection(db, "setup_reports"), {
    title,
    campus,
    eventDate: Timestamp.fromDate(new Date(eventDate + "T12:00:00")),
    weekOf: isoMondayOf(eventDate),
    instructions: instructions || "",
    created_by: email,
    created_by_uid: uid,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    status: "active",
  });
}

export function subscribeSetupReports(callback) {
  return onSnapshot(
    query(collection(db, "setup_reports"), orderBy("created_at", "desc"), limit(20)),
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  );
}

export async function saveEventReport({ title, campus, eventDate, attendance, revenue, notes, uid, email }) {
  await addDoc(collection(db, "event_reports"), {
    title,
    campus,
    eventDate: Timestamp.fromDate(new Date(eventDate + "T12:00:00")),
    weekOf: isoMondayOf(eventDate),
    attendance: attendance ? Number(attendance) : null,
    revenue: revenue ? Number(revenue) : null,
    notes: notes || "",
    created_by: email,
    created_by_uid: uid,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    status: "submitted",
  });
}

export function subscribeEventReports(callback) {
  return onSnapshot(
    query(collection(db, "event_reports"), orderBy("created_at", "desc"), limit(20)),
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  );
}

export function subscribeDashboardPrefs(uid, callback) {
  return onSnapshot(doc(db, "user_dashboard_prefs", uid), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}

export async function saveDashboardPrefs(uid, data) {
  await setDoc(doc(db, "user_dashboard_prefs", uid), { uid, ...data, updated_at: serverTimestamp() }, { merge: true });
}

export async function getDashboardNotes(uid) {
  const snapshot = await getDoc(doc(db, "user_dashboard_prefs", uid));
  if (!snapshot.exists()) return [];
  return snapshot.data().notes ?? [];
}

export async function addDashboardNote(uid, text) {
  const ref = doc(db, "user_dashboard_prefs", uid);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? (snapshot.data().notes ?? []) : [];
  if (existing.length >= 6) return;

  const newNote = {
    id: crypto.randomUUID(),
    text: text.trim().slice(0, 200),
    createdAt: Date.now(),
  };
  await setDoc(ref, { notes: arrayUnion(newNote) }, { merge: true });
}

export async function deleteDashboardNote(uid, noteId) {
  const ref = doc(db, "user_dashboard_prefs", uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const updated = (snapshot.data().notes ?? []).filter((note) => note.id !== noteId);
  await setDoc(ref, { notes: updated }, { merge: true });
}

export async function saveEventRevenueDoc({ campus, year, month, type, revenue }) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const campusSlug = campus.replace(/\s+/g, "_");
  const docId = `eventrev_${monthKey}_${campusSlug}_${type}`;
  await setDoc(doc(db, "event_revenue", docId), {
    campus,
    year,
    month,
    monthKey,
    type,
    revenue,
    updated_at: serverTimestamp(),
  }, { merge: true });
}

export function subscribeEventRevenue(callback) {
  return onSnapshot(
    query(collection(db, "event_revenue"), orderBy("year", "asc"), orderBy("month", "asc")),
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  );
}

export function subscribeFpaFacts(callback) {
  return onSnapshot(
    query(collection(db, "fpa_facts"), orderBy("monthKey", "asc")),
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  );
}

export function subscribeFpaUploads(callback) {
  return onSnapshot(
    query(collection(db, "fpa_uploads"), orderBy("uploadedAt", "desc"), limit(20)),
    (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  );
}

export async function fetchAccountingData(campus, year, month) {
  const startDate = Timestamp.fromDate(new Date(year, month - 1, 1));
  const endDate = Timestamp.fromDate(new Date(year, month, 1));
  const metricsQuery = query(
    collection(db, "daily_metrics"),
    where("campus", "==", campus),
    where("date", ">=", startDate),
    where("date", "<", endDate)
  );

  const snapshot = await getDocs(metricsQuery);
  const docs = snapshot.docs.map((entry) => entry.data());
  const round2 = (value) => Math.round(value * 100) / 100;
  const periodDoc = docs.find((entry) => entry.report_type === "period");

  if (periodDoc) {
    return {
      netRevenue: round2(periodDoc.net_revenue ?? 0),
      totalTax: round2(periodDoc.total_taxes ?? 0),
      payroll: round2(periodDoc.payroll ?? 0),
      creditCard: round2(periodDoc.credit_card ?? 0),
      cashDeposit: round2(periodDoc.cash_drop ?? 0),
      docCount: 1,
      source: "period",
    };
  }

  let netRevenue = 0;
  let totalTax = 0;
  let payroll = 0;
  let creditCard = 0;
  let cashDeposit = 0;

  docs.forEach((entry) => {
    netRevenue += entry.net_revenue ?? 0;
    totalTax += entry.total_taxes ?? 0;
    payroll += entry.payroll ?? 0;
    creditCard += entry.credit_card ?? 0;
    cashDeposit += entry.cash_drop ?? 0;
  });

  return {
    netRevenue: round2(netRevenue),
    totalTax: round2(totalTax),
    payroll: round2(payroll),
    creditCard: round2(creditCard),
    cashDeposit: round2(cashDeposit),
    docCount: docs.length,
    source: "daily",
  };
}
