import { addDays, addMonths, daysBetween, monthsDiff, nextBusinessDay, weekday } from "./dates";
import { round2 } from "./money";
import type { Card, ISODate, Msi, Payment, Statement, Transaction } from "./types";

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
export function projectCuts(card: Card, msis: Msi[], comprasEstimadas = 0, months?: number, comprasProximo = 0): CutRow[] {
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
      // el siguiente corte lleva al menos lo que ya compraste en el periodo (o tu estimado, si es mayor)
      const compras = i === 1 ? round2(Math.max(comprasEstimadas, comprasProximo)) : comprasEstimadas;
      rows.push({
        i, corte, limite: i === 1 ? limiteDeCorte(st, corte) : nextBusinessDay(addDays(corte, 19)), total: round2(msiTotal + compras),
        msiTotal, compras, real: false, terminan, detalle,
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

/**
 * Gastos registrados en Movimientos con esta tarjeta de crédito después del último corte: todavía no
 * vienen en el estado de cuenta, pero ya son deuda. Al subir el siguiente estado quedan dentro de su saldo.
 */
export function comprasDesdeCorte(card: Card, txs: Transaction[], st: Statement, hasta?: ISODate): Transaction[] {
  return txs.filter((t) => t.tipo === "gasto" && t.metodo === card.id && t.fecha > st.fechaCorte && (!hasta || t.fecha <= hasta));
}

export const totalCompras = (ts: Transaction[]) => round2(ts.reduce((s, t) => s + t.monto, 0));

/** Deuda total hoy: saldo del último corte, más las compras hechas después del corte, menos lo abonado. */
export function deudaActual(card: Card, payments: Payment[], st: Statement, compras = 0): number {
  return round2(Math.max(0, st.saldoTotal + compras - abonadoDesdeCorte(card, payments, st)));
}

/* ------------------------- Próximo pago y crédito ocupado por MSI ------------------------- */

/** ¿La compra registrada es en realidad un cargo a meses (mismo monto y fecha cercana a un MSI de la tarjeta)? */
export function esCompraMsi(t: Transaction, msis: Msi[]): boolean {
  return msis.some(
    (m) => m.cardId === t.metodo && Math.abs(m.montoOriginal - t.monto) < 1 && Math.abs(daysBetween(m.fechaOperacion, t.fecha)) <= 3,
  );
}

/** Fecha límite de un corte, con los mismos días entre corte y límite que el último estado de cuenta. */
export function limiteDeCorte(st: Statement, corte: ISODate): ISODate {
  const l = addDays(corte, Math.max(1, daysBetween(st.fechaCorte, st.fechaLimite)));
  const w = weekday(l);
  return w === 0 || w === 6 ? nextBusinessDay(l) : l;
}

export interface ProximoPago {
  corte: ISODate; // siguiente fecha de corte después del último estado de cuenta
  limite: ISODate; // fecha límite estimada de ese corte
  msi: { m: Msi; k: number }[]; // pagos de MSI que caen en ese corte (k = número de pago)
  msiTotal: number;
  compras: Transaction[]; // compras registradas antes del corte (sin contar las que son MSI)
  comprasTotal: number;
  total: number; // pago estimado para no generar intereses
}

/**
 * Pago estimado del siguiente corte: las mensualidades de los MSI que caen en él más las compras que
 * registraste con la tarjeta después del último corte y antes del siguiente. Las compras que son un MSI
 * no se cuentan completas (ya van en sus mensualidades).
 */
export function proximoPago(card: Card, msis: Msi[], comprasPeriodo: Transaction[], st: Statement): ProximoPago {
  const corte = addMonths(st.fechaCorte, 1);
  const mias = msis.filter((m) => m.cardId === card.id);
  const msi = mias.map((m) => ({ m, k: msiPagoEnCorte(m, corte) })).filter((x) => x.k > 0);
  const compras = comprasPeriodo.filter((t) => t.fecha > st.fechaCorte && t.fecha <= corte && !esCompraMsi(t, mias));
  const msiTotal = round2(msi.reduce((s, x) => s + x.m.pagoMensual, 0));
  const comprasTotal = totalCompras(compras);
  return { corte, limite: limiteDeCorte(st, corte), msi, msiTotal, compras, comprasTotal, total: round2(msiTotal + comprasTotal) };
}

export interface CreditoMsi {
  total: number; // lo que suman todas las mensualidades de los MSI vigentes
  ocupado: number; // lo que aún falta pagar: crédito que siguen ocupando
  liberado: number; // lo ya pagado: crédito que ya se liberó
  liberaProximo: number; // lo que se libera al pagar el siguiente corte
  activos: number;
}

/**
 * Cuánto crédito ocupan los MSI de una tarjeta y cuánto ya se liberó, según el último corte (lo cobrado
 * hasta ese corte cuenta como pagado). Los MSI ya liquidados no entran.
 */
export function creditoMsi(msis: Msi[], refCorte: ISODate): CreditoMsi {
  const vigentes = msis.map((m) => ({ m, i: msiInfo(m, refCorte) })).filter((x) => !x.i.liquidado);
  const total = round2(vigentes.reduce((s, x) => s + x.m.pagoMensual * x.m.totalPagos, 0));
  const ocupado = round2(vigentes.reduce((s, x) => s + x.i.saldoPendiente, 0));
  const liberaProximo = round2(vigentes.filter((x) => msiPagoEnCorte(x.m, addMonths(refCorte, 1)) > 0).reduce((s, x) => s + x.m.pagoMensual, 0));
  return { total, ocupado, liberado: round2(total - ocupado), liberaProximo, activos: vigentes.length };
}
