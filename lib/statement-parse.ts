import { isISO } from "./dates";
import { round2 } from "./money";
import { normalizeStatement, type ParsedStatement } from "./statement";

/**
 * Interpreta el texto obtenido por OCR de un estado de cuenta (formato Santander México).
 * Es tolerante a errores típicos del OCR y verifica los cargos a meses con aritmética
 * (monto ÷ plazo = pago mensual; saldo pendiente = pagos restantes × pago mensual).
 */

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
// Montos: "$ 6,397.98", "$1791.67" o, cuando el OCR pierde la puntuación, "$2150000" (= 21,500.00) o "§144652" (= 1,446.52)
const MONEY = /[$§]\s?(\d[\d.,]*\d)|(\d[\d,]*\.\d{2})(?!\d)/g;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const toNum = (s: string) => Number(s.replace(/,/g, ""));
function toAmount(raw: string): number {
  if (/^\d{1,3}(,\d{3})*\.\d{2}$|^\d+\.\d{2}$/.test(raw)) return toNum(raw);
  const d = raw.replace(/[.,]/g, "");
  return d.length >= 3 ? Number(`${d.slice(0, -2)}.${d.slice(-2)}`) : NaN;
}
const amounts = (s: string) => [...s.matchAll(MONEY)].map((m) => toAmount(m[1] ?? m[2])).filter((n) => Number.isFinite(n));
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

/** Mes por nombre abreviado, tolerando una letra mal leída ("noy" → nov). */
function mesFuzzy(raw: string): number | null {
  const k = raw.toLowerCase().replace(/0/g, "o").slice(0, 3);
  if (MESES[k]) return MESES[k];
  let best: number | null = null;
  for (const [name, n] of Object.entries(MESES)) {
    if (name.length === 3 && k.length === 3 && [...name].filter((c, i) => c !== k[i]).length === 1) {
      if (best !== null && best !== n) return null; // ambiguo
      best = n;
    }
  }
  return best;
}

