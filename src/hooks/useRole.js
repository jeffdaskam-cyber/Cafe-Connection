import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { ROLES } from "../utils/permissions.js";

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleLoading(false);
      return;
    }

    const ref = doc(db, "user_roles", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const raw = snap.data().role;
        setRole(ROLES.includes(raw) ? raw : "user");
      } else {
        setRole("user");
      }
      setRoleLoading(false);
    });

    return () => unsub();
  }, [user]);

  const isAdministrator = role === "administrator";
  const isSeniorLeader  = role === "senior_leader" || role === "administrator";
  const isManager       = role === "manager" || role === "administrator";
  const isUser          = role !== null;

  return { role, roleLoading, isAdministrator, isSeniorLeader, isManager, isUser };
}
