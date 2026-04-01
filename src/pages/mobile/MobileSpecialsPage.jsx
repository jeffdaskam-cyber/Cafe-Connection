/**
 * MobileSpecialsPage — shows weekly cafe specials from the Drive API.
 *
 * Reuses fetchSpecials() from firebase.js which calls /api/get-specials.
 * Returns { weekLabel, body } — body is plain text split by newlines.
 */

import { useState, useEffect } from "react";
import { fetchSpecials } from "../../firebase.js";

const CAMPUSES = ["Center Green", "Foothills", "Mesa Lab"];

export default function MobileSpecialsPage() {
  const [campus,  setCampus]  = useState("Center Green");
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetchSpecials(undefined, campus)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err)   => { if (!cancelled) setError(err.message); })
      .finally(()    => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [campus]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={headingStyle}>Cafe Specials</h2>

      <select
        value={campus}
        onChange={(e) => setCampus(e.target.value)}
        style={selectStyle}
      >
        {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      {loading && <p style={mutedStyle}>Loading...</p>}
      {error   && <p style={{ color: "#c00", marginTop: 12, fontSize: 13 }}>{error}</p>}

      {!loading && !error && data && (
        <>
          {data.weekLabel && (
            <p style={{ ...mutedStyle, marginBottom: 12 }}>{data.weekLabel}</p>
          )}
          {data.body
            ? data.body.split("\n").filter(Boolean).map((line, i) => (
                <p key={i} style={{ marginBottom: 8, lineHeight: 1.5, fontSize: 14 }}>
                  {line}
                </p>
              ))
            : <p style={mutedStyle}>No specials posted for this week.</p>
          }
        </>
      )}

      {!loading && !error && !data && (
        <p style={mutedStyle}>No specials posted for this week.</p>
      )}
    </div>
  );
}

const headingStyle = { fontSize: 16, fontWeight: 700, color: "#00357A", marginBottom: 12 };
const mutedStyle   = { color: "#888", fontSize: 13 };
const selectStyle  = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid #00A2B4", fontSize: 14, background: "#fff", marginBottom: 16,
};
