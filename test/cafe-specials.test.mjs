import test from "node:test";
import assert from "node:assert/strict";

import {
  GOOGLE_DOC_MIME,
  PDF_MIME,
  chunksToText,
  detectCampus,
  docToChunks,
  formatWeekFolderVariants,
  normalizeDriveName,
  pdfPagesToChunks,
  pickSpecialsFile,
  splitCombinedSpecials,
} from "../api/_lib/cafeSpecials.mjs";

// ─── Google Docs API fixture builders ─────────────────────────────────────────
const para = (...lines) => ({
  paragraph: { elements: lines.map((content) => ({ textRun: { content } })) },
});
const pageBreak = () => ({ paragraph: { elements: [{ pageBreak: {} }, { textRun: { content: "\n" } }] } });
const sectionBreak = (sectionStyle = {}) => ({ sectionBreak: { sectionStyle } });
const table = (...rows) => ({
  table: {
    tableRows: rows.map((cells) => ({
      tableCells: cells.map((text) => ({ content: [para(`${text}\n`)] })),
    })),
  },
});
const doc = (content, extra = {}) => ({ body: { content: [sectionBreak(), ...content] }, ...extra });

const CENTER_GREEN = [
  para("GRAB & GO\n"),
  para("Chef’s Sandwich of the Week\n"),
  para("B.L.T. Hoagie\n"),
  table(["Chicken Salad Sandwich", "$7.50"], ["Tuna Salad Sandwich", "$7.50"]),
];
const MESA_LAB = [
  table(["Mesa LAB LUNCH\v11:30am - 1:30pm", "WEEKLY SPECIALS", ""]),
  para("Monday, November 23rd\n"),
  para("Chef’s Choice\n"),
];
const FOOTHILLS = [
  table(["FOOTHILLS LAB LUNCH\v11:30am - 1:30pm", "WEEKLY SPECIALS", ""]),
  para("Wednesday, November 25th\n"),
  para("Grab and GO\n"),
];

// ─── File names ───────────────────────────────────────────────────────────────
test("normalizeDriveName ignores case, punctuation, ordinals, month spelling and extension", () => {
  assert.equal(normalizeDriveName("Nov 23rd - Nov 27th.pdf"), "nov23nov27");
  assert.equal(normalizeDriveName("November 23 – 27_ML"), "nov2327ml");
  assert.equal(normalizeDriveName("Nov 23rd - 27th_ML"), "nov2327ml");
  assert.equal(normalizeDriveName("Sept 1st-5th"), "sep15");
});

test("formatWeekFolderVariants gives short and long names, one name across a month boundary", () => {
  assert.deepEqual(formatWeekFolderVariants(new Date(2026, 10, 23)),
    ["Nov 23rd - 27th", "Nov 23rd - Nov 27th"]);
  assert.deepEqual(formatWeekFolderVariants(new Date(2026, 10, 30)), ["Nov 30th - Dec 4th"]);
});

test("pickSpecialsFile prefers a legacy per-cafe file", () => {
  const files = [
    { id: "all", name: "Nov 23rd - Nov 27th", mimeType: GOOGLE_DOC_MIME },
    { id: "ml",  name: "Nov 23rd - 27th_ML",  mimeType: GOOGLE_DOC_MIME },
  ];
  const variants = formatWeekFolderVariants(new Date(2026, 10, 23));
  assert.deepEqual(pickSpecialsFile(files, variants, "_ML"), { file: files[1], combined: false });
  assert.deepEqual(pickSpecialsFile(files, variants, "_FL"), { file: files[0], combined: true });
});

test("pickSpecialsFile finds the combined file and prefers the Doc over an exported PDF", () => {
  const variants = formatWeekFolderVariants(new Date(2026, 10, 23));
  const pdf = { id: "pdf", name: "Nov 23rd - Nov 27th.pdf", mimeType: PDF_MIME };
  const gdoc = { id: "doc", name: "Nov 23rd - 27th Specials", mimeType: GOOGLE_DOC_MIME };
  assert.deepEqual(pickSpecialsFile([pdf], variants, "_CG"), { file: pdf, combined: true });
  assert.deepEqual(pickSpecialsFile([pdf, gdoc], variants, "_CG"), { file: gdoc, combined: true });
});

