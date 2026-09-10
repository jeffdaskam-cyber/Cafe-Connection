/**
 * Pure helpers for the sales payroll backfill.
 *
 * Kept free of Firestore and Storage so the selection and matching rules — the
 * parts that decide which production documents get written, and from which
 * report — are unit tested. See scripts/backfillSalesPayroll.mjs for the runner.
 */

/** Campuses whose sales reports carry a payroll-deduct tender. */
export const VOLUME_CAMPUSES = ["Mesa Lab", "Foothills", "Center Green"];

/** Storage folder segment → campus, as uploadReport() writes it. */
const CAMPUS_BY_FOLDER = new Map(VOLUME_CAMPUSES.map(c => [c.replace(/\s+/g, "_"), c]));

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
 * True when a daily_metrics doc is missing its credit-card figure.
 *
 * Same two shapes as payroll: absent (written before the parser read the
 * TENDERS section) and an explicit null (a PDF upload, an Excel with no
 * readable TENDERS section, or — before the parser distinguished them — a day
 * that simply took no card payment). A real 0 is now a legitimate day with no
 * card tenders and is left alone.
 */
export function needsCreditCardBackfill(doc) {
  if (!VOLUME_CAMPUSES.includes(doc?.campus)) return false;
  return doc.credit_card === undefined || doc.credit_card === null;
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

/** Campus the object was uploaded under, from its folder, or null. */
export function campusFromObjectName(objectName) {
  const parts = objectName.split("/");
  if (parts.length < 2) return null;
  return CAMPUS_BY_FOLDER.get(parts[parts.length - 2]) ?? null;
}

/**
 * Group storage object names by the source_file they were uploaded as, newest
 * upload first.
 *
 * source_file is NOT a unique key. The InfoGenesis export carries the same
 * name every time, so a whole run of days — across campuses — can share one
 * source_file while Storage keeps them apart by timestamp prefix and folder.
 * Every object is kept here and the runner picks by what the report actually
 * contains; collapsing to one object per name would reparse a single day's
 * file for every document that shares its name.
 */
export function groupReportsBySourceFile(objectNames) {
  const groups = new Map();
  for (const name of objectNames) {
    const key = sourceFileFromObjectName(name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }
  for (const names of groups.values()) {
    names.sort((a, b) => uploadedAtFromObjectName(b) - uploadedAtFromObjectName(a));
  }
  return groups;
}

/** Key a parsed report by the day and campus it describes. */
export function dayKey(dateStr, campus) {
  return `${dateStr}|${campus}`;
}

export const EXCEL_NAME = /\.(xlsx|xls)$/i;

/** Why a document has no usable report, or null when the candidates are usable. */
export function classifyGap(doc, objectNames) {
  if (!doc.source_file) return "no-source-file";
  if (!objectNames || objectNames.length === 0) return "file-not-in-storage";
  if (!objectNames.some(name => EXCEL_NAME.test(name))) return "not-excel";
  return null;
}

/**
 * Does a parsed report describe the same day, campus, and totals as the
 * document it would fill?
 *
 * Every field is checked, because source_file alone does not identify a
 * report: matching on totals alone would let another day — or another
 * campus — supply the payroll figure whenever the totals happened to agree.
 * `objectCampus` covers reports whose Profit Center line did not parse, where
 * the upload folder is the only campus signal.
 */
export function matchesDocument(doc, metrics, { docDate, objectCampus, revenueTolerance = 0.01 } = {}) {
  if (!docDate || !metrics?.date || docDate !== metrics.date) return false;

  const reportCampus = metrics.detectedCampus ?? objectCampus ?? null;
  if (!reportCampus || reportCampus !== doc.campus) return false;

  if (doc.net_revenue != null && metrics.net_revenue != null &&
      Math.abs(doc.net_revenue - metrics.net_revenue) > revenueTolerance) return false;
  if (doc.total_checks != null && metrics.total_checks != null &&
      doc.total_checks !== metrics.total_checks) return false;

  return true;
}
