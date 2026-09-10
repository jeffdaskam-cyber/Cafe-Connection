/**
 * Pure helpers for the sales payroll backfill.
 *
 * Kept free of Firestore and Storage so the selection and file-matching rules
 * — the parts that decide which production documents get written — are unit
 * tested. See scripts/backfillSalesPayroll.mjs for the runner.
 */

/** Campuses whose sales reports carry a payroll-deduct tender. */
export const VOLUME_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

/**
 * True when a daily_metrics doc is missing its payroll figure.
 *
 * Two shapes mean "missing": the field is absent (written before the parser
 * read the TENDERS section) and an explicit null (a PDF upload, or an Excel
 * whose TENDERS section did not match). A real 0 is a legitimate day with no
 * payroll-deduct sales and is left alone.
 */
export function needsPayrollBackfill(doc) {
  if (!VOLUME_CAMPUSES.includes(doc?.campus)) return false;
  return doc.payroll === undefined || doc.payroll === null;
}

/**
 * Storage object name → the report file name daily_metrics recorded.
 *
 * uploadReport() writes `reports/{Campus_With_Underscores}/{epochMs}_{name}`
 * and parse-report stores the bare `name` as source_file. Splitting on the
 * first underscore after the timestamp recovers it; a name that does not carry
 * a timestamp prefix is returned as-is.
 */
export function sourceFileFromObjectName(objectName) {
  const base = objectName.slice(objectName.lastIndexOf("/") + 1);
  const match = base.match(/^(\d{10,})_(.+)$/);
  return match ? match[2] : base;
}

/** Upload timestamp encoded in a storage object name, or 0 when absent. */
export function uploadedAtFromObjectName(objectName) {
  const base = objectName.slice(objectName.lastIndexOf("/") + 1);
  const match = base.match(/^(\d{10,})_/);
  return match ? Number(match[1]) : 0;
}

/**
 * Index storage object names by the source_file they were uploaded as.
 *
 * The same report can be uploaded more than once — a correction, or a retry
 * after a failed parse. Later uploads win, so the newest timestamp is the one
 * re-parsed, matching what the last upload wrote to the document.
 */
export function indexReportsBySourceFile(objectNames) {
  const index = new Map();
  for (const name of objectNames) {
    const key = sourceFileFromObjectName(name);
    const existing = index.get(key);
    if (!existing || uploadedAtFromObjectName(name) >= uploadedAtFromObjectName(existing)) {
      index.set(key, name);
    }
  }
  return index;
}

/** Why a document could not be backfilled, or null when it can be. */
export function classifyGap(doc, objectName) {
  if (!doc.source_file) return "no-source-file";
  if (!objectName) return "file-not-in-storage";
  if (!/\.(xlsx|xls)$/i.test(objectName)) return "not-excel";
  return null;
}
