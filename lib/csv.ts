import type { Card, Transaction } from "./types";

/** Escapa un valor para CSV (comillas si trae coma, comillas o salto de línea). */
function celda(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Movimientos en CSV para Excel: una fila por movimiento, ordenados por fecha. El monto lleva signo
 * (− gasto, + ingreso, sin signo en transferencias). Empieza con BOM para que Excel lea bien los acentos.
 */
export function movimientosCSV(txs: Transaction[], cards: Card[]): string {
  const nombre = (id?: string) => {
    if (!id) return "Efectivo";
    const c = cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "Tarjeta borrada";
  };
  const filas = [...txs]
    .sort((a, b) => `${a.fecha}${a.hora ?? ""}`.localeCompare(`${b.fecha}${b.hora ?? ""}`))
    .map((t) => [
      t.fecha,
      t.hora ?? "",
      t.tipo === "ingreso" ? "Ingreso" : t.tipo === "gasto" ? "Gasto" : "Transferencia",
      t.categoria,
      (t.tipo === "gasto" ? -t.monto : t.monto).toFixed(2),
      nombre(t.metodo),
      t.tipo === "transferencia" ? nombre(t.destinoId) : "",
      t.tarjetaId ? nombre(t.tarjetaId) : "",
      t.nota ?? "",
    ].map(celda).join(","));
  const encabezado = ["Fecha", "Hora", "Tipo", "Categoría", "Monto", "Cuenta", "Destino", "Tarjeta pagada", "Nota"].join(",");
  return "﻿" + [encabezado, ...filas].join("\r\n");
}
