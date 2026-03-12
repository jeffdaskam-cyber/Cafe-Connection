import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still initializing, null = no user, object = signed in
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Upsert a basic user profile document on each login.
        // Firestore rules must allow: match /users/{uid} { allow write: if request.auth.uid == uid; }
        try {
          await setDoc(
            doc(db, "users", firebaseUser.uid),
            {
              uid:         firebaseUser.uid,
              email:       firebaseUser.email,
              displayName: firebaseUser.displayName || '',
              lastLoginAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e) {
          // Non-fatal: rules may not be deployed yet
          console.warn("[AuthContext] Could not write user profile doc:", e.message);
        }
      }
      setUser(firebaseUser ?? null);
    });
    return unsub;
  }, []);

  function logout() {
    return signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading: user === undefined, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
