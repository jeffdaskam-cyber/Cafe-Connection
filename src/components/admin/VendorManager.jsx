import { useState, useEffect } from "react";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { COLORS } from "../../theme";

const EMPTY_FORM = { name: "", url: "", logoUrl: "", order: 0 };

export default function VendorManager() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "vendor_links"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, snapshot => {
      setVendors(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  function startEdit(vendor) {
    setEditingId(vendor.id);
    setForm({ name: vendor.name, url: vendor.url, logoUrl: vendor.logoUrl || "", order: vendor.order ?? 0 });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        url: form.url.trim(),
        logoUrl: form.logoUrl.trim(),
        order: Number(form.order) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, "vendor_links", editingId), payload);
      } else {
        await addDoc(collection(db, "vendor_links"), { ...payload, createdAt: serverTimestamp() });
      }
      cancelEdit();
    } catch (err) {
      console.error("[VendorManager] Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDoc(doc(db, "vendor_links", id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("[VendorManager] Delete error:", err);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: `1px solid rgba(255,255,255,0.15)`,
    backgroundColor: "rgba(255,255,255,0.05)",
    color: COLORS.TEXT_PRIMARY,
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "16px 0" }}>
      <h3 style={{ color: COLORS.TEXT_PRIMARY, marginBottom: "16px", fontSize: "15px" }}>
        Vendor Portal Links
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
        {vendors.map(vendor => (
          <div
            key={vendor.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 14px",
              backgroundColor: COLORS.BG_SURFACE,
              borderRadius: "8px",
              border: `1px solid rgba(255,255,255,0.08)`,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ color: COLORS.TEXT_PRIMARY, fontWeight: 600, fontSize: "13px" }}>{vendor.name}</div>
              <div style={{ color: COLORS.TEXT_MUTED, fontSize: "11px", marginTop: "2px" }}>{vendor.url}</div>
            </div>
            <span style={{ color: COLORS.TEXT_MUTED, fontSize: "11px", minWidth: "40px", textAlign: "right" }}>
              #{vendor.order}
            </span>
            <button
              onClick={() => startEdit(vendor)}
              style={{ background: "none", border: "none", color: COLORS.AQUA, cursor: "pointer", fontSize: "12px", padding: "4px 8px" }}
            >
              Edit
            </button>
            {deleteConfirm === vendor.id ? (
              <>
                <button
                  onClick={() => handleDelete(vendor.id)}
                  style={{ background: "none", border: "none", color: COLORS.WARNING, cursor: "pointer", fontSize: "12px", padding: "4px 8px" }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{ background: "none", border: "none", color: COLORS.TEXT_MUTED, cursor: "pointer", fontSize: "12px", padding: "4px 8px" }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setDeleteConfirm(vendor.id)}
                style={{ background: "none", border: "none", color: COLORS.TEXT_MUTED, cursor: "pointer", fontSize: "12px", padding: "4px 8px" }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {vendors.length === 0 && (
          <p style={{ color: COLORS.TEXT_MUTED, fontSize: "13px" }}>No vendors added yet.</p>
        )}
      </div>

      <h4 style={{ color: COLORS.TEXT_PRIMARY, fontSize: "13px", marginBottom: "12px" }}>
        {editingId ? "Edit Vendor" : "Add Vendor"}
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "480px" }}>
        <input
          placeholder="Vendor name *"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Portal URL * (include https://)"
          value={form.url}
          onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Logo image URL (optional)"
          value={form.logoUrl}
          onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
          style={inputStyle}
        />
        <input
          type="number"
          placeholder="Sort order (0 = first)"
          value={form.order}
          onChange={e => setForm(f => ({ ...f, order: e.target.value }))}
          style={{ ...inputStyle, width: "160px" }}
        />
        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.url.trim()}
            style={{
              padding: "8px 20px",
              backgroundColor: COLORS.AQUA,
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving\u2026" : editingId ? "Save Changes" : "Add Vendor"}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              style={{
                padding: "8px 16px",
                backgroundColor: "transparent",
                color: COLORS.TEXT_MUTED,
                border: `1px solid rgba(255,255,255,0.15)`,
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
