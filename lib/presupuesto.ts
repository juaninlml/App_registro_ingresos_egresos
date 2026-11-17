import { esIngresoFijo, type FijoDelMes } from "./fijos";
import { round2 } from "./money";
import { PAGO_TARJETA, type Transaction } from "./types";

/**
 * Gasto de cada categoría en un mes: lo registrado más los gastos fijos que aún faltan por pagar.
 * Los pagos de tarjeta no cuentan: lo que se consumió ya se contó al registrar cada compra.
 */
export function gastadoPorCategoria(txMes: Transaction[], fijos: FijoDelMes[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txMes) {
    if (t.tipo !== "gasto" || t.categoria === PAGO_TARJETA) continue;
    out[t.categoria] = round2((out[t.categoria] ?? 0) + t.monto);
  }
  for (const x of fijos) {
    if (esIngresoFijo(x) || x.estado === "pagado") continue;
    out[x.fijo.categoria] = round2((out[x.fijo.categoria] ?? 0) + x.fijo.monto);
  }
  return out;
}

export type Nivel = "ok" | "warn" | "danger";

/** Qué tanto del tope llevas: verde hasta 80 %, ámbar hasta 100 %, rojo si te pasaste. */
export function nivelPresupuesto(gastado: number, tope: number): { pct: number; nivel: Nivel; restante: number } {
  const pct = tope > 0 ? gastado / tope : gastado > 0 ? Infinity : 0;
  return { pct, nivel: pct > 1 ? "danger" : pct >= 0.8 ? "warn" : "ok", restante: round2(tope - gastado) };
}

/** Lo que queda para gastos variables este mes sin tocar la meta de ahorro. */
export function libreParaGastar(ingresosMes: number, egresosMes: number, metaAhorro = 0): number {
  return round2(ingresosMes - egresosMes - metaAhorro);
}
