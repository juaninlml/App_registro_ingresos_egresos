export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Reconstruye renglones a partir de las palabras del OCR usando sus coordenadas.
 * Así "etiqueta ........ monto" queda en un mismo renglón aunque la página tenga dos columnas.
 */
export function wordsToLines(words: OcrWord[]): string[] {
  const ws = words.filter((w) => w.text.trim()).map((w) => ({ ...w, cy: (w.y0 + w.y1) / 2, h: w.y1 - w.y0 }));
  if (!ws.length) return [];
  const hs = ws.map((w) => w.h).sort((a, b) => a - b);
  const tol = Math.max(4, hs[Math.floor(hs.length / 2)] * 0.55);
  ws.sort((a, b) => a.cy - b.cy);
  const rows: (typeof ws)[] = [];
  for (const w of ws) {
    const row = rows[rows.length - 1];
    const cy = row ? row.reduce((s, x) => s + x.cy, 0) / row.length : 0;
    if (row && Math.abs(w.cy - cy) <= tol) row.push(w);
    else rows.push([w]);
  }
  return rows.map((r) => r.sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(" "));
}
