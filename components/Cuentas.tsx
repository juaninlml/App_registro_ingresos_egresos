"use client";
import Link from "next/link";
import { useState } from "react";
import { CardVisual } from "@/components/CardVisual";
import { useData, useTxMonths } from "@/components/DataProvider";
import { IconMas } from "@/components/icons";
import { AnimatedNumber, useToast } from "@/components/motion";
import { Btn, Card, Field, Modal, NumInput, Select, Skeleton, cx } from "@/components/ui";
import { creditos, debitos, disponibleCuenta, mesesDesde } from "@/lib/cuentas";
import { addMonthKey, ahoraHM, fdate, fshort, monthKey } from "@/lib/dates";
import { comprasDesdeCorte, latestStatement, totalCompras } from "@/lib/finance";
import { fijosDelMes, porPagar } from "@/lib/fijos";
import { mxn, round2 } from "@/lib/money";
import type { Card as CardT, Transaction } from "@/lib/types";

/** Selector de cuenta: efectivo, tarjetas de débito y de crédito, agrupadas. */
export function CuentaSelect({ value, onChange, solo, efectivo = true, required }: {
  value: string;
  onChange: (id: string) => void;
  solo?: "debito" | "credito";
  efectivo?: boolean;
  required?: boolean;
}) {
  const { db } = useData();
  const deb = solo === "credito" ? [] : debitos(db.cards);
  const cre = solo === "debito" ? [] : creditos(db.cards);
  const op = (c: CardT) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}{c.terminacion ? ` •••• ${c.terminacion}` : ""}</option>;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      {efectivo && <option value="">Efectivo</option>}
      {!efectivo && !deb.length && !cre.length && <option value="">Sin tarjetas</option>}
      {deb.length > 0 && <optgroup label="Débito">{deb.map(op)}</optgroup>}
      {cre.length > 0 && <optgroup label="Crédito">{cre.map(op)}</optgroup>}
    </Select>
  );
}

/**
 * Saldo de cada tarjeta de débito y lo que falta por pagar este mes en gastos fijos que salen de tu dinero.
 * Siempre usa el mes actual, aunque estés viendo otro. `undefined` mientras carga.
 */
export function useCuentas() {
  const { db, today } = useData();
  const meses = mesesDesde(db.cards, today);
  const txs = useTxMonths(meses);
  const mes = monthKey(today);
  const lista = debitos(db.cards);
  if (!txs) return { cuentas: lista.map((card) => ({ card, disponible: undefined as number | undefined })), total: undefined, pendientes: undefined };
  const todos = meses.flatMap((m) => txs[m] ?? []);
  const cuentas = lista.map((card) => ({ card, disponible: disponibleCuenta(card, todos, today) as number | undefined }));
  return {
    cuentas,
    total: round2(cuentas.reduce((s, c) => s + (c.disponible ?? 0), 0)),
    pendientes: porPagar(fijosDelMes(db.fijos, txs[mes] ?? [], mes, today, db.cards), true),
  };
}

/**
 * Compras con cada tarjeta de crédito registradas después de su último corte (ya son deuda aunque
 * aún no aparezcan en el estado de cuenta). `undefined` mientras carga.
 */
export function useComprasCredito(): Record<string, { lista: Transaction[]; total: number }> | undefined {
  const { db, today } = useData();
  const hoy = monthKey(today);
  const cortes = creditos(db.cards).map((c) => latestStatement(c)?.fechaCorte).filter((f): f is string => !!f).sort();
  const meses: string[] = [];
  // desde el mes del corte más antiguo hasta hoy (máximo un año atrás)
  for (let m = cortes.length ? monthKey(cortes[0]) : hoy; m <= hoy && meses.length < 12; m = addMonthKey(m, 1)) meses.push(m);
  if (meses.length === 12 && meses[11] !== hoy) meses.splice(0, meses.length, ...Array.from({ length: 12 }, (_, i) => addMonthKey(hoy, i - 11)));
  const txs = useTxMonths(cortes.length ? meses : []);
  if (!txs) return undefined;
  const todos = meses.flatMap((m) => txs[m] ?? []);
  const out: Record<string, { lista: Transaction[]; total: number }> = {};
  for (const card of creditos(db.cards)) {
    const st = latestStatement(card);
    const lista = st ? comprasDesdeCorte(card, todos, st, today) : [];
    out[card.id] = { lista, total: totalCompras(lista) };
  }
  return out;
}

/**
 * Tarjeta principal: cuánto dinero tienes en tus tarjetas de débito y cuánto te queda después de los gastos
 * fijos que faltan por pagar este mes. Así sabes cuánto puedes gastar sin usar las de crédito.
 */
