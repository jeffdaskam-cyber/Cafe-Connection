import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { db, storage } from "./core";

export function uploadReport(campus, file, onProgress) {
  const safeCampus = campus.replace(/\s+/g, "_");
  const timestamp = Date.now();
  const storageRef = ref(storage, `reports/${safeCampus}/${timestamp}_${file.name}`);
  const task = uploadBytesResumable(storageRef, file);

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

export async function uploadEventOrder(file, onProgress) {
  const timestamp = Date.now();
  const storageRef = ref(storage, `event_orders/${timestamp}_${file.name}`);
  const task = uploadBytesResumable(storageRef, file);

  const downloadURL = await new Promise((resolve, reject) => {
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

  await addDoc(collection(db, "event_orders"), {
    fileName: file.name,
    downloadURL,
    uploadedAt: serverTimestamp(),
    size: file.size,
  });

  return downloadURL;
}
