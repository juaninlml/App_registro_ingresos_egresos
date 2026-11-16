"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BancoColorFields, CardVisual, isColorId, type BancoColor } from "@/components/CardVisual";
import { SaldoModal, useCuentas } from "@/components/Cuentas";
import { useData, useTxMonths } from "@/components/DataProvider";
import { IconGasto, IconIngreso, IconPagoTarjeta } from "@/components/icons";
import { AnimatedNumber, useToast } from "@/components/motion";
import { Btn, Card, Empty, Field, Input, Modal, PageHeader, Section, Skeleton, Stat } from "@/components/ui";
import { mesesDesde, movimientosCuenta } from "@/lib/cuentas";
import { fdate, fhora, fshort, monthKey } from "@/lib/dates";
import { fijosDelMes } from "@/lib/fijos";
import { mxn, round2 } from "@/lib/money";
import { PAGO_TARJETA, type Card as CardT } from "@/lib/types";

/** Detalle de una tarjeta de débito: su saldo, lo que entró y salió desde el ajuste, y sus movimientos. */
export function DebitoDetalle({ card }: { card: CardT }) {
  const { db, save, commit, today } = useData();
  const router = useRouter();
  const toast = useToast();
  const [ajustar, setAjustar] = useState(false);
  const [editar, setEditar] = useState(false);
  const { cuentas } = useCuentas();
  const disponible = cuentas.find((c) => c.card.id === card.id)?.disponible;

  const meses = mesesDesde([card], today);
  const txs = useTxMonths(meses);
  const movs = txs ? movimientosCuenta(card, meses.flatMap((m) => txs[m] ?? []), today).sort((a, b) => `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`)) : null;
  const entradas = movs ? round2(movs.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0)) : 0;
  const salidas = movs ? round2(movs.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0)) : 0;
  const mes = monthKey(today);
  const fijos = txs ? fijosDelMes(db.fijos.filter((f) => f.metodo === card.id), txs[mes] ?? [], mes, today, db.cards) : [];
  const nombre = (id?: string) => {
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };

  async function borrar() {
    if (!confirm(`¿Borrar ${card.banco} ${card.nombre}? Sus movimientos se conservan como efectivo y los gastos fijos que salían de ella quedan sin tarjeta.`)) return;
    const ok = await commit([
      { key: "cards", value: db.cards.filter((c) => c.id !== card.id) },
      { key: "fijos", value: db.fijos.map((f) => (f.metodo === card.id ? { ...f, metodo: undefined } : f)) },
    ]);
    if (ok) router.replace("/tarjetas");
  }

  return (
    <>
      <PageHeader
        lead={<CardVisual card={card} compact className="w-14 shrink-0" />}
        title={`${card.banco} ${card.nombre}`}
        sub={`Débito${card.terminacion ? ` · •••• ${card.terminacion}` : ""}`}
        actions={<><Btn onClick={() => setEditar(true)}>Editar</Btn><Btn variant="primary" onClick={() => setAjustar(true)}>Ajustar saldo</Btn></>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Disponible" value={disponible === undefined ? <Skeleton className="mt-1 h-7 w-28" /> : <AnimatedNumber value={disponible} tone={{ up: "ok", down: "danger" }} />} tone={disponible !== undefined && disponible < 0 ? "danger" : undefined} />
        <Stat label="Saldo capturado" value={mxn(card.saldo?.monto ?? 0)} sub={card.saldo ? `${fdate(card.saldo.fecha)} · ${fhora(card.saldo.hora)}` : undefined} />
        <Stat label="Entró desde entonces" value={<AnimatedNumber value={entradas} tone="ok" />} tone="ok" />
        <Stat label="Salió desde entonces" value={<AnimatedNumber value={salidas} tone="danger" />} />
      </div>

      {fijos.some((x) => x.estado !== "pagado") && (
        <Section title="Gastos fijos que salen de esta tarjeta">
          <Card className="divide-y divide-border/60 p-0 sm:p-0">
            {fijos.filter((x) => x.estado !== "pagado").map((x) => (
              <div key={x.fijo.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate"><span className="font-semibold">{x.fijo.nombre}</span> <span className="text-muted">· {fshort(x.fecha)}</span></span>
                <span className="num shrink-0 font-semibold">−{mxn(x.fijo.monto)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Movimientos desde el último ajuste">
        {!movs ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : !movs.length ? (
          <Empty>Aún no hay movimientos en esta tarjeta. Al registrar un ingreso, gasto o pago de tarjeta en Movimientos, elige esta tarjeta para que se sume o reste aquí.</Empty>
        ) : (
          <Card className="divide-y divide-border/60 p-0 sm:p-0">
            {movs.slice(0, 50).map((t) => {
              const pago = t.categoria === PAGO_TARJETA && !!t.tarjetaId;
              const Icono = t.tipo === "ingreso" ? IconIngreso : pago ? IconPagoTarjeta : IconGasto;
              const tono = t.tipo === "ingreso" ? "ok" : pago ? "accent" : "danger";
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ color: `var(--${tono})`, background: `color-mix(in oklab, var(--${tono}) 15%, transparent)` }}><Icono size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{pago ? `Pago a ${nombre(t.tarjetaId)}` : t.categoria}</div>
                    <div className="truncate text-xs text-muted">{[fshort(t.fecha), fhora(t.hora), t.nota].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className={`num shrink-0 text-sm font-semibold ${t.tipo === "ingreso" ? "text-ok" : ""}`}>{t.tipo === "ingreso" ? "+" : "−"}{mxn(t.monto)}</div>
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      <div className="mt-8"><Btn variant="danger" onClick={() => void borrar()}>Borrar tarjeta</Btn></div>

      <SaldoModal cardId={ajustar ? card.id : null} onClose={() => setAjustar(false)} disponible={disponible} />
      <Modal open={editar} onClose={() => setEditar(false)} title="Editar tarjeta de débito">
        {editar && (
          <EditarDebito
            card={card}
            onSave={async (p) => {
              if (await save("cards", db.cards.map((c) => (c.id === card.id ? { ...c, ...p } : c)))) {
                setEditar(false);
                toast({ tone: "accent", title: "Tarjeta actualizada", detail: `${p.banco} ${p.nombre}` });
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

function EditarDebito({ card, onSave }: { card: CardT; onSave: (p: Pick<CardT, "banco" | "color" | "nombre" | "terminacion" | "notas">) => void }) {
  const [f, setF] = useState({ banco: card.banco, color: (isColorId(card.color) ? card.color : "") as BancoColor["color"], nombre: card.nombre, terminacion: card.terminacion ?? "", notas: card.notas ?? "" });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ banco: f.banco.trim(), color: f.color || undefined, nombre: f.nombre.trim(), terminacion: f.terminacion || undefined, notas: f.notas.trim() || undefined }); }}>
      <BancoColorFields value={f} onChange={(v) => setF({ ...f, ...v })} nombre={f.nombre} terminacion={f.terminacion} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={40} /></Field>
        <Field label="Últimos 4 dígitos"><Input value={f.terminacion} onChange={(e) => setF({ ...f, terminacion: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" /></Field>
      </div>
      <Field label="Notas"><Input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} maxLength={300} /></Field>
      <Btn variant="primary" type="submit" className="w-full">Guardar</Btn>
    </form>
  );
}
