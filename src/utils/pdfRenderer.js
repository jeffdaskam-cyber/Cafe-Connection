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

/**
 * Trims empty whitespace from the bottom of a PNG data URL.
 * Loads the image onto a canvas, scans from the bottom up to find
 * the last row with non-white pixels, then crops.
 *
 * @param {string} dataUrl - PNG data URL from renderPdfToImages
 * @param {number} padding - Extra pixels to keep below content (default: 20)
 * @returns {Promise<string>} Cropped PNG data URL
 */
export async function trimImageBottom(dataUrl, padding = 20) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Scan from bottom up to find last row with non-white content
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;
      let lastContentRow = 0;

      for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          // Check if pixel is not white/near-white (allow for anti-aliasing)
          if (a > 10 && (r < 245 || g < 245 || b < 245)) {
            lastContentRow = y;
            break;
          }
        }
        if (lastContentRow > 0) break;
      }

      // Crop canvas to content height + padding
      const cropHeight = Math.min(lastContentRow + padding, height);
      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = width;
      croppedCanvas.height = cropHeight;
      const croppedCtx = croppedCanvas.getContext("2d");
      croppedCtx.drawImage(canvas, 0, 0, width, cropHeight, 0, 0, width, cropHeight);

      resolve(croppedCanvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original on error
    img.src = dataUrl;
  });
}
