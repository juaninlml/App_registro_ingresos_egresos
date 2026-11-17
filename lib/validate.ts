import { isISO } from "./dates";
import type { DBKey } from "./types";

type Field = "str" | "num" | "date" | "int" | "str?" | "num?" | "date?" | "int?";
type Shape = Record<string, Field>;

const MAX_STR = 300;
const MAX_ITEMS = 5000;

function ok(v: unknown, f: Field): boolean {
  const optional = f.endsWith("?");
  const t = optional ? (f.slice(0, -1) as "str" | "num" | "date" | "int") : (f as "str" | "num" | "date" | "int");
  if (v === undefined || v === null) return optional;
  switch (t) {
    case "str":
      return typeof v === "string" && v.length <= MAX_STR;
    case "num":
      return typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e12;
    case "int":
      return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 100000;
    case "date":
      return isISO(v);
  }
}

function shape(o: unknown, s: Shape): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const rec = o as Record<string, unknown>;
  return Object.entries(s).every(([k, f]) => ok(rec[k], f));
}

const STATEMENT: Shape = { fechaCorte: "date", fechaLimite: "date", saldoTotal: "num", pagoNoIntereses: "num", pagoMinimo: "num?" };
const CARD: Shape = { id: "str", banco: "str", nombre: "str", terminacion: "str?", limite: "num?", diaCorte: "int", notas: "str?", color: "str?" };
const MSI: Shape = {
  id: "str", cardId: "str", descripcion: "str", fechaOperacion: "date", montoOriginal: "num",
  pagoMensual: "num", totalPagos: "int", primerCorte: "date", terminacionTarjeta: "str?",
};
const LOAN: Shape = {
  id: "str", nombre: "str", banco: "str", montoOriginal: "num", tasaAnual: "num", plazoMeses: "int",
  primerPago: "date", pagoMensual: "num?", ivaPct: "num?", pagosHechos: "int", notas: "str?",
};
const PAYMENT: Shape = { id: "str", fecha: "date", monto: "num", targetId: "str", nota: "str?", txId: "str?", loanPago: "int?" };
const TX: Shape = { id: "str", fecha: "date", monto: "num", categoria: "str", nota: "str?", metodo: "str?", hora: "str?", tarjetaId: "str?", fijoId: "str?", destinoId: "str?" };
const FIJO: Shape = { id: "str", nombre: "str", monto: "num", dia: "int", categoria: "str", metodo: "str?" };

function list(v: unknown, s: Shape, extra?: (o: Record<string, unknown>) => boolean): boolean {
  return (
    Array.isArray(v) &&
    v.length <= MAX_ITEMS &&
    v.every((o) => shape(o, s) && (extra ? extra(o as Record<string, unknown>) : true))
  );
}

const strList = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 60);

export function validateValue(key: DBKey | `tx:${string}`, v: unknown): boolean {
  if (key.startsWith("tx:")) {
    const month = key.slice(3);
    return list(
      v,
      TX,
      (o) =>
        (o.tipo === "ingreso" || o.tipo === "gasto" || (o.tipo === "transferencia" && (o.metodo ?? "") !== (o.destinoId ?? ""))) &&
        String(o.fecha).startsWith(month),
    );
  }
  switch (key as DBKey) {
    case "cards":
      return list(
        v,
        CARD,
        (o) =>
          (o.tipo === undefined || o.tipo === "credito" || o.tipo === "debito") &&
          (o.saldo === undefined || (shape(o.saldo, { monto: "num", fecha: "date", hora: "str" }) && /^\d{2}:\d{2}$/.test(String((o.saldo as Record<string, unknown>).hora)))) &&
          Array.isArray(o.statements) && o.statements.length <= 240 && o.statements.every((s) => shape(s, STATEMENT)),
      );
    case "msi":
      return list(v, MSI);
    case "loans":
      return list(v, LOAN);
    case "payments":
      return list(v, PAYMENT, (o) => o.destino === "card" || o.destino === "loan");
    case "plan": {
      if (v === null) return true;
      if (!shape(v, { cardId: "str", inicio: "date" })) return false;
      const p = v as Record<string, unknown>;
      return (
        ok(p.comprasEstimadas, "num") &&
        Array.isArray(p.semanal) && p.semanal.length <= 200 && p.semanal.every((s) => shape(s, { desde: "date", monto: "num" })) &&
        Array.isArray(p.extras) && p.extras.length <= 500 && p.extras.every((s) => shape(s, { fecha: "date", monto: "num", nota: "str?" }))
      );
    }
    case "fijos":
      return list(v, FIJO, (o) => (o.tipo === undefined || o.tipo === "gasto" || o.tipo === "ingreso") && (o.dia as number) >= 1 && (o.dia as number) <= 31 && (o.monto as number) > 0 && (o.desde === undefined || (typeof o.desde === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.desde))));
    case "settings": {
      const s = v as Record<string, unknown> | null;
      const numMap = (m: unknown) =>
        m === undefined || (!!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length <= 100 &&
          Object.entries(m).every(([k, x]) => k.length <= 60 && typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1e10));
      const notas = (m: unknown) =>
        m === undefined || (!!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length <= 240 &&
          Object.entries(m).every(([k, x]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && typeof x === "string" && x.length <= 2000));
      return (
        !!s && typeof s === "object" && strList(s.categoriasGasto) && strList(s.categoriasIngreso) &&
        numMap(s.presupuestos) && (s.metaAhorro === undefined || (typeof s.metaAhorro === "number" && s.metaAhorro >= 0 && s.metaAhorro < 1e10)) &&
        notas(s.notasMes)
      );
    }
  }
}

export const TX_KEY = /^tx:\d{4}-(0[1-9]|1[0-2])$/;
