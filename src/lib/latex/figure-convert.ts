/**
 * Browser-only: rasterises the first page of a PDF figure to PNG so it can be
 * embedded in a Word document (Word can't embed PDF figures). pdf.js is loaded on
 * demand; its worker is the static /pdfjs/pdf.worker.min.mjs copied at build time.
 */
const TARGET_WIDTH_PX = 1400;
const MAX_SCALE = 4;

export async function renderPdfToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  // pdf.js transfers (detaches) the buffer it is given — hand it a copy.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_SCALE, Math.max(1, TARGET_WIDTH_PX / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas isn't available.");
    ctx.fillStyle = "#ffffff"; // PDF figures are usually transparent; Word shows black otherwise
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Couldn't encode the rendered figure.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    void doc.destroy();
  }
}
