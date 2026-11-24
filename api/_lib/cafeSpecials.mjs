// api/_lib/cafeSpecials.mjs
// Pure helpers for /api/get-specials: Drive file-name matching and splitting the
// combined all-cafe specials document into one section per cafe.
//
// The team used to publish one Google Doc per cafe ("Nov 23rd - 27th_ML",
// "..._FL"). They now publish one document for the week that holds every cafe's
// menu, one per page, in a fixed order (Center Green, Mesa Lab, Foothills). The
// app still shows each cafe on its own, so the document is cut back apart here.
//
// Nothing in this module talks to Google — it takes API responses / file bytes
// and returns plain data, so it can be tested without credentials.

// Use the internal path to avoid pdf-parse@1.1.1's wrapper, which tries to read
// a bundled test file when imported as ESM (same as api/_lib/salesReport.mjs).
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Order the cafes appear in the combined document. Used to place sections that
// carry no recognizable cafe name (the Center Green "Grab & Go" page has none).
export const COMBINED_ORDER = ["Center Green", "Mesa Lab", "Foothills"];

// Legacy one-file-per-cafe suffixes. Center Green never had its own file, but
// accepting one costs nothing if the team ever goes back to separate files.
export const CAMPUS_SUFFIX = {
  "Mesa Lab":     "_ML",
  "Foothills":    "_FL",
  "Center Green": "_CG",
};

export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const PDF_MIME        = "application/pdf";

// Hardcoded to avoid Node.js ICU locale inconsistencies across environments
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Week naming ──────────────────────────────────────────────────────────────
export function getMondayOf(date) {
  const d   = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatYearFolder(date) {
  return `${date.getFullYear()}`;
}

export function formatMonthFolder(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${mm} - ${MONTHS_SHORT[date.getMonth()]}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Week names to look for, preferred first:
 *   short  — month only on the start date  → "Mar 23rd - 27th"
 *   long   — month on both dates           → "Mar 23rd - Mar 27th"
 * When the week spans two months both formats are the same string.
 */
export function formatWeekFolderVariants(monday) {
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const monLabel = MONTHS_SHORT[monday.getMonth()];
  const friLabel = MONTHS_SHORT[friday.getMonth()];

  const longFmt = `${monLabel} ${ordinal(monday.getDate())} - ${friLabel} ${ordinal(friday.getDate())}`;
  if (monday.getMonth() !== friday.getMonth()) return [longFmt];
  return [`${monLabel} ${ordinal(monday.getDate())} - ${ordinal(friday.getDate())}`, longFmt];
}

/**
 * Reduce a Drive file name to the parts that identify the week, so small
 * spelling differences don't hide the file: case, spacing, punctuation,
 * ordinal suffixes, full month names and a file extension are all ignored.
 *   "Nov 23rd - Nov 27th.pdf" → "nov23nov27"
 *   "November 23 – 27_ML"     → "nov2327ml"
 */
export function normalizeDriveName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\.(pdf|docx?)$/, "")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g, "$1")
    .replace(/(\d+)(st|nd|rd|th)(?![a-z])/g, "$1")
    .replace(/[^a-z0-9]/g, "");
}

const MIME_RANK = { [GOOGLE_DOC_MIME]: 0, [PDF_MIME]: 1 };
const READABLE  = (f) => Object.prototype.hasOwnProperty.call(MIME_RANK, f.mimeType);
const byMime    = (a, b) => MIME_RANK[a.mimeType] - MIME_RANK[b.mimeType];

/**
 * Pick the specials file for one cafe out of a month folder's listing.
 *
 * A legacy per-cafe file ("<week>_ML") wins when present, so weeks published
 * the old way keep displaying. Otherwise the combined document for the week is
 * used. A Google Doc is preferred over a PDF of the same week (teams often keep
 * an exported PDF next to the Doc).
 *
 * @returns {{ file: object, combined: boolean } | null}
 */
export function pickSpecialsFile(files, variants, campusSuffix) {
  const readable = (files ?? []).filter(READABLE);
  const named    = readable.map((f) => ({ f, n: normalizeDriveName(f.name) }));

  for (const variant of variants) {
    const want  = normalizeDriveName(variant + campusSuffix);
    const match = named.filter(({ n }) => n === want).map(({ f }) => f).sort(byMime)[0];
    if (match) return { file: match, combined: false };
  }

  const suffixes = new Set(Object.values(CAMPUS_SUFFIX).map((s) => normalizeDriveName(s)));
  for (const variant of variants) {
    const want  = normalizeDriveName(variant);
    const match = named
      .map(({ f, n }) => ({ f, n, at: n.indexOf(want) }))
      .filter(({ n, at }) => {
        if (at < 0) return false;
        // Words around the dates are fine ("Weekly Specials Nov 23rd - 27th").
        // A digit right after them is a different week ("nov26" in
        // "nov2630"); a cafe suffix marks a legacy per-cafe file.
        const rest = n.slice(at + want.length);
        return !/^\d/.test(rest) && !suffixes.has(rest);
      })
      // A name that starts with the dates beats one with words in front.
      .sort((a, b) => (a.at !== 0) - (b.at !== 0) || byMime(a.f, b.f))
      .map(({ f }) => f)[0];
    if (match) return { file: match, combined: true };
  }

  return null;
}