test("pickSpecialsFile ignores other weeks, other cafes' files and unreadable types", () => {
  const variants = formatWeekFolderVariants(new Date(2026, 10, 2)); // "Nov 2nd - 6th" → "nov26"
  const files = [
    { id: "a", name: "Nov 26th - 30th", mimeType: GOOGLE_DOC_MIME },
    { id: "b", name: "Nov 2nd - 6th_FL", mimeType: GOOGLE_DOC_MIME },
    { id: "c", name: "Nov 2nd - 6th.xlsx", mimeType: "application/vnd.ms-excel" },
  ];
  assert.equal(pickSpecialsFile(files, variants, "_ML"), null);
});

// ─── Splitting the combined document ──────────────────────────────────────────
test("splits a combined Google Doc by page break in Center Green, Mesa Lab, Foothills order", () => {
  const d = doc([...CENTER_GREEN, pageBreak(), ...MESA_LAB, pageBreak(), ...FOOTHILLS, pageBreak(), para("\n")]);
  const s = splitCombinedSpecials(docToChunks(d));

  assert.deepEqual(Object.keys(s).sort(), ["Center Green", "Foothills", "Mesa Lab"]);
  assert.match(s["Center Green"], /^GRAB & GO\nChef’s Sandwich of the Week\nB\.L\.T\. Hoagie/);
  assert.match(s["Center Green"], /Chicken Salad Sandwich {3}\$7\.50/);
  assert.equal(s["Mesa Lab"], "Monday, November 23rd\nChef’s Choice");
  assert.equal(s["Foothills"], "Wednesday, November 25th\nGrab and GO");
});

test("splits on next-page section breaks and reads cafe names from page headers", () => {
  const headers = {
    h1: { content: [para("Mesa LAB LUNCH\n")] },
    h2: { content: [para("FOOTHILLS LAB LUNCH\n")] },
  };
  const d = doc([
    ...CENTER_GREEN,
    sectionBreak({ sectionType: "NEXT_PAGE", defaultHeaderId: "h1" }),
    para("Monday, November 23rd\n"),
    sectionBreak({ sectionType: "NEXT_PAGE", defaultHeaderId: "h2" }),
    para("Tuesday, November 24th\n"),
  ], { headers });
  const s = splitCombinedSpecials(docToChunks(d));
  assert.equal(s["Mesa Lab"], "Monday, November 23rd");
  assert.equal(s["Foothills"], "Tuesday, November 24th");
  assert.match(s["Center Green"], /^GRAB & GO/);
});

test("splits at cafe heading lines when there are no page breaks", () => {
  const d = doc([
    para("GRAB & GO\n"), para("B.L.T. Hoagie\n"),
    para("Mesa LAB LUNCH\n"), para("Monday, November 23rd\n"),
    para("FOOTHILLS LAB\n"), para("Closed\n"),
  ]);
  const s = splitCombinedSpecials(docToChunks(d));
  assert.equal(s["Center Green"], "GRAB & GO\nB.L.T. Hoagie");
  assert.equal(s["Mesa Lab"], "Mesa LAB LUNCH\nMonday, November 23rd");
  assert.equal(s["Foothills"], "FOOTHILLS LAB\nClosed");
});

test("a page with no cafe name continues the menu before it", () => {
  const d = doc([...CENTER_GREEN, pageBreak(), para("Breakfast Burrito $7.50\n"),
    pageBreak(), ...MESA_LAB, pageBreak(), ...FOOTHILLS]);
  const s = splitCombinedSpecials(docToChunks(d));
  assert.match(s["Center Green"], /Breakfast Burrito \$7\.50$/);
  assert.equal(s["Mesa Lab"], "Monday, November 23rd\nChef’s Choice");
});

