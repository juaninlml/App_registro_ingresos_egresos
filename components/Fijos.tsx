"use client";
import { useState } from "react";
import { CuentaSelect } from "@/components/Cuentas";
import { useData } from "@/components/DataProvider";
import { IconCheck, IconMas, IconTarjeta } from "@/components/icons";
import { Segmented, useToast } from "@/components/motion";
import { Badge, Btn, Field, Input, Modal, NumInput, Select, Skeleton, cx } from "@/components/ui";
import { ahoraHM, daysBetween, fdate, fmonth, monthKey } from "@/lib/dates";
import { esDebito } from "@/lib/cuentas";
import { esIngresoFijo, fechaFijo, porCobrar, porPagar, type FijoDelMes } from "@/lib/fijos";
import { mxn, uid } from "@/lib/money";
import { PAGO_TARJETA, type GastoFijo, type Transaction } from "@/lib/types";

/* ------------------------------ Gastos e ingresos fijos ------------------------------ */

function estado(x: FijoDelMes, dias: number): { tone: "ok" | "danger" | "warn" | "muted"; texto: string } {
  const ingreso = esIngresoFijo(x);
  switch (x.estado) {
    case "pagado":
      return { tone: "ok", texto: ingreso ? "Cobrado" : "Pagado" };
    case "vencido":
      return { tone: ingreso ? "warn" : "danger", texto: ingreso ? `Esperado hace ${dias} d` : `Venció hace ${dias} d` };
    case "hoy":
      return { tone: "warn", texto: "Hoy" };
    default:
      return { tone: "muted", texto: `En ${dias} d` };
  }
}

/** Crea el movimiento que paga (o cobra) un fijo de un mes. */
export function movimientoDeFijo(f: GastoFijo, month: string, today: string): Transaction {
  // en el mes actual se registra hoy (cuando realmente se mueve el dinero); en otros meses, en su fecha
  const fecha = month === monthKey(today) ? today : fechaFijo(f, month);
  return { id: uid(), fecha, hora: ahoraHM(), tipo: f.tipo === "ingreso" ? "ingreso" : "gasto", monto: f.monto, categoria: f.categoria, nota: f.nombre, metodo: f.metodo, fijoId: f.id };
}