// ─── Google Docs → page chunks ────────────────────────────────────────────────

function paragraphText(paragraph) {
  return (paragraph.elements ?? [])
    .map((el) => el.textRun?.content ?? "")
    .join("")
    // Docs uses \v for a soft line break (Shift+Enter).
    .replace(/\v/g, "\n");
}

function structuralText(content) {
  return (content ?? []).map((el) => {
    if (el.paragraph) return paragraphText(el.paragraph);
    if (el.table) return tableText(el.table);
    return "";
  }).join("");
}

// One line per table row, cells separated by wide spacing — keeps an
// "item | price" table readable as "Chicken Salad Sandwich   $7.50".
function tableText(table) {
  return (table.tableRows ?? []).map((row) =>
    (row.tableCells ?? [])
      .map((cell) => structuralText(cell.content).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("   ")
  ).filter(Boolean).join("\n") + "\n";
}

function headerText(doc, headerId) {
  if (!headerId) return "";
  return structuralText(doc.headers?.[headerId]?.content);
}

/**
 * Split a Google Docs API document into page chunks.
 *
 * A chunk ends at a page break, a "next page" section break, or the end of a
 * tab. Each chunk has
 *   display — the text shown in the app
 *   banner  — page headers and a leading banner table: used to tell which cafe
 *             the chunk belongs to, but not displayed (the per-cafe docs never
 *             displayed them either)
 */
export function docToChunks(doc) {
  // Fetched with includeTabsContent=true, a document's content lives in
  // doc.tabs (each with its own body and headers), not doc.body. The team may
  // put each cafe on its own tab; the tab title then names the cafe.
  if (Array.isArray(doc.tabs) && doc.tabs.length > 0) {
    return flattenTabs(doc.tabs).flatMap((tab) => {
      const chunks = tabContentToChunks(tab.documentTab ?? {});
      const title  = tab.tabProperties?.title ?? "";
      // Only a tab with content gets its title: an empty organizing tab
      // (a parent of the real tabs) would otherwise count as a page and
      // shift every menu one cafe over in the page-order fallback.
      const hasContent = chunks.some((c) => c.display.trim() || c.banner.trim());
      if (title && hasContent) chunks[0].banner = `${title}\n${chunks[0].banner}`;
      return chunks;
    });
  }
  return tabContentToChunks(doc);
}

function flattenTabs(tabs) {
  return (tabs ?? []).flatMap((t) => [t, ...flattenTabs(t.childTabs)]);
}

// Chunks for one body (a whole legacy document, or one tab's documentTab —
// both carry body, headers and documentStyle).
function tabContentToChunks(doc) {
  const chunks = [];
  const style  = doc.documentStyle ?? {};
  let current  = newChunk(headerText(doc, style.firstPageHeaderId) + headerText(doc, style.defaultHeaderId));

  function newChunk(banner = "") {
    return { display: "", banner, hasBody: false };
  }
  function flush() {
    chunks.push(current);
    current = newChunk();
  }

  for (const el of doc.body?.content ?? []) {
    if (el.sectionBreak) {
      const s = el.sectionBreak.sectionStyle ?? {};
      if (s.sectionType === "NEXT_PAGE" && (current.hasBody || current.banner.trim())) {
        flush();
      }
      current.banner += headerText(doc, s.firstPageHeaderId) + headerText(doc, s.defaultHeaderId);
      continue;
    }

    if (el.table) {
      const text = tableText(el.table);
      // A table that opens with a cafe name is that cafe's banner (name,
      // hours, logos) and starts its section, wherever it sits: the combined
      // document has no page breaks — blank lines push each menu onto its own
      // page. A table before any body text is a banner too. Other tables
      // further down are menu content and are shown.
      if (isCafeHeading(text)) {
        if (current.hasBody) flush();
        current.banner += text;
      } else if (current.hasBody) {
        current.display += text;
      } else {
        current.banner += text;
      }
      continue;
    }

    if (!el.paragraph) continue;

    for (const pe of el.paragraph.elements ?? []) {
      if (pe.pageBreak) {
        flush();
        continue;
      }
      const text = (pe.textRun?.content ?? "").replace(/\v/g, "\n");
      current.display += text;
      if (text.trim()) current.hasBody = true;
    }
  }
  chunks.push(current);

  return chunks.map(({ display, banner }) => ({ display, banner }));
}

// ─── PDF → page chunks ────────────────────────────────────────────────────────

/**
 * Extract text from a PDF, one string per page. Lines are rebuilt from each
 * text item's vertical position, as pdf-parse's default renderer does.
 */
export async function extractPdfPages(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let lastY;
      let text = "";
      for (const item of content.items) {
        const y = item.transform[5];
        text += lastY === undefined || lastY === y ? item.str : `\n${item.str}`;
        lastY = y;
      }
      pages[pageData.pageIndex] = text;
      return text;
    },
  });
  return Array.from(pages, (p) => p ?? "");
}

