import { addDays, addMonths, monthsDiff, nextBusinessDay } from "./dates";
import { round2 } from "./money";
import type { Card, ISODate, Msi, Payment, Statement } from "./types";

export function latestStatement(card: Card): Statement | null {
  if (!card.statements.length) return null;
  return [...card.statements].sort((a, b) => b.fechaCorte.localeCompare(a.fechaCorte))[0];
}

/** Número de pago (1..total) que cae en `corte`, o 0 si ese corte no lleva pago de este MSI. */
export function msiPagoEnCorte(m: Msi, corte: ISODate): number {
  const k = monthsDiff(m.primerCorte, corte) + 1;
  return k >= 1 && k <= m.totalPagos ? k : 0;
}

export interface MsiInfo {
  pagoActual: number;
  restantes: number;
  fechaTermino: ISODate; // corte en que cae el último pago
  saldoPendiente: number;
  liquidado: boolean;
}

/** Estado del MSI según el corte de referencia (normalmente el último estado de cuenta). */
export function msiInfo(m: Msi, refCorte: ISODate): MsiInfo {
  const k = Math.min(Math.max(monthsDiff(m.primerCorte, refCorte) + 1, 0), m.totalPagos);
  const restantes = m.totalPagos - k;
  return {
    pagoActual: k,
    restantes,
    fechaTermino: addMonths(m.primerCorte, m.totalPagos - 1),
    saldoPendiente: round2(restantes * m.pagoMensual),
    liquidado: restantes === 0,
  };
}

/** Primer corte en el que aparece el cargo: el siguiente corte de la tarjeta después de la compra. */
export function primerCorteSugerido(card: Card, fechaOperacion: ISODate): ISODate {
  const ref = latestStatement(card)?.fechaCorte;
  const dia = ref ? Number(ref.slice(8, 10)) : card.diaCorte;
  const [y, m] = fechaOperacion.split("-").map(Number);
  // corte de ese mes (ajustado al fin de mes si el día no existe); si la compra es posterior, el del mes siguiente
  const corte = clampDay(y, m, dia);
  if (fechaOperacion <= corte) return corte;
  const next = addMonths(`${y}-${String(m).padStart(2, "0")}-01`, 1);
  return clampDay(Number(next.slice(0, 4)), Number(next.slice(5, 7)), dia);
}

function clampDay(y: number, m: number, dia: number): ISODate {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(dia, last)).padStart(2, "0")}`;
}

export interface CutRow {
  i: number;
  corte: ISODate;
  limite: ISODate;
  total: number; // lo que hay que pagar para no generar intereses
  msiTotal: number;
  compras: number;
  real: boolean; // true = viene del estado de cuenta; false = proyección
  terminan: number; // MSI cuyo último pago cae en este corte
  detalle: { msiId: string; pago: number; k: number; totalPagos: number }[];
}

/** Meses a proyectar para cubrir hasta el último pago de MSI. */
export function horizonte(card: Card, msis: Msi[]): number {
  const st = latestStatement(card);
  if (!st) return 0;
  let max = 0;
  for (const m of msis) {
    const fin = monthsDiff(st.fechaCorte, addMonths(m.primerCorte, m.totalPagos - 1));
    if (fin > max) max = fin;
  }
  return Math.min(Math.max(max + 1, 2), 72);
}

/**
 * Proyección por corte. El primer corte usa el monto real del último estado de cuenta;
 * los siguientes suman los pagos mensuales de los MSI vigentes más las compras estimadas.
 */
export function projectCuts(card: Card, msis: Msi[], comprasEstimadas = 0, months?: number): CutRow[] {
  const st = latestStatement(card);
  if (!st) return [];
  const mine = msis.filter((m) => m.cardId === card.id);
  const n = months ?? horizonte(card, mine);
  const rows: CutRow[] = [];
  for (let i = 0; i < n; i++) {
    const corte = addMonths(st.fechaCorte, i);
    const detalle: CutRow["detalle"] = [];
    let msiTotal = 0;
    let terminan = 0;
    for (const m of mine) {
      const k = msiPagoEnCorte(m, corte);
      if (k > 0) {
        msiTotal += m.pagoMensual;
        detalle.push({ msiId: m.id, pago: m.pagoMensual, k, totalPagos: m.totalPagos });
        if (k === m.totalPagos) terminan++;
      }
    }
    msiTotal = round2(msiTotal);
    if (i === 0) {
      rows.push({
        i, corte, limite: st.fechaLimite, total: st.pagoNoIntereses, msiTotal,
        compras: round2(Math.max(0, st.pagoNoIntereses - msiTotal)), real: true, terminan, detalle,
      });
    } else {
      rows.push({
        i, corte, limite: nextBusinessDay(addDays(corte, 19)), total: round2(msiTotal + comprasEstimadas),
        msiTotal, compras: comprasEstimadas, real: false, terminan, detalle,
      });
    }
  }
  return rows;
}

/** Abonos registrados a una tarjeta después del corte de un estado de cuenta. */
export function abonadoDesdeCorte(card: Card, payments: Payment[], st: Statement): number {
  return round2(
    payments
      .filter((p) => p.destino === "card" && p.targetId === card.id && p.fecha > st.fechaCorte)
      .reduce((s, p) => s + p.monto, 0),
  );
}
