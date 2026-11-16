import { addMonths } from "./dates";
import { round2 } from "./money";
import type { ISODate, Loan } from "./types";

export interface LoanRow {
  n: number;
  fecha: ISODate;
  pago: number;
  interes: number;
  iva: number;
  capital: number;
  saldo: number;
  pagado: boolean;
}

/** Pago mensual nivelado (sistema francés). Si hay IVA sobre intereses, se incluye en la tasa efectiva. */
export function pagoCalculado(loan: Loan): number {
  const r = loan.tasaAnual / 100 / 12;
  const iva = (loan.ivaPct ?? 0) / 100;
  const n = loan.plazoMeses;
  if (n <= 0) return 0;
  if (r === 0) return round2(loan.montoOriginal / n);
  const re = r * (1 + iva);
  return round2((loan.montoOriginal * re) / (1 - Math.pow(1 + re, -n)));
}

export function loanSchedule(loan: Loan): LoanRow[] {
  const r = loan.tasaAnual / 100 / 12;
  const ivaRate = (loan.ivaPct ?? 0) / 100;
  const P = loan.pagoMensual && loan.pagoMensual > 0 ? loan.pagoMensual : pagoCalculado(loan);
  const rows: LoanRow[] = [];
  let saldo = loan.montoOriginal;
  for (let n = 1; n <= loan.plazoMeses && saldo > 0.005; n++) {
    const interes = round2(saldo * r);
    const iva = round2(interes * ivaRate);
    let capital = round2(P - interes - iva);
    if (n === loan.plazoMeses || capital > saldo) capital = round2(saldo);
    const pago = round2(capital + interes + iva);
    saldo = round2(saldo - capital);
    rows.push({ n, fecha: addMonths(loan.primerPago, n - 1), pago, interes, iva, capital, saldo, pagado: n <= loan.pagosHechos });
  }
  return rows;
}

export interface LoanSummary {
  pago: number;
  saldo: number;
  proximo: LoanRow | null;
  fechaTermino: ISODate | null;
  interesTotal: number;
}

export function loanSummary(loan: Loan): LoanSummary {
  const rows = loanSchedule(loan);
  const hechos = rows.filter((r) => r.pagado);
  const proximo = rows.find((r) => !r.pagado) ?? null;
  return {
    pago: loan.pagoMensual && loan.pagoMensual > 0 ? loan.pagoMensual : pagoCalculado(loan),
    saldo: hechos.length ? hechos[hechos.length - 1].saldo : loan.montoOriginal,
    proximo,
    fechaTermino: rows.length ? rows[rows.length - 1].fecha : null,
    interesTotal: round2(rows.reduce((s, r) => s + r.interes + r.iva, 0)),
  };
}