test("falls back to page order when no page names a cafe", () => {
  const s = splitCombinedSpecials(pdfPagesToChunks(["Grab and go", "Monday menu", "Tuesday menu", ""]));
  assert.deepEqual(s, { "Center Green": "Grab and go", "Mesa Lab": "Monday menu", "Foothills": "Tuesday menu" });
});

test("a cafe mentioned in a menu note does not relabel the page", () => {
  assert.equal(detectCampus("Mesa LAB LUNCH 11:30am Monday: Foothills staff welcome"), "Mesa Lab");
  const s = splitCombinedSpecials(pdfPagesToChunks([
    "GRAB & GO\nSandwich",
    "Mesa LAB LUNCH\nNote: Foothills is closed Friday",
    "FOOTHILLS LAB\nChef’s Choice",
  ]));
  assert.equal(s["Mesa Lab"], "Mesa LAB LUNCH\nNote: Foothills is closed Friday");
  assert.equal(s["Foothills"], "FOOTHILLS LAB\nChef’s Choice");
});

test("a cafe missing from the combined document has no section", () => {
  const s = splitCombinedSpecials(pdfPagesToChunks(["Mesa LAB LUNCH\nMonday", "FOOTHILLS LAB\nMonday"]));
  assert.equal(s["Center Green"], undefined);
  assert.equal(s["Mesa Lab"], "Mesa LAB LUNCH\nMonday");
});

test("legacy per-cafe docs read as before, banner table excluded", () => {
  const d = doc([...MESA_LAB, pageBreak(), para("Friday, November 27th\n")]);
  assert.equal(chunksToText(docToChunks(d)), "Monday, November 23rd\nChef’s Choice\n\nFriday, November 27th");
});

// ─── Documents that use Google Docs tabs ──────────────────────────────────────
const tab = (title, content, childTabs = []) => ({
  tabProperties: { title },
  documentTab: { body: { content: [sectionBreak(), ...content] } },
  childTabs,
});

test("reads every tab, naming cafes by tab title", () => {
  const d = { tabs: [
    tab("Center Green", CENTER_GREEN),
    tab("Mesa Lab", [para("Monday, November 23rd\n")]),
    tab("Foothills", [para("Closed\n")]),
  ] };
  const s = splitCombinedSpecials(docToChunks(d));
  assert.match(s["Center Green"], /^GRAB & GO/);
  assert.equal(s["Mesa Lab"], "Monday, November 23rd");
  assert.equal(s["Foothills"], "Closed");
});

test("untitled tabs fall back to banner text and tab order", () => {
  const d = { tabs: [tab("Tab 1", CENTER_GREEN), tab("Tab 2", MESA_LAB, [tab("Tab 3", FOOTHILLS)])] };
  const s = splitCombinedSpecials(docToChunks(d));
  assert.match(s["Center Green"], /^GRAB & GO/);
  assert.equal(s["Mesa Lab"], "Monday, November 23rd\nChef’s Choice");
  assert.equal(s["Foothills"], "Wednesday, November 25th\nGrab and GO");
});

test("pickSpecialsFile accepts words before or after the week dates", () => {
  const variants = formatWeekFolderVariants(new Date(2026, 10, 23));
  for (const name of ["Weekly Specials Nov 23rd - Nov 27th", "2026 Nov 23rd - 27th", "Nov 23rd - 27th Cafe Specials"]) {
    const file = { id: "x", name, mimeType: GOOGLE_DOC_MIME };
    assert.deepEqual(pickSpecialsFile([file], variants, "_ML"), { file, combined: true }, name);
  }
  // …but a cafe suffix after the dates is still a legacy file for that cafe only.
  assert.equal(pickSpecialsFile([{ id: "y", name: "Specials Nov 23rd - 27th_FL", mimeType: GOOGLE_DOC_MIME }], variants, "_ML"), null);
});
