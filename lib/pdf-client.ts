/** Convierte un PDF en imágenes JPEG dentro del navegador (los estados de cuenta suelen ser escaneos sin texto
 *  y pesan más que el límite de 4.5 MB de una función de Vercel, así que se envían ya reducidos). */

const MAX_TOTAL_BYTES = 3_800_000;
const MAX_PAGES = 14;

export interface RenderedPdf {
  pages: Blob[];
  totalBytes: number;
  pageCount: number;
}

export async function renderPdfToJpegs(file: File, onProgress?: (done: number, total: number) => void): Promise<RenderedPdf> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageCount = doc.numPages;
  if (pageCount > MAX_PAGES) throw new Error(`El PDF tiene ${pageCount} páginas; el máximo es ${MAX_PAGES}.`);

  // Intenta con buena resolución y baja si el total no cabe.
  const attempts = [
    { width: 1500, quality: 0.78 },
    { width: 1300, quality: 0.7 },
    { width: 1100, quality: 0.62 },
    { width: 900, quality: 0.55 },
  ];
  for (const a of attempts) {
    const pages: Blob[] = [];
    let total = 0;
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: a.width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Tu navegador no pudo preparar la imagen.");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", a.quality));
      if (!blob) throw new Error("No se pudo convertir una página.");
      pages.push(blob);
      total += blob.size;
      canvas.width = canvas.height = 0;
      page.cleanup();
      onProgress?.(i, pageCount);
    }
    if (total <= MAX_TOTAL_BYTES || a === attempts[attempts.length - 1]) {
      if (total > MAX_TOTAL_BYTES) throw new Error("El PDF es demasiado pesado incluso reducido.");
      return { pages, totalBytes: total, pageCount };
    }
  }
  throw new Error("No se pudo procesar el PDF.");
}
