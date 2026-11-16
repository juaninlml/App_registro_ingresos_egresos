import { addMonths, isISO } from "./dates";
import { round2 } from "./money";
import type { ISODate } from "./types";

/** Cargo a meses tal como aparece en el estado de cuenta. */
export interface ParsedMsi {
  descripcion: string;
  fechaOperacion: ISODate;
  montoOriginal: number;
  saldoPendiente: number | null;
  pagoRequerido: number;
  pagoActual: number; // "Núm. de pago": 4 en "04 DE 12"
  totalPagos: number;
  terminacionTarjeta: string | null; // últimos 4 de la tarjeta titular/adicional
  primerCorte: ISODate; // calculado: corte - (pagoActual - 1) meses
}

export interface ParsedStatement {
  banco: string | null;
  nombreTarjeta: string | null;
  terminacion: string | null;
  fechaCorte: ISODate;
  fechaLimite: ISODate;
  saldoTotal: number;
  pagoNoIntereses: number;
  pagoMinimo: number | null;
  limiteCredito: number | null;
  msi: ParsedMsi[];
  advertencias: string[];
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return round2(v);
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n) && v.trim() !== "") return round2(n);
  }
  return null;
};
const str = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const last4 = (v: unknown): string | null => {
  const d = typeof v === "string" ? v.replace(/\D/g, "") : "";
  return d.length >= 4 ? d.slice(-4) : null; // nunca se conserva el número completo
};

/** Valida y normaliza la respuesta del modelo. Lanza si falta lo esencial. */
export function normalizeStatement(raw: unknown): ParsedStatement {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fechaCorte = r.fechaCorte;
  const fechaLimite = r.fechaLimite;
  const saldoTotal = num(r.saldoTotal);
  const pagoNoIntereses = num(r.pagoNoIntereses);
  if (!isISO(fechaCorte) || !isISO(fechaLimite) || saldoTotal === null || pagoNoIntereses === null) {
    throw new Error("No pude identificar la fecha de corte, la fecha límite o los montos del estado de cuenta.");
  }
  const advertencias = Array.isArray(r.advertencias) ? [...new Set(r.advertencias.filter((x): x is string => typeof x === "string"))].slice(0, 20) : [];

  const msi: ParsedMsi[] = [];
  for (const m of Array.isArray(r.msi) ? r.msi.slice(0, 80) : []) {
    const o = (m ?? {}) as Record<string, unknown>;
    const montoOriginal = num(o.montoOriginal);
    const pagoRequerido = num(o.pagoRequerido);
    const pagoActual = num(o.pagoActual);
    const totalPagos = num(o.totalPagos);
    if (!isISO(o.fechaOperacion) || montoOriginal === null || pagoRequerido === null || pagoActual === null || totalPagos === null) {
      advertencias.push(`Se omitió un cargo a meses con datos incompletos (${str(o.descripcion, 40) ?? "sin descripción"}).`);
      continue;
    }
    if (pagoActual < 1 || totalPagos < 1 || pagoActual > totalPagos) {
      advertencias.push(`El número de pago de "${str(o.descripcion, 40)}" no es válido (${pagoActual} de ${totalPagos}).`);
      continue;
    }
    msi.push({
      descripcion: str(o.descripcion) ?? "Cargo a meses",
      fechaOperacion: o.fechaOperacion,
      montoOriginal,
      saldoPendiente: num(o.saldoPendiente),
      pagoRequerido,
      pagoActual: Math.round(pagoActual),
      totalPagos: Math.round(totalPagos),
      terminacionTarjeta: last4(o.terminacionTarjeta),
      primerCorte: addMonths(fechaCorte, -(Math.round(pagoActual) - 1)),
    });
  }

  return {
    banco: str(r.banco, 40),
    nombreTarjeta: str(r.nombreTarjeta, 40),
    terminacion: last4(r.terminacion),
    fechaCorte,
    fechaLimite,
    saldoTotal,
    pagoNoIntereses,
    pagoMinimo: num(r.pagoMinimo),
    limiteCredito: num(r.limiteCredito),
    msi,
    advertencias,
  };
}
