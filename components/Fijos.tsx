"use client";
import { useState } from "react";
import { CuentaSelect } from "@/components/Cuentas";
import { useData } from "@/components/DataProvider";
import { IconCheck, IconMas, IconTarjeta } from "@/components/icons";
import { useToast } from "@/components/motion";
import { Badge, Btn, Field, Input, Modal, NumInput, Select, Skeleton, cx } from "@/components/ui";
import { ahoraHM, daysBetween, fdate, fmonth, monthKey } from "@/lib/dates";
import { esDebito } from "@/lib/cuentas";
import { fechaFijo, porPagar, type FijoDelMes } from "@/lib/fijos";
import { mxn, uid } from "@/lib/money";
import { PAGO_TARJETA, type GastoFijo, type Transaction } from "@/lib/types";

/* ----------------------------------- Gastos fijos ----------------------------------- */

const ESTADO: Record<FijoDelMes["estado"], { tone: "ok" | "danger" | "warn" | "muted"; texto: (d: number) => string }> = {
  pagado: { tone: "ok", texto: () => "Pagado" },
  vencido: { tone: "danger", texto: (d) => `Venció hace ${d} d` },
  hoy: { tone: "warn", texto: () => "Hoy" },
  proximo: { tone: "muted", texto: (d) => `En ${d} d` },
};

/** Crea el movimiento que paga un gasto fijo de un mes. */
export function movimientoDeFijo(f: GastoFijo, month: string, today: string): Transaction {
  // en el mes actual se registra hoy (cuando realmente sale el dinero); en otros meses, en su fecha
  const fecha = month === monthKey(today) ? today : fechaFijo(f, month);
  return { id: uid(), fecha, hora: ahoraHM(), tipo: "gasto", monto: f.monto, categoria: f.categoria, nota: f.nombre, metodo: f.metodo, fijoId: f.id };
}

