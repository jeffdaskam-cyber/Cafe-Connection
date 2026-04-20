import { useState, useEffect, useRef } from "react";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase.js";
import { useRole } from "../hooks/useRole.js";
import Widget from "../components/Widget.jsx";
import VendorManager from "../components/admin/VendorManager.jsx";
import { COLORS } from "../theme.js";

const ROLES = ["user", "manager", "administrator"];

export default function AdminPage() {
  const { isAdministrator, roleLoading } = useRole();
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(null);       // uid of row with role saving
  const [editingName, setEditingName] = useState(null);     // { uid, value } or null
  const [savingName, setSavingName] = useState(null);       // uid of row with name saving
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (roleLoading || !isAdministrator) return;

    getDocs(collection(db, "user_roles")).then((snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [isAdministrator, roleLoading]);

  // Focus the input whenever editingName changes to a non-null value
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName?.uid]);

  async function handleRoleChange(uid, newRole) {
    setSaving(uid);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/update-user-role", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetUid: uid, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      setUsers((prev) =>
        prev.map((u) => (u.id === uid ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      console.error("[AdminPage] Role change failed:", err);
      alert(`Role change failed: ${err.message}`);
    }
    setSaving(null);
  }

  async function handleNameSave(uid, newName) {
    const trimmed = newName.trim();
    setEditingName(null);

    // Find current name to avoid a no-op write
    const current = users.find((u) => u.id === uid)?.displayName || "";
    if (trimmed === current) return;

    setSavingName(uid);
    try {
      // Write to user_roles (merge so other fields are preserved)
      await setDoc(
        doc(db, "user_roles", uid),
        { displayName: trimmed },
        { merge: true }
      );
      // Write to users (merge so other profile fields are preserved)
      await setDoc(
        doc(db, "users", uid),
        { displayName: trimmed },
        { merge: true }
      );
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === uid ? { ...u, displayName: trimmed } : u))
      );
    } catch (err) {
      console.error("[AdminPage] Display name save failed:", err);
      alert(`Display name save failed: ${err.message}`);
    }
    setSavingName(null);
  }

  if (roleLoading || loading) {
    return <div style={{ padding: 32 }}>Loading...</div>;
  }

  if (!isAdministrator) {
    return (
      <div style={{ padding: 32, color: COLORS.ERROR }}>
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
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${COLORS.BORDER}` }}>
              <th style={{ padding: "8px 12px" }}>Email</th>
              <th style={{ padding: "8px 12px" }}>Display Name</th>
              <th style={{ padding: "8px 12px" }}>Role</th>
              <th style={{ padding: "8px 12px" }}>Last Assigned</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${COLORS.BORDER}` }}>
                <td style={{ padding: "8px 12px" }}>{u.email}</td>

                {/* ── Display Name cell ── */}
                <td style={{ padding: "8px 12px", minWidth: 160 }}>
                  {editingName?.uid === u.id ? (
                    <input
                      ref={nameInputRef}
                      value={editingName.value}
                      onChange={(e) =>
                        setEditingName({ uid: u.id, value: e.target.value })
                      }
                      onBlur={() => handleNameSave(u.id, editingName.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleNameSave(u.id, editingName.value);
                        if (e.key === "Escape") setEditingName(null);
                      }}
                      style={{
                        padding: "3px 6px",
                        borderRadius: 4,
                        border: `1px solid ${COLORS.AQUA}`,
                        fontSize: 14,
                        width: "100%",
                        boxSizing: "border-box",
                        background: "transparent",
                        color: "inherit",
                      }}
                    />
                  ) : (
                    <span
                      onClick={() =>
                        setEditingName({ uid: u.id, value: u.displayName || "" })
                      }
                      title="Click to edit"
                      style={{
                        cursor: "pointer",
                        borderBottom: `1px dashed ${COLORS.TEXT_MUTED}`,
                        paddingBottom: 1,
                      }}
                    >
                      {savingName === u.id ? (
                        <span style={{ color: COLORS.TEXT_MUTED, fontSize: 12 }}>Saving…</span>
                      ) : (
                        u.displayName || "\u2014"
                      )}
                    </span>
                  )}
                </td>

                {/* ── Role cell (unchanged) ── */}
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
                    <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.TEXT_MUTED }}>Saving…</span>
                  )}
                </td>

                {/* ── Last Assigned cell (unchanged) ── */}
                <td style={{ padding: "8px 12px", fontSize: 12, color: COLORS.TEXT_MUTED }}>
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

      <div style={{ maxWidth: 800, marginTop: 24 }}>
        <Widget title="Vendor Management">
          <VendorManager />
        </Widget>
      </div>
    </div>
  );
}
