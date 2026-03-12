/**
 * useDashboardPrefs — loads and saves per-user dashboard preferences.
 *
 * Subscribes to user_dashboard_prefs/{uid} in Firestore.
 * Returns null prefs (not defaultPrefs) while loading so the caller
 * can distinguish "not yet loaded" from "new user with no doc".
 *
 * The caller is responsible for seeding defaultPrefs when prefs === null
 * and loading === false (i.e. the Firestore doc doesn't exist yet).
 *
 * When prefs include a displayName field, savePrefs also:
 *   - writes it to users/{uid} in Firestore (merge)
 *   - calls Firebase Auth updateProfile so auth.currentUser.displayName is updated
 */

import { useState, useEffect } from "react";
import { doc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext.jsx";
import { subscribeDashboardPrefs, saveDashboardPrefs } from "../firebase.js";
import { auth, db } from "../firebase.js";

export function useDashboardPrefs() {
  const { user } = useAuth();
  const [prefs,   setPrefs]   = useState(undefined); // undefined = still loading
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    setPrefs(undefined);
    const unsub = subscribeDashboardPrefs(user.uid, (data) => {
      setPrefs(data); // null if doc doesn't exist
    });
    return unsub;
  }, [user?.uid]);

  async function savePrefs(data) {
    if (!user?.uid) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await saveDashboardPrefs(user.uid, data);

      // If a displayName was included, persist it to the user profile docs
      if (data.displayName !== undefined) {
        const name = data.displayName;
        await setDoc(doc(db, "users", user.uid), { displayName: name }, { merge: true });
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: name });
        }
      }

      // Optimistically update local state — snapshot will also fire and confirm
      setPrefs(prev => ({ ...(prev ?? {}), ...data }));
    } catch (err) {
      setSaveErr(err?.message || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  const loading = prefs === undefined;

  return { prefs: prefs ?? null, loading, saving, saveErr, savePrefs };
}
