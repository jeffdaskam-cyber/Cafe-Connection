import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase.js";
import { useRole } from "../hooks/useRole.js";
import Widget from "../components/Widget.jsx";

const ROLES = ["user", "manager", "administrator"];

export default function AdminPage() {
  const { isAdministrator, roleLoading } = useRole();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(null);

  useEffect(() => {
    if (roleLoading || !isAdministrator) return;

    getDocs(collection(db, "user_roles")).then((snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [isAdministrator, roleLoading]);

  async function handleRoleChange(uid, newRole) {
    setSaving(uid);
    const ref = doc(db, "user_roles", uid);
    await updateDoc(ref, {
      role:       newRole,
      assignedBy: auth.currentUser.uid,
      assignedAt: serverTimestamp(),
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === uid ? { ...u, role: newRole } : u))
    );
    setSaving(null);
  }

  if (roleLoading || loading) {
    return <div style={{ padding: 32 }}>Loading...</div>;
  }

  if (!isAdministrator) {
    return (
      <div style={{ padding: 32, color: "#c00" }}>
        Access denied. Administrator role required.
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>User Management</h2>
      <Widget title="Registered Users" style={{ maxWidth: 800 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "8px 12px" }}>Email</th>
              <th style={{ padding: "8px 12px" }}>Display Name</th>
              <th style={{ padding: "8px 12px" }}>Role</th>
              <th style={{ padding: "8px 12px" }}>Last Assigned</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px 12px" }}>{u.email}</td>
                <td style={{ padding: "8px 12px" }}>{u.displayName || "\u2014"}</td>
                <td style={{ padding: "8px 12px" }}>
                  <select
                    value={u.role}
                    disabled={saving === u.id}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 4 }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                  {saving === u.id && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#888" }}>Saving…</span>
                  )}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "#888" }}>
                  {u.assignedAt?.toDate
                    ? u.assignedAt.toDate().toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })
                    : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </div>
  );
}
