/**
 * Minimal RFC 4180 CSV reader for the catering seed/migration scripts.
 *
 * Deliberately dependency-free — the repo has no CSV library and this is only
 * used by one-time scripts against a Google Sheets export. Handles quoted
 * fields, embedded commas, embedded newlines, and doubled quotes ("").
 */

/** Parse CSV text into an array of raw string rows. */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM, which Sheets exports include.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += char; i += 1; continue;
    }

    if (char === '"') { inQuotes = true; i += 1; continue; }
    if (char === ",") { row.push(field); field = ""; i += 1; continue; }
    if (char === "\r") { i += 1; continue; }
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }

    field += char; i += 1;
  }

  // Flush the final field/row unless the file ended with a clean newline.
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  return rows;
}

/**
 * Parse CSV text into objects keyed by the header row.
 * Blank lines are skipped; short rows are padded with empty strings.
 */
export function parseCsv(text) {
  const rows = parseCsvRows(text).filter(
    (r) => r.length > 1 || (r.length === 1 && r[0].trim() !== "")
  );
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ""]))
  );
}
