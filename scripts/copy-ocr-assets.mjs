// Copia los archivos del OCR (Tesseract) a /public/tesseract para servirlos desde tu propio dominio.
// Se ejecuta solo después de `npm install` (también en Vercel). La carpeta destino no se sube a git.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = join(root, "public", "tesseract");

try {
  const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`, { paths: [root] }));
  const tess = pkgDir("tesseract.js");
  const core = pkgDir("tesseract.js-core");
  const data = pkgDir("@tesseract.js-data/eng");

  mkdirSync(join(out, "core"), { recursive: true });
  mkdirSync(join(out, "lang"), { recursive: true });
  cpSync(join(tess, "dist", "worker.min.js"), join(out, "worker.min.js"));
  for (const f of readdirSync(core)) {
    if (/^tesseract-core.*-lstm\.wasm\.js$/.test(f)) cpSync(join(core, f), join(out, "core", f));
  }
  const lang = join(data, "4.0.0_best_int", "eng.traineddata.gz");
  cpSync(existsSync(lang) ? lang : join(data, "4.0.0", "eng.traineddata.gz"), join(out, "lang", "eng.traineddata.gz"));
  const pdfjs = pkgDir("pdfjs-dist");
  if (existsSync(join(pdfjs, "wasm"))) cpSync(join(pdfjs, "wasm"), join(out, "pdfjs-wasm"), { recursive: true });
  console.log("OCR: archivos copiados a public/tesseract");
} catch (e) {
  console.warn("OCR: no se pudieron copiar los archivos:", e instanceof Error ? e.message : e);
}
