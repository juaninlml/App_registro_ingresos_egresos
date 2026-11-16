import { wordsToLines, type OcrWord } from "./ocr-lines";

/**
 * Lee un PDF escaneado completamente en el navegador (sin enviarlo a ningún servidor):
 * pdf.js dibuja cada página y Tesseract (WebAssembly) reconoce el texto.
 */

const OCR_WIDTH = 2480; // ≈ 300 dpi en carta; con menos resolución el OCR falla en cifras
const MAX_PAGES = 14;
const BASE = "/tesseract";

/** `psm` "6" = bloque de texto (mejor para tablas); "11" = texto disperso (mejor para cajas y etiquetas sueltas). */
export async function ocrPdf(file: File, psm: "4" | "6" | "11" = "6", onProgress?: (hechas: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: `${BASE}/pdfjs-wasm/` }).promise;
  const total = doc.numPages;
  if (total > MAX_PAGES) throw new Error(`El PDF tiene ${total} páginas; el máximo es ${MAX_PAGES}.`);

  const { createWorker } = await import("tesseract.js");
  const nWorkers = Math.min(2, total);
  const workers = await Promise.all(
    Array.from({ length: nWorkers }, async () => {
      const w = await createWorker("eng", 1, { workerPath: `${BASE}/worker.min.js`, corePath: `${BASE}/core`, langPath: `${BASE}/lang`, gzip: true });
      await w.setParameters({ tessedit_pageseg_mode: psm as never });
      return w;
    }),
  );

  const result: string[] = new Array(total).fill("");
  let next = 1;
  let hechas = 0;
  try {
    await Promise.all(
      workers.map(async (w) => {
        while (next <= total) {
          const n = next++;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: OCR_WIDTH / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d", { willReadFrequently: false });
          if (!ctx) throw new Error("Tu navegador no pudo preparar la página.");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const { data } = await w.recognize(canvas, {}, { tsv: true });
          result[n - 1] = wordsToLines(tsvWords(data.tsv ?? "")).join("\n");
          canvas.width = canvas.height = 0;
          page.cleanup();
          onProgress?.(++hechas, total);
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((w) => w.terminate().catch(() => {})));
  }
  return result;
}

function tsvWords(tsv: string): OcrWord[] {
  const out: OcrWord[] = [];
  for (const line of tsv.split("\n")) {
    const c = line.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const x = Number(c[6]), y = Number(c[7]), w = Number(c[8]), h = Number(c[9]);
    const text = c.slice(11).join("\t");
    if (text.trim() && Number.isFinite(x + y + w + h)) out.push({ text, x0: x, y0: y, x1: x + w, y1: y + h });
  }
  return out;
}
