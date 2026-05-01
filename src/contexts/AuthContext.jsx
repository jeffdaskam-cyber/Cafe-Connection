import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc, getDoc, setDoc, deleteDoc, serverTimestamp,
  collection, query, where, getDocs, limit,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still initializing, null = no user, object = signed in
  const [user, setUser]           = useState(undefined);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        return;
      }

      const email = (firebaseUser.email || "").toLowerCase();

      try {
        // Existing active user?
        const roleRef  = doc(db, "user_roles", firebaseUser.uid);
        const roleSnap = await getDoc(roleRef);

        if (roleSnap.exists()) {
          // Upsert lightweight user profile for display-name tracking
          await setDoc(
            doc(db, "users", firebaseUser.uid),
            {
              uid:         firebaseUser.uid,
              email:       firebaseUser.email,
              displayName: firebaseUser.displayName || roleSnap.data().displayName || "",
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          );
          setAuthError("");
          setUser(firebaseUser);
          return;
        }

        // No role doc under this UID — fall back to email lookup. This handles
        // the case where the same authorized user signs in via a new provider
        // (e.g. Google after originally being invited via email link), which
        // produces a different Firebase UID for the same email.
        const emailMatch = await getDocs(
          query(collection(db, "user_roles"), where("email", "==", email), limit(1))
        );
        if (!emailMatch.empty) {
          const existing = emailMatch.docs[0];
          const existingData = existing.data();

          // Migrate the role doc to the new UID so useRole (keyed by UID) works.
          await setDoc(roleRef, {
            ...existingData,
            uid: firebaseUser.uid,
          });
          if (existing.id !== firebaseUser.uid) {
            await deleteDoc(existing.ref);
          }

          await setDoc(
            doc(db, "users", firebaseUser.uid),
            {
              uid:         firebaseUser.uid,
              email:       firebaseUser.email,
              displayName: firebaseUser.displayName || existingData.displayName || "",
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          );

          setAuthError("");
          setUser(firebaseUser);
          return;
        }

        // No active record — check for a pending invite for this email
        const inviteRef  = doc(db, "pending_invites", email);
        const inviteSnap = await getDoc(inviteRef);

        if (inviteSnap.exists()) {
          const { role } = inviteSnap.data();

          await setDoc(roleRef, {
            uid:         firebaseUser.uid,
            email,
            displayName: "",
            role,
            assignedBy:  firebaseUser.uid,
            assignedAt:  serverTimestamp(),
            createdAt:   serverTimestamp(),
          });

          await setDoc(
            doc(db, "users", firebaseUser.uid),
            {
              uid:         firebaseUser.uid,
              email,
              displayName: "",
              createdAt:   serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          );

          // Consume the invite
          await deleteDoc(inviteRef);

          setAuthError("");
          setUser(firebaseUser);
          return;
        }

        // No active record and no pending invite — unauthorized
        await signOut(auth);
        setAuthError(
          "You don't have access to this application. Contact your administrator to request an invite."
        );
        setUser(null);
      } catch (err) {
        console.error("[AuthContext] Auth state handler error:", err);
        try { await signOut(auth); } catch { /* ignore */ }
        setAuthError(
          "We couldn't verify your account. Please contact your administrator if this continues."
        );
        setUser(null);
      }
    });
    return unsub;
  }, []);

  function logout() {
    setAuthError("");
    return signOut(auth);
  }

  function clearAuthError() {
    setAuthError("");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: user === undefined,
        logout,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