export function DisponibleCard() {
  const { cuentas, total, pendientes } = useCuentas();
  const [ajustar, setAjustar] = useState<string | null>(null);
  const restante = total !== undefined && pendientes !== undefined ? round2(total - pendientes) : null;

  if (!cuentas.length) {
    return (
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">¿Cuánto tienes en débito?</h2>
          <p className="mt-0.5 text-sm text-muted">Agrega tu tarjeta de débito con su saldo y la app te dirá cuánto puedes gastar sin usar las de crédito.</p>
        </div>
        <Link href="/tarjetas?nueva=debito"><Btn variant="primary"><IconMas size={18} />Tarjeta de débito</Btn></Link>
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-muted">Disponible en débito</div>
            <div className={cx("mt-1 text-2xl font-semibold sm:text-3xl", total !== undefined && total < 0 && "text-danger")}>
              {total === undefined ? <Skeleton className="h-8 w-36" /> : <AnimatedNumber value={total} tone={{ up: "ok", down: "danger" }} />}
            </div>
            <div className="mt-0.5 text-xs text-muted">{cuentas.length === 1 ? "En tu tarjeta de débito" : `En tus ${cuentas.length} tarjetas de débito`}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted">Te queda después de fijos</div>
            <div className={cx("mt-1 text-2xl font-semibold sm:text-3xl", restante !== null && (restante < 0 ? "text-danger" : "text-ok"))}>
              {restante === null ? <Skeleton className="h-8 w-36" /> : <AnimatedNumber value={restante} tone={{ up: "ok", down: "danger" }} />}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {pendientes ? <>faltan <AnimatedNumber value={pendientes} /> en fijos por pagar</> : "Sin fijos por pagar con tu dinero"}
            </div>
          </div>
        </div>

        {/* cada tarjeta de débito con su saldo; tocarla permite ajustarlo */}
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {cuentas.map(({ card, disponible }) => (
            <li key={card.id} className="min-w-0">
              <button type="button" onClick={() => setAjustar(card.id)} className="press flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-2 text-left hover:border-accent" aria-label={`Ajustar saldo de ${card.banco} ${card.nombre}`}>
                <CardVisual card={card} compact className="w-12 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{card.banco} {card.nombre}</span>
                  <span className="block truncate text-xs text-muted">Saldo del {card.saldo ? fshort(card.saldo.fecha) : "—"} · tocar para ajustar</span>
                </span>
                <span className={cx("num shrink-0 text-sm font-semibold", disponible !== undefined && disponible < 0 && "text-danger")}>
                  {disponible === undefined ? <Skeleton className="h-4 w-16" /> : <AnimatedNumber value={disponible} tone={{ up: "ok", down: "danger" }} />}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {restante !== null && restante < 0 && (
          <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            Con lo que tienes en débito no alcanzas a cubrir tus gastos fijos de este mes: faltan {mxn(-restante)}.
          </p>
        )}
      </Card>
      <SaldoModal cardId={ajustar} onClose={() => setAjustar(null)} disponible={cuentas.find((c) => c.card.id === ajustar)?.disponible} />
    </>
  );
}

/** Captura el saldo real de una tarjeta de débito (lo que dice tu banco ahora). */
export function SaldoModal({ cardId, onClose, disponible }: { cardId: string | null; onClose: () => void; disponible?: number }) {
  const { db, save, today } = useData();
  const toast = useToast();
  const [monto, setMonto] = useState<number | "">("");
  const card = db.cards.find((c) => c.id === cardId);
  return (
    <Modal open={!!card} onClose={onClose} title={card ? `Saldo de ${card.banco} ${card.nombre}` : "Saldo"}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (monto === "" || !card) return;
          const saldo = { monto: Number(monto), fecha: today, hora: ahoraHM() };
          // se cierra al instante para ver cómo cambia el saldo
          onClose();
          setMonto("");
          if (await save("cards", db.cards.map((c) => (c.id === card.id ? { ...c, saldo } : c)))) {
            toast({ tone: "accent", title: "Saldo actualizado", detail: `${card.banco} ${card.nombre}: ${mxn(saldo.monto)} al ${fdate(today)}` });
          } else {
            toast({ tone: "danger", title: "No se guardó el saldo", detail: "Revisa tu conexión e intenta de nuevo" });
          }
        }}
      >
        <p className="text-sm text-muted">
          Escribe lo que tu app del banco dice que tienes ahora en esta tarjeta. Desde este momento se suman los ingresos
          que entren a ella y se restan los gastos y pagos de tarjeta que salgan de ella.
        </p>
        <Field label="Tengo ahora" hint={disponible !== undefined ? `La app calcula ${mxn(disponible)}; si no cuadra con tu banco, corrígelo aquí.` : undefined}>
          <NumInput value={monto} onChange={setMonto} required autoFocus placeholder="0.00" className="num !py-3 !text-2xl font-semibold" />
        </Field>
        <Btn variant="primary" type="submit" className="w-full">Guardar saldo</Btn>
      </form>
    </Modal>
  );
}
