import { addMonthKey, monthKey } from "./dates";
import { round2 } from "./money";
import type { Card, ISODate, Transaction } from "./types";

/** Tarjetas de débito: dinero propio con saldo. Las que no dicen tipo son de crédito (las de siempre). */
export const esDebito = (c: Pick<Card, "tipo"> | undefined) => c?.tipo === "debito";
export const esCredito = (c: Pick<Card, "tipo"> | undefined) => !!c && c.tipo !== "debito";
export const debitos = (cards: Card[]) => cards.filter(esDebito);
export const creditos = (cards: Card[]) => cards.filter(esCredito);

/** Meses ("YYYY-MM") desde el saldo capturado más antiguo hasta hoy: los que hay que leer para calcular saldos. */
export function mesesDesde(cards: Card[], today: ISODate): string[] {
  const hoy = monthKey(today);
  const fechas = debitos(cards).map((c) => c.saldo?.fecha).filter((f): f is string => !!f).sort();
  const inicio = fechas.length ? monthKey(fechas[0]) : hoy;
  const out: string[] = [];
  for (let m = inicio; m <= hoy && out.length < 36; m = addMonthKey(m, 1)) out.push(m);
  return out.length ? out : [hoy];
}

/** ¿El movimiento ocurrió después de capturar el saldo? (mismo día: por hora de registro) */
function despuesDe(t: Transaction, s: NonNullable<Card["saldo"]>): boolean {
  if (t.fecha !== s.fecha) return t.fecha > s.fecha;
  return (t.hora ?? "00:00") > s.hora;
}

/** Movimientos de una tarjeta de débito que cuentan para su saldo (después del ajuste y hasta hoy). */
export function movimientosCuenta(card: Card, txs: Transaction[], today: ISODate): Transaction[] {
  const s = card.saldo;
  if (!s) return [];
  return txs.filter((t) => t.metodo === card.id && t.fecha <= today && despuesDe(t, s));
}

/**
 * Dinero disponible hoy en una tarjeta de débito: su saldo capturado, más los ingresos que entraron
 * a ella y menos los gastos y pagos de tarjeta que salieron de ella desde ese momento.
 */
export function disponibleCuenta(card: Card, txs: Transaction[], today: ISODate): number {
  if (!card.saldo) return 0;
  let total = card.saldo.monto;
  for (const t of movimientosCuenta(card, txs, today)) total += t.tipo === "ingreso" ? t.monto : -t.monto;
  return round2(total);
}
