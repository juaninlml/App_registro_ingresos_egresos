import { round2 } from "./money";
import { esCredito } from "./cuentas";
import type { Card, GastoFijo, ISODate, Transaction } from "./types";

/** Fecha del gasto fijo en un mes ("YYYY-MM"); si el mes no tiene ese día, el último día del mes. */
export function fechaFijo(f: GastoFijo, month: string): ISODate {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(f.dia, last)).padStart(2, "0")}`;
}

/** ¿El gasto fijo aplica en ese mes? */
export const aplica = (f: GastoFijo, month: string) => !f.desde || f.desde <= month;

export type EstadoFijo = "pagado" | "vencido" | "hoy" | "proximo";

export interface FijoDelMes {
  fijo: GastoFijo;
  fecha: ISODate;
  estado: EstadoFijo;
  pago: Transaction | null; // el movimiento que lo pagó, si existe
  credito: boolean; // se paga con tarjeta de crédito (no sale de tu dinero)
}

/** Gastos fijos de un mes con su estado, según los movimientos registrados de ese mes. */
export function fijosDelMes(fijos: GastoFijo[], txMes: Transaction[], month: string, today: ISODate, cards: Card[]): FijoDelMes[] {
  return fijos
    .filter((f) => aplica(f, month))
    .map((fijo) => {
      const fecha = fechaFijo(fijo, month);
      const pago = txMes.find((t) => t.fijoId === fijo.id) ?? null;
      const estado: EstadoFijo = pago ? "pagado" : fecha < today ? "vencido" : fecha === today ? "hoy" : "proximo";
      return { fijo, fecha, estado, pago, credito: esCredito(cards.find((c) => c.id === fijo.metodo)) };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Total por pagar de los fijos de un mes (opcionalmente solo los que salen de tu dinero: débito o efectivo). */
export function porPagar(lista: FijoDelMes[], soloDebito = false): number {
  return round2(lista.filter((x) => x.estado !== "pagado" && (!soloDebito || !x.credito)).reduce((s, x) => s + x.fijo.monto, 0));
}
