/**
 * Renders all pages of a PDF onto canvas elements using PDF.js.
 * Returns an array of PNG data URLs (one per page) suitable for printing as images.
 *
 * @param {string} pdfSource - base64 string (with or without data URI prefix) OR blob URL
 * @param {number} scale - render scale (2 = high DPI, good for print). Default: 2
 * @returns {Promise<string[]>} Array of PNG data URLs, one per page
 */
export async function renderPdfToImages(pdfSource, scale = 2) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("PDF.js not loaded");

  let pdfData;
  if (typeof pdfSource === "string" && pdfSource.startsWith("blob:")) {
    const res = await fetch(pdfSource);
    pdfData = await res.arrayBuffer();
  } else {
    const base64 = pdfSource.replace(/^data:application\/pdf;base64,/, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    pdfData = bytes.buffer;
  }

  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const images = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    images.push(canvas.toDataURL("image/png"));
  }

  return images;
}