/** Lista de gastos fijos de un mes con su estado y el botón para marcarlos como pagados. */
export function FijosLista({ month, lista, onPagar, compacto }: { month: string; lista: FijoDelMes[] | null; onPagar: (x: FijoDelMes) => Promise<void>; compacto?: boolean }) {
  const { db, today } = useData();
  const [edit, setEdit] = useState<GastoFijo | "nuevo" | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const nombreTarjeta = (id?: string) => {
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };
  const pagados = lista?.filter((x) => x.estado === "pagado").length ?? 0;
  const faltan = lista ? porPagar(lista) : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Gastos fijos · {fmonth(month)}</h2>
          {lista && lista.length > 0 && (
            <p className="text-xs text-muted">{pagados} de {lista.length} pagados{faltan > 0 ? <> · faltan <span className="num font-semibold text-fg">{mxn(faltan)}</span></> : " · todo al corriente"}</p>
          )}
        </div>
        <Btn small onClick={() => setEdit("nuevo")}><IconMas size={16} />Gasto fijo</Btn>
      </div>

      {!lista ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : !lista.length ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
          Agrega lo que pagas cada mes (renta, suscripciones, gimnasio…). Cuentan en tus gastos del mes desde el día 1 y te avisan cuándo vencen.
          <div className="mt-3"><Btn small variant="primary" onClick={() => setEdit("nuevo")}><IconMas size={16} />Agregar el primero</Btn></div>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-surface">
          {lista.map((x) => {
            const e = ESTADO[x.estado];
            const dias = Math.abs(daysBetween(today, x.fecha));
            const pagado = x.estado === "pagado";
            return (
              <li key={x.fijo.id} className={cx("flex items-center gap-3 px-3 py-2.5 sm:px-4", pagado && "bg-surface-2/40")}>
                <button type="button" onClick={() => setEdit(x.fijo)} className="press min-w-0 flex-1 rounded-lg text-left" aria-label={`Editar ${x.fijo.nombre}`}>
                  <span className={cx("block truncate text-sm font-semibold", pagado && "text-muted line-through decoration-muted/60")}>{x.fijo.nombre}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted">
                    Día {x.fijo.dia} · {x.fijo.categoria}
                    {x.fijo.metodo && <><span aria-hidden>·</span><IconTarjeta size={13} className="shrink-0" /><span className="truncate">{nombreTarjeta(x.fijo.metodo)}</span></>}
                  </span>
                </button>
                <div className="shrink-0 text-right">
                  <div className={cx("num text-sm font-semibold", pagado && "text-muted")}>−{mxn(x.fijo.monto)}</div>
                  {!compacto || !pagado ? <Badge tone={e.tone}>{e.texto(dias)}</Badge> : null}
                </div>
                {pagado ? (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok-soft text-ok" title={x.pago ? `Pagado el ${fdate(x.pago.fecha)}` : "Pagado"}><IconCheck size={18} /></span>
                ) : (
                  <Btn
                    small
                    variant={x.estado === "vencido" || x.estado === "hoy" ? "primary" : "soft"}
                    disabled={pagando === x.fijo.id}
                    onClick={async () => {
                      setPagando(x.fijo.id);
                      await onPagar(x);
                      setPagando(null);
                    }}
                    className="min-w-20"
                  >
                    {pagando === x.fijo.id ? "…" : "Pagar"}
                  </Btn>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FijoModal edit={edit} onClose={() => setEdit(null)} month={month} />
    </div>
  );
}

function FijoModal({ edit, onClose, month }: { edit: GastoFijo | "nuevo" | null; onClose: () => void; month: string }) {
  const titulo = edit === "nuevo" ? "Nuevo gasto fijo" : "Editar gasto fijo";
  return (
    <Modal open={edit !== null} onClose={onClose} title={titulo}>
      {edit !== null && <FijoForm key={edit === "nuevo" ? "nuevo" : edit.id} fijo={edit === "nuevo" ? null : edit} onDone={onClose} month={month} />}
    </Modal>
  );
}

function FijoForm({ fijo, onDone, month }: { fijo: GastoFijo | null; onDone: () => void; month: string }) {
  const { db, save } = useData();
  const toast = useToast();
  const cats = db.settings.categoriasGasto.filter((c) => c !== PAGO_TARJETA);
  const [f, setF] = useState({
    nombre: fijo?.nombre ?? "",
    monto: (fijo?.monto ?? "") as number | "",
    dia: (fijo?.dia ?? "") as number | "",
    categoria: fijo?.categoria ?? cats[0] ?? "Otros",
    metodo: fijo?.metodo ?? db.cards.find(esDebito)?.id ?? "",
    desde: fijo?.desde ?? month,
  });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const nuevo: GastoFijo = {
      id: fijo?.id ?? uid(),
      nombre: f.nombre.trim(),
      monto: Number(f.monto),
      dia: Math.min(31, Math.max(1, Math.round(Number(f.dia)))),
      categoria: f.categoria,
      metodo: f.metodo || undefined,
      desde: f.desde || undefined,
    };
    const next = fijo ? db.fijos.map((x) => (x.id === fijo.id ? nuevo : x)) : [...db.fijos, nuevo];
    if (await save("fijos", next)) {
      onDone();
      toast({ tone: "accent", title: fijo ? "Gasto fijo actualizado" : "Gasto fijo agregado", detail: `${nuevo.nombre} · ${mxn(nuevo.monto)} cada día ${nuevo.dia}` });
    }
  }

  async function borrar() {
    if (!fijo || !confirm(`¿Quitar «${fijo.nombre}» de tus gastos fijos? Los pagos que ya registraste se conservan.`)) return;
    if (await save("fijos", db.fijos.filter((x) => x.id !== fijo.id))) {
      onDone();
      toast({ tone: "muted", title: "Gasto fijo quitado", detail: fijo.nombre });
    }
  }

  return (
    <form onSubmit={guardar} className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={60} placeholder="Renta, Netflix, gimnasio…" autoFocus /></Field></div>
      <Field label="Monto mensual"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field>
      <Field label="Día del mes" hint="Si el mes es más corto, el último día"><NumInput value={f.dia} onChange={(n) => setF({ ...f, dia: n })} min={1} max={31} step={1} required /></Field>
      <div className="col-span-2"><Field label="Categoría"><Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
      <div className="col-span-2">
        <Field label="Se paga con" hint={!f.metodo ? "En efectivo: no se descuenta de ninguna tarjeta." : esDebito(db.cards.find((c) => c.id === f.metodo)) ? "Se descuenta del saldo de esa tarjeta de débito." : "Con crédito no sale de tu dinero; se suma a la deuda de la tarjeta."}>
          <CuentaSelect value={f.metodo} onChange={(v) => setF({ ...f, metodo: v })} />
        </Field>
      </div>
      <div className="col-span-2"><Field label="A partir de"><Input type="month" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Field></div>
      <div className="col-span-2 flex gap-2">
        {fijo && <Btn variant="danger" onClick={() => void borrar()}>Quitar</Btn>}
        <Btn variant="primary" type="submit" className="flex-1">{fijo ? "Guardar cambios" : "Agregar gasto fijo"}</Btn>
      </div>
    </form>
  );
}
