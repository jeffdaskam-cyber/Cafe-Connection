import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import Widget from "./Widget";
import { COLORS } from "../theme";

function VendorTile({ vendor }) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={vendor.url}
      target="_blank"
      rel="noopener noreferrer"
      title={vendor.name}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        minHeight: "56px",
        padding: "10px 16px",
        backgroundColor: COLORS.BG_SURFACE,
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: "8px",
        textDecoration: "none",
        transition: "border-color 0.15s, background-color 0.15s",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = COLORS.AQUA;
        e.currentTarget.style.backgroundColor = "rgba(0,162,180,0.08)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.backgroundColor = COLORS.BG_SURFACE;
      }}
    >
      {!imgError && vendor.logoUrl ? (
        <img
          src={vendor.logoUrl}
          alt={vendor.name}
          onError={() => setImgError(true)}
          style={{
            maxHeight: "36px",
            maxWidth: "160px",
            objectFit: "contain",
            filter: "brightness(0) invert(1)",
          }}
        />
      ) : (
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: COLORS.TEXT_PRIMARY,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {vendor.name}
        </span>
      )}
    </a>
  );
}

export default function VendorPortal() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "vendor_links"), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      snapshot => {
        setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      err => {
        console.error("[VendorPortal] Firestore error:", err);
        setError("Unable to load vendor links.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return (
    <Widget
      title="Vendor Portal"
      icon="🔗"
      loading={loading}
      error={error}
      empty={!loading && vendors.length === 0}
      emptyMessage="No vendor links configured."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 0" }}>
        {vendors.map(vendor => (
          <VendorTile key={vendor.id} vendor={vendor} />
        ))}
      </div>
    </Widget>
  );
}