/** Turn per-page PDF text into chunks shaped like docToChunks' output. */
export function pdfPagesToChunks(pages) {
  return (pages ?? []).map((text) => ({ display: text ?? "", banner: "" }));
}

// ─── Chunks → one section per cafe ────────────────────────────────────────────

const CAMPUS_PATTERNS = [
  ["Mesa Lab",     /mesa\s*lab/i],
  ["Foothills",    /foothills/i],
  ["Center Green", /center\s*green/i],
];

// Text that opens with a cafe heading: the cafe name, then either nothing or
// a heading word — "Mesa LAB LUNCH 11:30am - 1:30pm", "FOOTHILLS LAB",
// "Center Green". A menu line such as "Mesa Lab closed Friday" doesn't count.
const HEADING_RE = /^(mesa\s*lab|foothills(\s*lab)?|center\s*green)(\s+(lab|lunch|cafe|café|weekly|specials|menu)\b|\s*$)/i;

export function isCafeHeading(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= 80 && HEADING_RE.test(t);
}

/**
 * Which cafe a chunk belongs to, from the start of its text. Only the opening
 * lines are checked, and the earliest cafe name wins, so a menu note such as
 * "Foothills is closed Friday" on the Mesa Lab page can't relabel the page.
 */
export function detectCampus(text) {
  const head = String(text ?? "").replace(/\s+/g, " ").slice(0, 300);
  let best = null;
  for (const [campus, re] of CAMPUS_PATTERNS) {
    const m = re.exec(head);
    if (m && (best === null || m.index < best.index)) best = { campus, index: m.index };
  }
  return best?.campus ?? null;
}

/**
 * Further split chunks at cafe heading lines that aren't already at the top of
 * a chunk — covers a document whose menus are not separated by page breaks.
 */
function splitAtHeadings(chunks) {
  const out = [];
  for (const chunk of chunks) {
    const displayLines = chunk.display.split("\n");
    const cuts = [];
    let seenBody = false;
    displayLines.forEach((line, i) => {
      const t = line.replace(/\s+/g, " ").trim();
      if (!t) return;
      if (seenBody && isCafeHeading(t)) cuts.push(i);
      seenBody = true;
    });
    if (cuts.length === 0) { out.push(chunk); continue; }

    const bounds = [0, ...cuts, displayLines.length];
    for (let k = 0; k < bounds.length - 1; k++) {
      const display = displayLines.slice(bounds[k], bounds[k + 1]).join("\n");
      // The first piece keeps the chunk's banner/header text.
      out.push({ display, banner: k === 0 ? chunk.banner : "" });
    }
  }
  return out;
}

/**
 * Assign the combined document's chunks to cafes.
 *
 * Chunks naming a cafe go to that cafe. A chunk with no cafe name continues the
 * cafe before it (a menu that ran onto a second page); at the start of the
 * document it belongs to the first cafe in COMBINED_ORDER that no chunk names —
 * Center Green, whose page has no cafe name on it. If no chunk names any cafe,
 * pages are taken in COMBINED_ORDER.
 *
 * @returns {Record<string,string>} cafe → display text (absent if not found)
 */
export function splitCombinedSpecials(chunks) {
  const pieces = splitAtHeadings(chunks)
    .filter((c) => c.display.trim() || c.banner.trim())
    .map((c) => ({ ...c, campus: detectCampus(`${c.banner}\n${c.display}`) }));

  const sections = {};
  const append = (campus, text) => {
    sections[campus] = sections[campus] ? `${sections[campus]}\n${text}` : text;
  };

  if (!pieces.some((p) => p.campus)) {
    pieces.forEach((p, i) => {
      const campus = COMBINED_ORDER[i];
      if (campus) append(campus, p.display);
    });
  } else {
    const named   = new Set(pieces.map((p) => p.campus).filter(Boolean));
    const unnamed = COMBINED_ORDER.filter((c) => !named.has(c));
    let current = null;
    for (const p of pieces) {
      if (p.campus) current = p.campus;
      else if (current === null) current = unnamed[0] ?? null;
      if (current) append(current, p.display);
    }
  }

  for (const campus of Object.keys(sections)) {
    sections[campus] = tidy(sections[campus]);
    if (!sections[campus]) delete sections[campus];
  }
  return sections;
}

function tidy(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Display text of a whole (single-cafe) document — the legacy per-cafe files. */
export function chunksToText(chunks) {
  return tidy(chunks.map((c) => c.display).join("\n"));
}
