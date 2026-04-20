import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import Widget from "./Widget";
import { COLORS } from "../theme";

function getMonogram(name) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function VendorTile({ vendor }) {
  const [imgError, setImgError] = useState(false);
  const accent = vendor.accentColor || COLORS.AQUA;

  // Derive a light icon background from the accent color at ~12% opacity
  const iconBg = accent + "1F"; // hex opacity 1F ≈ 12%

  return (
    <a
      href={vendor.url}
      target="_blank"
      rel="noopener noreferrer"
      title={vendor.name}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "10px 14px 10px 0",
        backgroundColor: COLORS.BG_SURFACE,
        border: `1px solid rgba(255,255,255,0.08)`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "8px",
        textDecoration: "none",
        transition: "border-color 0.15s, background-color 0.15s",
        cursor: "pointer",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.borderLeftColor = accent;
        e.currentTarget.style.backgroundColor = accent + "14"; // ~8% tint
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.borderLeftColor = accent;
        e.currentTarget.style.backgroundColor = COLORS.BG_SURFACE;
      }}
    >
      {/* Icon area — logo image or monogram fallback */}
      <div
        style={{
          width: "34px",
          height: "34px",
          marginLeft: "12px",
          borderRadius: "6px",
          backgroundColor: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {!imgError && vendor.logoUrl ? (
          <img
            src={vendor.logoUrl}
            alt={vendor.name}
            onError={() => setImgError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "brightness(0) invert(1)",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: accent,
              letterSpacing: "0.02em",
            }}
          >
            {getMonogram(vendor.name)}
          </span>
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: COLORS.TEXT_PRIMARY,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {vendor.name}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: COLORS.TEXT_MUTED,
            marginTop: "1px",
          }}
        >
          Order portal
        </div>
      </div>

      {/* External link arrow */}
      <span
        style={{
          fontSize: "13px",
          color: COLORS.TEXT_MUTED,
          opacity: 0.5,
          flexShrink: 0,
          marginRight: "2px",
        }}
      >
        ↗
      </span>
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
      noPad
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 16px 14px" }}>
        {vendors.map(vendor => (
          <VendorTile key={vendor.id} vendor={vendor} />
        ))}
      </div>
    </Widget>
  );
}
