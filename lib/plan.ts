import { addDays, daysBetween, mondayOnOrAfter } from "./dates";
import { latestStatement, projectCuts, type CutRow } from "./finance";
import { round2 } from "./money";
import type { Card, ISODate, Msi, Payment, PlanConfig } from "./types";

export interface WeekRow {
  n: number;
  lunes: ISODate;
  domingo: ISODate;
  abonoPlan: number;
  abonoReal: number;
  abono: number;
  fuente: "plan" | "real";
  vence: number; // lo que vence esta semana (fecha límite de algún corte)
  disponible: number; // abono + saldo a favor que venías arrastrando
  pendiente: number; // lo que faltaría de tu bolsillo esta semana
  remanente: number; // saldo a favor que pasa a la siguiente semana
  deudaRestante: number; // deuda total de la tarjeta si todo lo abonado fuera a capital
  liquidado: boolean;
}

export interface PlanResult {
  cuts: CutRow[];
  weeks: WeekRow[];
  liquidacion: WeekRow | null;
  ultimoVencimientoMSI: ISODate | null;
  remanenteFinal: number;
  deudaInicial: number;
}

export function defaultPlan(card: Card): PlanConfig {
  const st = latestStatement(card);
  const inicio = st ? mondayOnOrAfter(addDays(st.fechaCorte, 1)) : mondayOnOrAfter(new Date().toISOString().slice(0, 10));
  return { cardId: card.id, inicio, semanal: [{ desde: inicio, monto: 0 }], extras: [], comprasEstimadas: 0 };
}

function montoBase(plan: PlanConfig, lunes: ISODate): number {
  let monto = 0;
  let desde = "";
  for (const s of plan.semanal) {
    if (s.desde <= lunes && s.desde >= desde) {
      monto = s.monto;
      desde = s.desde;
    }
  }
  return monto;
}

/**
 * Plan semana a semana. Reglas:
 *  - Cada lunes se abona el monto del plan (más abonos extra de esa semana).
 *  - En semanas ya terminadas, si registraste pagos reales a la tarjeta, se usa lo real.
 *  - Lo abonado se acumula como saldo a favor y, en la semana de cada fecha límite, se descuenta el pago del corte.
 *  - La deuda restante supone que todo lo abonado se aplica a reducir el capital (hay que pedírselo al banco).
 */
export function buildPlan(plan: PlanConfig, card: Card, msis: Msi[], payments: Payment[], today: ISODate): PlanResult {
  const st = latestStatement(card);
  if (!st) return { cuts: [], weeks: [], liquidacion: null, ultimoVencimientoMSI: null, remanenteFinal: 0, deudaInicial: 0 };
  const cuts = projectCuts(card, msis, plan.comprasEstimadas);
  const ultimaLimite = cuts.length ? cuts[cuts.length - 1].limite : addDays(plan.inicio, 360);
  const nSemanas = Math.min(Math.max(Math.ceil(daysBetween(plan.inicio, ultimaLimite) / 7) + 1, 4), 156);

  const reales = payments.filter((p) => p.destino === "card" && p.targetId === card.id);
  const weeks: WeekRow[] = [];
  let remanente = 0;
  let acumulado = 0;
  let liquidacion: WeekRow | null = null;

  for (let i = 0; i < nSemanas; i++) {
    const lunes = addDays(plan.inicio, i * 7);
    const domingo = addDays(lunes, 6);
    const extras = plan.extras.filter((e) => e.fecha >= lunes && e.fecha <= domingo).reduce((s, e) => s + e.monto, 0);
    const abonoPlan = round2(montoBase(plan, lunes) + extras);
    const abonoReal = round2(reales.filter((p) => p.fecha >= lunes && p.fecha <= domingo).reduce((s, p) => s + p.monto, 0));
    const pasada = domingo < today;
    let abono = abonoPlan;
    let fuente: WeekRow["fuente"] = "plan";
    if (pasada && abonoReal > 0) {
      abono = abonoReal;
      fuente = "real";
    } else if (!pasada && abonoReal > abonoPlan) {
      abono = abonoReal;
      fuente = "real";
    }
    const vence = round2(cuts.filter((c) => c.limite >= lunes && c.limite <= domingo).reduce((s, c) => s + c.total, 0));
    const disponible = round2(abono + remanente);
    const pendiente = round2(Math.max(0, vence - disponible));
    remanente = round2(Math.max(0, disponible - vence));
    acumulado = round2(acumulado + abono);
    const deudaRestante = round2(st.saldoTotal - acumulado);
    const row: WeekRow = {
      n: i + 1, lunes, domingo, abonoPlan, abonoReal, abono, fuente, vence, disponible, pendiente, remanente,
      deudaRestante, liquidado: deudaRestante <= 0,
    };
    if (!liquidacion && row.liquidado) liquidacion = row;
    weeks.push(row);
  }

  const conMsi = cuts.filter((c, idx) => idx > 0 && c.msiTotal > 0);
  return {
    cuts,
    weeks,
    liquidacion,
    ultimoVencimientoMSI: conMsi.length ? conMsi[conMsi.length - 1].limite : null,
    remanenteFinal: remanente,
    deudaInicial: st.saldoTotal,
  };
}