/** Lista de gastos e ingresos fijos de un mes con su estado y el botón para registrarlos. */
export function FijosLista({ month, lista, onPagar, compacto }: { month: string; lista: FijoDelMes[] | null; onPagar: (x: FijoDelMes) => Promise<void>; compacto?: boolean }) {
  const { db, today } = useData();
  const [edit, setEdit] = useState<GastoFijo | "nuevo" | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const nombreTarjeta = (id?: string) => {
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };
  const hechos = lista?.filter((x) => x.estado === "pagado").length ?? 0;
  const faltan = lista ? porPagar(lista) : 0;
  const cobrar = lista ? porCobrar(lista) : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Fijos del mes · {fmonth(month)}</h2>
          {lista && lista.length > 0 && (
            <p className="text-xs text-muted">
              {hechos} de {lista.length} registrados
              {faltan > 0 && <> · faltan <span className="num font-semibold text-fg">{mxn(faltan)}</span> por pagar</>}
              {cobrar > 0 && <> · <span className="num font-semibold text-ok">{mxn(cobrar)}</span> por cobrar</>}
              {!faltan && !cobrar && " · todo al corriente"}
            </p>
          )}
        </div>
        <Btn small onClick={() => setEdit("nuevo")}><IconMas size={16} />Fijo</Btn>
      </div>

      {!lista ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : !lista.length ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
          Agrega lo que pagas cada mes (renta, suscripciones…) y lo que cobras (sueldo, quincena). Cuentan en el balance del mes desde el día 1.
          <div className="mt-3"><Btn small variant="primary" onClick={() => setEdit("nuevo")}><IconMas size={16} />Agregar el primero</Btn></div>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-surface">
          {lista.map((x) => {
            const dias = Math.abs(daysBetween(today, x.fecha));
            const e = estado(x, dias);
            const hecho = x.estado === "pagado";
            const ingreso = esIngresoFijo(x);
            return (
              <li key={x.fijo.id} className={cx("flex items-center gap-3 px-3 py-2.5 sm:px-4", hecho && "bg-surface-2/40")}>
                <button type="button" onClick={() => setEdit(x.fijo)} className="press min-w-0 flex-1 rounded-lg text-left" aria-label={`Editar ${x.fijo.nombre}`}>
                  <span className={cx("block truncate text-sm font-semibold", hecho && "text-muted line-through decoration-muted/60")}>{x.fijo.nombre}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted">
                    Día {x.fijo.dia} · {x.fijo.categoria}
                    {x.fijo.metodo && <><span aria-hidden>·</span><IconTarjeta size={13} className="shrink-0" /><span className="truncate">{nombreTarjeta(x.fijo.metodo)}</span></>}
                  </span>
                </button>
                <div className="shrink-0 text-right">
                  <div className={cx("num text-sm font-semibold", hecho ? "text-muted" : ingreso && "text-ok")}>{ingreso ? "+" : "−"}{mxn(x.fijo.monto)}</div>
                  {!compacto || !hecho ? <Badge tone={e.tone}>{e.texto}</Badge> : null}
                </div>
                {hecho ? (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok-soft text-ok" title={x.pago ? `${ingreso ? "Cobrado" : "Pagado"} el ${fdate(x.pago.fecha)}` : undefined}><IconCheck size={18} /></span>
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
                    {pagando === x.fijo.id ? "…" : ingreso ? "Cobrar" : "Pagar"}
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
  const titulo = edit === "nuevo" ? "Nuevo fijo" : edit?.tipo === "ingreso" ? "Editar ingreso fijo" : "Editar gasto fijo";
  return (
    <Modal open={edit !== null} onClose={onClose} title={titulo}>
      {edit !== null && <FijoForm key={edit === "nuevo" ? "nuevo" : edit.id} fijo={edit === "nuevo" ? null : edit} onDone={onClose} month={month} />}
    </Modal>
  );
}

function FijoForm({ fijo, onDone, month }: { fijo: GastoFijo | null; onDone: () => void; month: string }) {
  const { db, save } = useData();
  const toast = useToast();
  const [tipo, setTipo] = useState<"gasto" | "ingreso">(fijo?.tipo ?? "gasto");
  const cats = tipo === "ingreso" ? db.settings.categoriasIngreso : db.settings.categoriasGasto.filter((c) => c !== PAGO_TARJETA);
  const principal = db.cards.find(esDebito)?.id ?? "";
  const [f, setF] = useState({
    nombre: fijo?.nombre ?? "",
    monto: (fijo?.monto ?? "") as number | "",
    dia: (fijo?.dia ?? "") as number | "",
    categoria: fijo?.categoria ?? "",
    metodo: fijo?.metodo ?? principal,
    desde: fijo?.desde ?? month,
  });
  const categoria = cats.includes(f.categoria) ? f.categoria : cats[0] ?? "Otros";
  // un ingreso solo puede llegar a una cuenta de débito o en efectivo
  const metodo = tipo === "ingreso" && f.metodo && !esDebito(db.cards.find((c) => c.id === f.metodo)) ? principal : f.metodo;
  const nombreTipo = tipo === "ingreso" ? "Ingreso fijo" : "Gasto fijo";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const nuevo: GastoFijo = {
      id: fijo?.id ?? uid(),
      tipo: tipo === "ingreso" ? "ingreso" : undefined,
      nombre: f.nombre.trim(),
      monto: Number(f.monto),
      dia: Math.min(31, Math.max(1, Math.round(Number(f.dia)))),
      categoria,
      metodo: metodo || undefined,
      desde: f.desde || undefined,
    };
    const next = fijo ? db.fijos.map((x) => (x.id === fijo.id ? nuevo : x)) : [...db.fijos, nuevo];
    onDone();
    if (await save("fijos", next)) {
      toast({ tone: tipo === "ingreso" ? "ok" : "accent", title: `${nombreTipo} ${fijo ? "actualizado" : "agregado"}`, detail: `${nuevo.nombre} · ${mxn(nuevo.monto)} cada día ${nuevo.dia}` });
    }
  }

  async function borrar() {
    if (!fijo || !confirm(`¿Quitar «${fijo.nombre}» de tus fijos? Los movimientos que ya registraste se conservan.`)) return;
    onDone();
    if (await save("fijos", db.fijos.filter((x) => x.id !== fijo.id))) {
      toast({ tone: "muted", title: `${nombreTipo} quitado`, detail: fijo.nombre });
    }
  }

  return (
    <form onSubmit={guardar} className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Segmented label="Tipo de fijo" value={tipo} onChange={setTipo} tones={{ gasto: "danger", ingreso: "ok" }} options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]} />
      </div>
      <div className="col-span-2"><Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={60} placeholder={tipo === "ingreso" ? "Sueldo, quincena, renta que cobras…" : "Renta, Netflix, gimnasio…"} autoFocus /></Field></div>
      <Field label="Monto"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field>
      <Field label="Día del mes" hint="Si el mes es más corto, el último día"><NumInput value={f.dia} onChange={(n) => setF({ ...f, dia: n })} min={1} max={31} step={1} required /></Field>
      <div className="col-span-2"><Field label="Categoría"><Select value={categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
      <div className="col-span-2">
        <Field
          label={tipo === "ingreso" ? "Llega a" : "Se paga con"}
          hint={
            !metodo
              ? "En efectivo: no cambia el saldo de ninguna tarjeta."
              : esDebito(db.cards.find((c) => c.id === metodo))
                ? tipo === "ingreso" ? "Se suma al saldo de esa tarjeta de débito." : "Se descuenta del saldo de esa tarjeta de débito."
                : "Con crédito no sale de tu dinero; se suma a la deuda de la tarjeta."
          }
        >
          <CuentaSelect value={metodo} onChange={(v) => setF({ ...f, metodo: v })} solo={tipo === "ingreso" ? "debito" : undefined} />
        </Field>
      </div>
      <p className="col-span-2 -mt-1 text-xs text-muted">Si cobras cada quincena, agrega dos ingresos fijos (por ejemplo, días 15 y 30).</p>
      <div className="col-span-2"><Field label="A partir de"><Input type="month" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Field></div>
      <div className="col-span-2 flex gap-2">
        {fijo && <Btn variant="danger" onClick={() => void borrar()}>Quitar</Btn>}
        <Btn variant="primary" type="submit" className="flex-1">{fijo ? "Guardar cambios" : `Agregar ${nombreTipo.toLowerCase()}`}</Btn>
      </div>
    </form>
  );
}
