import { ocrPdf } from "./ocr-client";
import { analyzeStatement } from "./statement-parse";
import type { ParsedStatement } from "./statement";

/** Lee un PDF de estado de cuenta localmente (OCR en el navegador) y devuelve los datos para revisar. */
export async function readStatementPdf(file: File, onStatus: (msg: string) => void): Promise<ParsedStatement> {
  onStatus("Cargando el lector de texto…");
  let pages: string[] = [];
  let a: ReturnType<typeof analyzeStatement> = { statement: null, faltan: ["datos principales"] };
  const pasadas = [["6", "Leyendo"], ["11", "Segunda lectura"], ["4", "Tercera lectura"]] as const;
  for (const [psm, etiqueta] of pasadas) {
    if (pages.length) onStatus("Revisando de nuevo para completar datos…");
    const extra = await ocrPdf(file, psm, (d, t) => onStatus(`${etiqueta}: página ${d} de ${t}…`));
    pages = [...pages, ...extra];
    a = analyzeStatement(pages);
    if (!a.faltan.length) break; // cada pasada extra solo se hace si algo no cuadra
  }

  if (!a.statement) {
    throw new Error(
      `No pude identificar ${a.faltan.join(", ")}. Este lector está hecho para estados de cuenta de Santander con buena calidad; si es de otro banco o el PDF está borroso, captura los datos a mano.`,
    );
  }
  const st = a.statement;
  if (!st.banco) st.advertencias.unshift("No reconocí el banco; revisa todos los datos con cuidado.");
  return st;
}