function dateIn(s: string): string | null {
  const m = s.match(/(\d{1,2})\s*[-–. ]\s*([A-Za-z0]{3,4})\s*[-–. ]\s*(\d{2,4})/);
  if (!m) return null;
  const mes = mesFuzzy(m[2]);
  if (!mes) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = Number(m[1]);
  if (d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const iso = `${y}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isISO(iso) ? iso : null;
}

const digitsFix = (s: string) => Number(s.replace(/[OoQ]/g, "0").replace(/[Il|]/g, "1").replace(/\D/g, ""));
const last4 = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
};

function build(pages: string[]) {
  const lines = pages.flatMap((p) => p.split(/\r?\n/)).map((l) => l.trim()).filter(Boolean);
  const pl = lines.map(plain);
  const advertencias: string[] = [];

  const firstWith = (re: RegExp, extra?: (l: string) => boolean) => pl.findIndex((l) => re.test(l) && (!extra || extra(l)));

  // --- fechas
  const iCorte = firstWith(/fecha de corte/);
  let fechaCorte = iCorte >= 0 ? dateIn(lines[iCorte].slice(pl[iCorte].indexOf("fecha de corte"))) : null;
  if (!fechaCorte) {
    // "Periodo: Del 3-Oct-2026 al 4-Nov-2026": el corte es la segunda fecha
    const iPer = firstWith(/periodo.*\sal\s/);
    if (iPer >= 0) fechaCorte = dateIn(lines[iPer].slice(pl[iPer].lastIndexOf(" al ") + 3));
  }
  const iLim = firstWith(/fecha l.mite de pago/);
  const fechaLimite = iLim >= 0 ? dateIn(lines[iLim].slice(Math.max(0, pl[iLim].indexOf("de pago")))) : null;

  // --- montos del resumen
  const amountAfter = (i: number, key: string) => {
    if (i < 0) return null;
    const rest = lines[i].slice(Math.max(0, pl[i].indexOf(key)) + key.length);
    const a = amounts(rest);
    if (a.length) return a[0];
    const next = amounts(lines[i + 1] ?? ""); // a veces el monto cae en la línea siguiente
    return next.length ? next[next.length - 1] : null;
  };
  const kPago = "pago para no generar intereses";
  const pagoNoIntereses = amountAfter(firstWith(/pago para no generar intereses/, (l) => amounts(l.slice(l.indexOf("intereses"))).length > 0), kPago);
  const iMin = firstWith(/pago minimo/, (l) => !l.includes("+") && !l.includes("compras") && !l.includes("veces") && !/^el /.test(l) && amounts(l).length > 0);
  const pagoMinimo = amountAfter(iMin, "pago minimo");
  let saldoTotal = amountAfter(firstWith(/saldo deudor total/), "saldo deudor total");
  const limiteCredito = amountAfter(firstWith(/limite de credito/, (l) => amounts(l).length > 0), "limite de credito");

  // --- tarjeta
  const iNum = firstWith(/numero de tarjeta/);
  const terminacion = iNum >= 0 ? last4(lines[iNum].slice(pl[iNum].indexOf("numero de tarjeta") + 17).slice(0, 30)) : null;
  const banco = pl.some((l) => l.includes("santander")) ? "Santander" : null;

  // --- cargos a meses
  type Row = { descripcion: string; fechaOperacion: string; montoOriginal: number; saldoPendiente: number; pagoRequerido: number; pagoActual: number; totalPagos: number; terminacionTarjeta: string | null };
  const msi: Row[] = [];
  const dudosas: { fecha: string; desc: string; nums: number[] }[] = [];
  const mismaFila = (a: { fecha: string; nums: number[] }, b: { fecha: string; nums: number[] }) =>
    a.fecha === b.fecha && a.nums.filter((x) => b.nums.some((y) => near(x, y, 0.011))).length >= 2;
  let tarjetaSeccion: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const hdr = pl[i].match(/tarjeta\s+(?:titular|adicional)\D*([\d ]{12,24})/);
    if (hdr) tarjetaSeccion = last4(hdr[1]);

    const f = dateIn(lines[i].slice(0, 16));
    if (!f || !/^\W*\d{1,2}\s*[-–. ]/.test(lines[i])) continue;
    const firstAmt = lines[i].search(new RegExp(MONEY.source));
    const amts = firstAmt >= 0 ? amounts(lines[i].slice(firstAmt)) : [];
    if (amts.length < 3) continue;
    const resto = lines[i].slice(firstAmt);
    const m = resto.match(/(\d{1,2}|[O0]\d)\s*D[EF3]\s*([0-9OoQIl]{1,2})/i);

    let desc = lines[i].slice(0, firstAmt).replace(/^\W*\d{1,2}\s*[-–. ]\s*[A-Za-z0]{3,4}\s*[-–. ]\s*\d{2,4}/, "").replace(/[$|\[\]_]+\s*$/g, "").replace(/\s*\$\s*$/, "").trim();
    desc = desc.replace(/\s+/g, " ");
    const plazoDesc = desc.match(/(\d{1,2})\s*M\s*S\/?\s*INT/i);
    let [monto, saldo, mensual] = amts;

    // Plazo: de la descripción ("12M S/INT") o del "NN DE MM"
    const nn = plazoDesc ? Number(plazoDesc[1]) : m ? digitsFix(m[2]) : NaN;
    if (!Number.isFinite(nn) || nn < 1) {
      dudosas.push({ fecha: f, desc, nums: [monto, saldo, mensual] });
      continue;
    }
    // Número de pago: del "NN DE MM" o deducido de las cifras: (monto − saldo) ÷ pago
    let kk = m ? digitsFix(m[1]) : NaN;
    if (!Number.isFinite(kk) && mensual > 0) {
      const d = (monto - saldo) / mensual;
      if (Math.abs(d - Math.round(d)) <= 0.08) kk = Math.round(d);
    }
    if (!Number.isFinite(kk) || kk < 1 || kk > nn) {
      dudosas.push({ fecha: f, desc, nums: [monto, saldo, mensual] });
      continue;
    }

    // Verificación aritmética: monto ≈ plazo × pago, y saldo pendiente = monto − pagos hechos × pago
    const r3 = (mo: number, sa: number, me: number) => Math.abs(mo - kk * me - sa) <= (kk === nn ? 1 : 0.06);
    const r1 = (mo: number, me: number) => Math.abs(mo / nn - me) <= 0.5;
    if (!(r1(monto, mensual) && r3(monto, saldo, mensual))) {
      const mCand = round2(monto / nn);
      const montoAlt = round2(saldo + kk * mensual);
      if (kk < nn && r1(monto, mCand) && r3(monto, saldo, mCand)) {
        advertencias.push(`"${desc}": el pago mensual leído (${mensual}) no cuadra con el monto; se cambió a ${mCand}. Verifícalo.`);
        mensual = mCand;
      } else if (kk < nn && r1(montoAlt, mensual)) {
        advertencias.push(`"${desc}": el monto original leído (${monto}) no cuadra; se cambió a ${montoAlt}. Verifícalo.`);
        monto = montoAlt;
      } else if (r1(monto, mensual)) {
        saldo = round2(monto - kk * mensual);
      } else {
        advertencias.push(`"${desc}" (${f}): el monto (${monto}) y el pago mensual (${mensual}) no cuadran entre sí; revisa cuál es el correcto.`);
      }
    }

    const fila = { fecha: f, nums: [monto, saldo, mensual] };
    if (msi.some((x) => mismaFila(fila, { fecha: x.fechaOperacion, nums: [x.montoOriginal, x.saldoPendiente, x.pagoRequerido] }))) continue;
    msi.push({ descripcion: desc, fechaOperacion: f, montoOriginal: monto, saldoPendiente: saldo, pagoRequerido: mensual, pagoActual: kk, totalPagos: nn, terminacionTarjeta: tarjetaSeccion });
  }
  // Filas que no se pudieron interpretar y que tampoco aparecen leídas bien en otra pasada
  const avisadas = new Set<string>();
  for (const d of dudosas) {
    const cubierta = msi.some((x) => x.fechaOperacion === d.fecha && d.nums.some((y) => [x.montoOriginal, x.saldoPendiente, x.pagoRequerido].some((z) => near(z, y, 0.011))));
    const k = `${d.fecha}|${d.desc}`;
    if (!cubierta && !avisadas.has(k)) {
      avisadas.add(k);
      advertencias.push(`No pude leer completa una fila de meses sin intereses ("${d.desc}", ${d.fecha}); agrégala a mano si falta.`);
    }
  }

  const faltan: string[] = [];
  if (!fechaCorte) faltan.push("fecha de corte");
  if (!fechaLimite) faltan.push("fecha límite");
  if (pagoNoIntereses === null) faltan.push("pago para no generar intereses");
  if (saldoTotal === null) {
    faltan.push("saldo total");
    // El propio estado de cuenta define: saldo deudor total = pago para no generar intereses + saldo pendiente a meses
    if (pagoNoIntereses !== null && msi.length) {
      saldoTotal = round2(pagoNoIntereses + msi.reduce((s, x) => s + x.saldoPendiente, 0));
      advertencias.push(`El saldo total no se leyó; se calculó como pago sin intereses + saldo pendiente de meses (${saldoTotal}). Verifícalo.`);
    }
  }
  // Control cruzado: saldo deudor total − pago para no generar intereses = suma de saldos pendientes de los meses sin intereses
  if (msi.length && saldoTotal !== null && pagoNoIntereses !== null && !faltan.includes("saldo total")) {
    const suma = round2(msi.reduce((t, x) => t + x.saldoPendiente, 0));
    const esperado = round2(saldoTotal - pagoNoIntereses);
    if (esperado - suma > 1) { // (si es negativo puede ser saldo a favor, no un renglón faltante)
      faltan.push("cargos a meses completos");
      advertencias.push(`La suma de saldos pendientes de meses leída (${suma}) no coincide con la del estado de cuenta (${esperado}); falta o está mal leída alguna fila (diferencia ${round2(esperado - suma)}).`);
    }
  }
  if (!msi.length) {
    faltan.push("cargos a meses");
    advertencias.push("No se detectaron cargos a meses sin intereses. Si tu estado de cuenta los tiene, agrégalos a mano.");
  }
  if (pagoNoIntereses === null) advertencias.push("No se pudo leer el pago para no generar intereses.");

  return { input: { banco, nombreTarjeta: null, terminacion, fechaCorte, fechaLimite, saldoTotal, pagoNoIntereses, pagoMinimo, limiteCredito, msi, advertencias }, faltan };
}

export function parseStatementPages(pages: string[]): ParsedStatement {
  return normalizeStatement(build(pages).input);
}

/** Igual que parseStatementPages pero sin lanzar: devuelve lo leído y qué datos no se pudieron identificar. */
export function analyzeStatement(pages: string[]): { statement: ParsedStatement | null; faltan: string[] } {
  const { input, faltan } = build(pages);
  try {
    return { statement: normalizeStatement(input), faltan };
  } catch {
    return { statement: null, faltan: faltan.length ? faltan : ["datos principales"] };
  }
}
