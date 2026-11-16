"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Badge, Btn, Card, Empty, Field, Input, NumInput, PageHeader, Section, Select, Stat, TableWrap, td, th } from "@/components/ui";
import { fdate, fshort, weekday } from "@/lib/dates";
import { latestStatement } from "@/lib/finance";
import { mxn, uid } from "@/lib/money";
import { buildPlan, defaultPlan } from "@/lib/plan";
import type { PlanConfig } from "@/lib/types";

export default function Plan() {
  const { db, save, today } = useData();
  const [sel, setSel] = useState("");
  const card = db.cards.find((c) => c.id === (sel || db.plan?.cardId)) ?? db.cards[0];
  const [nuevoSem, setNuevoSem] = useState({ desde: "", monto: "" as number | "" });
  const [nuevoExtra, setNuevoExtra] = useState({ fecha: "", monto: "" as number | "", nota: "" });
  const [abono, setAbono] = useState<number | "">("");

  if (!card) return <><PageHeader title="Plan de abonos" /><Empty>Primero agrega una tarjeta.</Empty></>;
  if (!latestStatement(card)) return <><PageHeader title="Plan de abonos" /><Empty>Registra un estado de cuenta de {card.nombre} para armar el plan.</Empty></>;

  const plan: PlanConfig = db.plan && db.plan.cardId === card.id ? db.plan : defaultPlan(card);
  const res = buildPlan(plan, card, db.msi, db.payments, today);
  const guardado = db.plan?.cardId === card.id;
  const setPlan = (p: PlanConfig) => save("plan", p);
  const semActual = res.weeks.find((w) => w.lunes <= today && today <= w.domingo);

  return (
    <>
      <PageHeader title="Plan de abonos" sub="Un abono por semana para liquidar la tarjeta" actions={
        db.cards.length > 1 ? <Select value={card.id} onChange={(e) => setSel(e.target.value)} className="w-auto">{db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}</option>)}</Select> : undefined
      } />

      {!guardado && <Card className="mb-5 border-warn/40 bg-warn-soft text-sm text-warn">Este plan aún no está guardado. Agrega o cambia cualquier valor para guardarlo.</Card>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Deuda al último corte" value={mxn(res.deudaInicial)} />
        <Stat label="Liquidas el" value={res.liquidacion ? fshort(res.liquidacion.lunes) : "—"} tone={res.liquidacion ? "ok" : "warn"} sub={res.liquidacion ? undefined : "Con este plan aún no alcanza"} />
        <Stat label="Último vencimiento MSI" value={res.ultimoVencimientoMSI ? fshort(res.ultimoVencimientoMSI) : "—"} />
        <Stat label="Esta semana" value={semActual ? mxn(semActual.abono) : "—"} sub={semActual ? `Vence ${mxn(semActual.vence)}` : undefined} />
      </div>

      <Section title="Abono semanal (cada lunes)">
        <Card>
          <ul className="mb-3 divide-y divide-border text-sm">
            {[...plan.semanal].sort((a, b) => a.desde.localeCompare(b.desde)).map((s) => (
              <li key={s.desde} className="flex items-center justify-between py-2">
                <span>Desde {fdate(s.desde)}</span>
                <span className="flex items-center gap-2"><span className="num font-semibold">{mxn(s.monto)}</span>
                  <Btn small variant="ghost" aria-label="Quitar" onClick={() => plan.semanal.length > 1 && setPlan({ ...plan, semanal: plan.semanal.filter((x) => x.desde !== s.desde) })}>✕</Btn></span>
              </li>
            ))}
          </ul>
          <form className="grid grid-cols-5 items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const rest = plan.semanal.filter((x) => x.desde !== nuevoSem.desde);
            setPlan({ ...plan, semanal: [...rest, { desde: nuevoSem.desde, monto: Number(nuevoSem.monto) }] });
            setNuevoSem({ desde: "", monto: "" });
          }}>
            <div className="col-span-2"><Field label="Cambiar desde (lunes)"><Input type="date" value={nuevoSem.desde} onChange={(e) => setNuevoSem({ ...nuevoSem, desde: e.target.value })} required /></Field></div>
            <div className="col-span-2"><Field label="Nuevo monto"><NumInput value={nuevoSem.monto} onChange={(n) => setNuevoSem({ ...nuevoSem, monto: n })} min={0} required /></Field></div>
            <Btn variant="primary" type="submit">Agregar</Btn>
          </form>
          {nuevoSem.desde && weekday(nuevoSem.desde) !== 1 && <p className="mt-2 text-xs text-warn">Esa fecha no es lunes; aplicará desde la semana que la contenga.</p>}
        </Card>
      </Section>

      <Section title="Abonos extra">
        <Card>
          {plan.extras.length > 0 && (
            <ul className="mb-3 divide-y divide-border text-sm">
              {[...plan.extras].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span>{fdate(x.fecha)}{x.nota ? <span className="text-muted"> · {x.nota}</span> : null}</span>
                  <span className="flex items-center gap-2"><span className="num font-semibold">{mxn(x.monto)}</span>
                    <Btn small variant="ghost" aria-label="Quitar" onClick={() => setPlan({ ...plan, extras: plan.extras.filter((y) => y !== x) })}>✕</Btn></span>
                </li>
              ))}
            </ul>
          )}
          <form className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5" onSubmit={(e) => {
            e.preventDefault();
            setPlan({ ...plan, extras: [...plan.extras, { fecha: nuevoExtra.fecha, monto: Number(nuevoExtra.monto), nota: nuevoExtra.nota.trim() || undefined }] });
            setNuevoExtra({ fecha: "", monto: "", nota: "" });
          }}>
            <Field label="Fecha"><Input type="date" value={nuevoExtra.fecha} onChange={(e) => setNuevoExtra({ ...nuevoExtra, fecha: e.target.value })} required /></Field>
            <Field label="Monto"><NumInput value={nuevoExtra.monto} onChange={(n) => setNuevoExtra({ ...nuevoExtra, monto: n })} min={0.01} required /></Field>
            <div className="col-span-2 sm:col-span-2"><Field label="Nota"><Input value={nuevoExtra.nota} onChange={(e) => setNuevoExtra({ ...nuevoExtra, nota: e.target.value })} maxLength={80} /></Field></div>
            <Btn variant="primary" type="submit" className="col-span-2 sm:col-span-1">Agregar</Btn>
          </form>
          <p className="mt-2 text-xs text-muted">Los extras se suman al abono semanal de esa semana.</p>
        </Card>
      </Section>

      <Section title="Compras estimadas">
        <Card className="grid items-end gap-3 sm:grid-cols-2">
          <Field label="Compras por corte (después del primero)" hint="0 si ya no usarás la tarjeta"><NumInput value={plan.comprasEstimadas} onChange={(n) => setPlan({ ...plan, comprasEstimadas: Number(n) || 0 })} min={0} /></Field>
          <p className="text-xs text-muted">Los abonos se suponen aplicados a capital: pide al banco que el saldo a favor liquide los pagos pendientes.</p>
        </Card>
      </Section>

      <Section title="Registrar abono de hoy" >
        <Card>
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await save("payments", [...db.payments, { id: uid(), fecha: today, monto: Number(abono), destino: "card", targetId: card.id, nota: "Abono semanal" }])) setAbono("");
          }}>
            <div className="flex-1"><NumInput value={abono} onChange={setAbono} min={0.01} placeholder={semActual ? String(semActual.abonoPlan) : "Monto"} required aria-label="Monto del abono" /></div>
            <Btn variant="primary" type="submit">Registrar</Btn>
          </form>
          <p className="mt-2 text-xs text-muted">Las semanas pasadas usan lo que registraste; las futuras usan el plan.</p>
        </Card>
      </Section>

      <Section title="Semana por semana">
        <TableWrap>
          <thead><tr><th className={th}>#</th><th className={th}>Lunes</th><th className={th}>Abono</th><th className={th}>Vence</th><th className={th}>Pendiente</th><th className={th}>Saldo a favor</th><th className={th}>Deuda restante</th></tr></thead>
          <tbody>
            {res.weeks.map((w) => {
              const actual = w === semActual;
              return (
                <tr key={w.n} className={actual ? "bg-accent-soft" : w.domingo < today ? "text-muted" : ""}>
                  <td className={td}>{w.n}</td>
                  <td className={td}>{fshort(w.lunes)}</td>
                  <td className={td}>{mxn(w.abono)} {w.fuente === "real" && <Badge tone="ok">real</Badge>}</td>
                  <td className={td}>{w.vence ? mxn(w.vence) : "—"}</td>
                  <td className={`${td} ${w.pendiente > 0 ? "font-semibold text-danger" : ""}`}>{w.pendiente > 0 ? mxn(w.pendiente) : "—"}</td>
                  <td className={td}>{mxn(w.remanente)}</td>
                  <td className={td}>{w.liquidado ? <Badge tone="ok">liquidado</Badge> : mxn(w.deudaRestante)}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Section>
    </>
  );
}
