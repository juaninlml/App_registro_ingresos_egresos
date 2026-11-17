"use client";
import { useState } from "react";
import { useData, useTxMonths } from "@/components/DataProvider";
import { IconBuscar } from "@/components/icons";
import { Field, Input, Modal, Select, Skeleton, cx } from "@/components/ui";
import { addMonthKey, fhora, fshort, monthKey } from "@/lib/dates";
import { mxn, round2 } from "@/lib/money";
import { PAGO_TARJETA, TRANSFERENCIA, type Transaction } from "@/lib/types";

/** Quita acentos y mayúsculas para buscar «cafe» y encontrar «Café». */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface Filtros {
  texto: string;
  categoria: string; // "" = todas
  cuenta: string; // "" = todas, "efectivo" = sin tarjeta, o id de tarjeta
  tipo: "" | Transaction["tipo"];
}

/** ¿El movimiento cumple los filtros? (la cuenta coincide con origen o destino) */
export function coincide(t: Transaction, f: Filtros, nombreCuenta: (id?: string) => string): boolean {
  if (f.tipo && t.tipo !== f.tipo) return false;
  if (f.categoria && t.categoria !== f.categoria) return false;
  if (f.cuenta === "efectivo") {
    // en efectivo: sin tarjeta, o una transferencia que sale o llega a efectivo
    const conEfectivo = t.tipo === "transferencia" ? !t.metodo || !t.destinoId : !t.metodo;
    if (!conEfectivo) return false;
  } else if (f.cuenta && t.metodo !== f.cuenta && t.destinoId !== f.cuenta && t.tarjetaId !== f.cuenta) {
    return false;
  }
  if (f.texto.trim()) {
    const q = plano(f.texto.trim());
    const donde = plano([t.categoria, t.nota, nombreCuenta(t.metodo), t.destinoId ? nombreCuenta(t.destinoId) : "", t.tarjetaId ? nombreCuenta(t.tarjetaId) : "", String(t.monto)].filter(Boolean).join(" "));
    if (!q.split(/\s+/).every((p) => donde.includes(p))) return false;
  }
  return true;
}

/** Buscador de movimientos de los últimos meses; al tocar un resultado se abre para editarlo. */
export function BuscarModal({ open, onClose, onElegir }: { open: boolean; onClose: () => void; onElegir: (t: Transaction) => void }) {
  const { db, today } = useData();
  const [f, setF] = useState<Filtros>({ texto: "", categoria: "", cuenta: "", tipo: "" });
  const [meses, setMeses] = useState(6);
  const lista = Array.from({ length: meses }, (_, i) => addMonthKey(monthKey(today), -i));
  const txs = useTxMonths(open ? lista : []);
  const nombreCuenta = (id?: string) => {
    if (!id) return "Efectivo";
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };
  const cats = [...new Set([...db.settings.categoriasGasto, PAGO_TARJETA, ...db.settings.categoriasIngreso, TRANSFERENCIA])];
  const filtrando = !!(f.texto.trim() || f.categoria || f.cuenta || f.tipo);
  const resultados = txs && filtrando
    ? lista.flatMap((m) => txs[m] ?? []).filter((t) => coincide(t, f, nombreCuenta)).sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`))
    : [];
  const ing = round2(resultados.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0));
  const gas = round2(resultados.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0));

  return (
    <Modal open={open} onClose={onClose} title="Buscar movimientos">
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Buscar</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Nota, categoría, tarjeta o monto" autoFocus className="pl-9" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Filtros["tipo"] })}>
              <option value="">Todos</option><option value="gasto">Gastos</option><option value="ingreso">Ingresos</option><option value="transferencia">Transferencias</option>
            </Select>
          </Field>
          <Field label="Periodo">
            <Select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              <option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option><option value={12}>Último año</option>
            </Select>
          </Field>
          <Field label="Categoría">
            <Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              <option value="">Todas</option>{cats.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Cuenta">
            <Select value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })}>
              <option value="">Todas</option><option value="efectivo">Efectivo</option>
              {db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}</option>)}
            </Select>
          </Field>
        </div>

        {!filtrando ? (
          <p className="py-4 text-center text-sm text-muted">Escribe algo o elige un filtro para buscar.</p>
        ) : !txs ? (
          <Skeleton className="h-32" />
        ) : !resultados.length ? (
          <p className="py-4 text-center text-sm text-muted">Sin resultados en este periodo.</p>
        ) : (
          <>
            <div className="num flex flex-wrap justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
              <span className="text-muted">{resultados.length} movimiento{resultados.length === 1 ? "" : "s"}</span>
              <span>{ing > 0 && <span className="text-ok">+{mxn(ing)} </span>}{gas > 0 && <span>−{mxn(gas)}</span>}</span>
            </div>
            <ul className="divide-y divide-border/60">
              {resultados.slice(0, 150).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onElegir(t)} className="press flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-surface-2/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.tipo === "transferencia" ? `${nombreCuenta(t.metodo)} → ${nombreCuenta(t.destinoId)}` : t.nota || t.categoria}</span>
                      <span className="block truncate text-xs text-muted">{[fshort(t.fecha), fhora(t.hora), t.nota ? t.categoria : null, t.tipo !== "transferencia" ? nombreCuenta(t.metodo) : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={cx("num shrink-0 text-sm font-semibold", t.tipo === "ingreso" ? "text-ok" : t.tipo === "transferencia" && "text-muted")}>
                      {t.tipo === "ingreso" ? "+" : t.tipo === "gasto" ? "−" : ""}{mxn(t.monto)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {resultados.length > 150 && <p className="text-center text-xs text-muted">Se muestran los 150 más recientes; afina la búsqueda para ver otros.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
