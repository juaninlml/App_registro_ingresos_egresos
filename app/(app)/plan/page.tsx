"use client";
import { useState } from "react";
import { CardVisual } from "@/components/CardVisual";
import { useComprasCredito } from "@/components/Cuentas";
import { AnimatedNumber } from "@/components/motion";
import { useData } from "@/components/DataProvider";
import { IconCerrar } from "@/components/icons";
import { Badge, Btn, Card, Empty, Field, IconBtn, Input, NumInput, PageHeader, Progress, Section, Stat, TableWrap, cx, td, th } from "@/components/ui";
import { fdate, fshort, weekday } from "@/lib/dates";
import { creditos } from "@/lib/cuentas";
import { abonadoDesdeCorte, deudaActual, latestStatement, proximoPago } from "@/lib/finance";
import Link from "next/link";
import { mxn, round2 } from "@/lib/money";
import { buildPlan, conAbono, defaultPlan, proximoLunes, sugerencias } from "@/lib/plan";
import type { Card as CardT, PlanConfig } from "@/lib/types";

export default function Plan() {
  const { db, save, today } = useData();
  const [sel, setSel] = useState("");
  const credito = creditos(db.cards);
  const card = credito.find((c) => c.id === (sel || db.plan?.cardId)) ?? credito[0];
  const [nuevoSem, setNuevoSem] = useState({ desde: "", monto: "" as number | "" });
  const [nuevoExtra, setNuevoExtra] = useState({ fecha: "", monto: "" as number | "", nota: "" });
  const [custom, setCustom] = useState<number | "">("");
  const compras = useComprasCredito();

  if (!card) return <><PageHeader title="Plan de abonos" /><Empty>Primero agrega una tarjeta de crédito.</Empty></>;
  const selector = <SelectorTarjeta cards={credito} actual={card.id} conPlan={db.plan?.cardId} onSelect={setSel} />;
  if (!latestStatement(card)) {
    return (
      <>
        <PageHeader title="Plan de abonos" sub="Un abono por semana para liquidar la tarjeta" />
        {selector}
        <Empty>Registra un estado de cuenta de {card.banco} {card.nombre} para armar el plan.</Empty>
      </>
    );
  }

  const plan: PlanConfig = db.plan && db.plan.cardId === card.id ? db.plan : defaultPlan(card);
  const st0 = latestStatement(card)!;
  // compras ya registradas para el siguiente corte (sin las que son MSI)
  const prox = proximoPago(card, db.msi, compras?.[card.id]?.lista ?? [], st0);
  const comprasProx = compras ? prox.comprasTotal : undefined;
  const res = buildPlan(plan, card, db.msi, db.payments, today, comprasProx);
  const guardado = db.plan?.cardId === card.id;
  const setPlan = (p: PlanConfig) => save("plan", p);
  const st = latestStatement(card)!;
  const comprado = compras?.[card.id]?.total ?? 0;
  const deuda = deudaActual(card, db.payments, st, comprado);
  const sug = sugerencias(plan, card, db.msi, db.payments, today, deuda, comprasProx);
  const sim = custom === "" || Number(custom) <= 0 ? null : buildPlan(conAbono(plan, Number(custom), today), card, db.msi, db.payments, today, comprasProx);
  const simPend = sim ? sim.weeks.filter((w) => w.domingo >= today && w.pendiente > 0.005) : [];
  const aplicar = (m: number) => setPlan(conAbono(plan, m, today));
  const semActual = res.weeks.find((w) => w.lunes <= today && today <= w.domingo);

  // Siguiente corte: lo que hay que pagar (MSI + compras antes del corte) y lo acumulado para él.
  // Lo abonado desde el corte primero cubre el pago del corte actual; lo que sobra ya cuenta para el siguiente.
  const abonadoCorte = abonadoDesdeCorte(card, db.payments, st);
  const faltaActual = Math.max(0, round2(st.pagoNoIntereses - abonadoCorte));
  const acumulado = Math.max(0, round2(abonadoCorte - st.pagoNoIntereses));
  const semLimite = res.weeks.find((w) => w.lunes <= prox.limite && prox.limite <= w.domingo);

  return (
    <>
      <PageHeader title="Plan de abonos" sub="Un abono por semana para liquidar la tarjeta" />
      {selector}

      {!guardado && <Card className="mb-5 border-warn/40 bg-warn-soft text-sm text-warn">Este plan aún no está guardado. Agrega o cambia cualquier valor para guardarlo.</Card>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Deuda actual" value={<AnimatedNumber value={deuda} tone={{ up: "danger", down: "ok" }} />} sub={`Corte ${fshort(st.fechaCorte)}: ${mxn(res.deudaInicial)}${comprado > 0 ? ` + ${mxn(comprado)} en compras` : ""} − abonos`} />
        <Stat label="Liquidas el" value={res.liquidacion ? fshort(res.liquidacion.lunes) : "—"} tone={res.liquidacion ? "ok" : "warn"} sub={res.liquidacion ? undefined : "Con este plan aún no alcanza"} />
        <Stat label="Último vencimiento MSI" value={res.ultimoVencimientoMSI ? fshort(res.ultimoVencimientoMSI) : "—"} />
        <Stat label="Esta semana" value={semActual ? mxn(semActual.abono) : "—"} sub={semActual ? `Vence ${mxn(semActual.vence)}` : undefined} />
      </div>

      <Section title={`Siguiente corte · ${fshort(prox.corte)}`}>
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-muted">Total a pagar</div>
              <div className="mt-1 text-2xl font-semibold">{compras ? <AnimatedNumber value={prox.total} tone={{ up: "danger", down: "ok" }} /> : "…"}</div>
              <div className="mt-0.5 text-xs text-muted">Límite aprox. {fdate(prox.limite)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted">Llevas acumulado</div>
              <div className="mt-1 text-2xl font-semibold text-ok"><AnimatedNumber value={Math.min(acumulado, prox.total)} tone="ok" /></div>
              <div className="mt-2"><Progress value={acumulado} max={prox.total} tone="ok" label="Acumulado para el siguiente corte" /></div>
              <div className="mt-1 text-xs text-muted">
                {prox.total <= 0 ? "Sin pagos en ese corte" : acumulado >= prox.total ? "¡Ya está cubierto!" : `Faltan ${mxn(prox.total - acumulado)}`}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted">Con tu plan, al {fshort(prox.limite)}</div>
              <div className="mt-1 text-2xl font-semibold">{semLimite ? <AnimatedNumber value={semLimite.disponible} /> : "—"}</div>
              <div className="mt-1">
                {semLimite && (semLimite.pendiente > 0.005 ? <Badge tone="warn">Faltarían {mxn(semLimite.pendiente)}</Badge> : <Badge tone="ok">Alcanza</Badge>)}
              </div>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-border/60 border-t border-border text-sm">
            {prox.msi.map((x) => (
              <li key={x.m.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{x.m.descripcion} <span className="text-muted">· mensualidad {x.k} de {x.m.totalPagos}</span></span>
                <span className="num shrink-0">{mxn(x.m.pagoMensual)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 truncate">Compras antes del corte <span className="text-muted">· {compras ? `${prox.compras.length} registrada${prox.compras.length === 1 ? "" : "s"} desde el ${fshort(st.fechaCorte)}` : "…"}</span></span>
              <span className="num shrink-0">{compras ? mxn(prox.comprasTotal) : "…"}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3 py-2 font-semibold">
              <span>Total del corte <span className="font-normal text-muted">· {mxn(prox.msiTotal)} de MSI + {mxn(prox.comprasTotal)} de compras</span></span>
              <span className="num shrink-0">{mxn(prox.total)}</span>
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted">
            {faltaActual > 0
              ? `Lo que abones primero cubre el corte actual (faltan ${mxn(faltaActual)} para el ${fshort(st.fechaLimite)}); lo que pase de ahí se acumula para este corte.`
              : "El corte actual ya está cubierto: todo lo que abones se acumula para este corte."}{" "}
            Las compras que también capturaste como MSI no se cuentan dos veces.
          </p>
        </Card>
      </Section>

      <Section title="Calculadora de abono semanal">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs font-medium text-muted">Fijo · cubrir cada pago a tiempo</div>
              <div className="num mt-1 text-xl font-semibold">{sug.minimo !== null ? mxn(sug.minimo) : "—"}<span className="text-sm font-normal text-muted"> / semana</span></div>
              <div className="mt-0.5 text-xs text-muted">Lo mínimo para llegar a cada fecha límite sin pendiente.</div>
              {sug.minimo !== null && <Btn small className="mt-2" onClick={() => aplicar(sug.minimo!)}>Usar este</Btn>}
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs font-medium text-muted">Fijo · liquidar el total</div>
              <div className="num mt-1 text-xl font-semibold">{sug.liquidar !== null ? mxn(sug.liquidar) : "—"}<span className="text-sm font-normal text-muted"> / semana</span></div>
              <div className="mt-0.5 text-xs text-muted">{sug.liquidar !== null ? `Deuda ${mxn(deuda)} en ${sug.semanasLiquidar} semanas, hasta el último MSI.` : "Sin deuda pendiente o sin MSI vigentes."}</div>
              {sug.liquidar !== null && <Btn small className="mt-2" onClick={() => aplicar(sug.liquidar!)}>Usar este</Btn>}
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <Field label="Personalizado · ¿cuánto abonarías cada semana?" hint={`Aplica desde el lunes ${fdate(proximoLunes(today))}`}>
              <NumInput value={custom} onChange={setCustom} min={0.01} placeholder="Monto" aria-label="Abono semanal personalizado" />
            </Field>
            {sim && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted">Terminas de pagar</div><div className="font-semibold">{sim.liquidacion ? fdate(sim.liquidacion.lunes) : "No alcanza en el plan"}</div></div>
                <div><div className="text-xs text-muted">Pagos a tiempo</div>{simPend.length ? <div className="font-semibold text-danger">Faltan {mxn(simPend.reduce((a, w) => a + w.pendiente, 0))} en {simPend.length} sem.</div> : <div className="font-semibold text-ok">Todo cubierto</div>}</div>
                <Btn variant="primary" className="col-span-2" onClick={() => { aplicar(Number(custom)); setCustom(""); }}>Aplicar al plan</Btn>
              </div>
            )}
          </div>
        </Card>
      </Section>

      <Section title="Abono semanal (cada lunes)">
        <Card>
          <ul className="mb-3 divide-y divide-border text-sm">
            {[...plan.semanal].sort((a, b) => a.desde.localeCompare(b.desde)).map((s) => (
              <li key={s.desde} className="flex items-center justify-between py-2">
                <span>Desde {fdate(s.desde)}</span>
                <span className="flex items-center gap-2"><span className="num font-semibold">{mxn(s.monto)}</span>
                  <IconBtn small label={`Quitar abono desde ${fdate(s.desde)}`} disabled={plan.semanal.length <= 1} onClick={() => setPlan({ ...plan, semanal: plan.semanal.filter((x) => x.desde !== s.desde) })}><IconCerrar size={16} /></IconBtn></span>
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
                    <IconBtn small label={`Quitar abono extra del ${fdate(x.fecha)}`} onClick={() => setPlan({ ...plan, extras: plan.extras.filter((y) => y !== x) })}><IconCerrar size={16} /></IconBtn></span>
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
          <Field label="Compras estimadas por corte" hint="Para los cortes después del siguiente; el siguiente usa las compras que ya registraste. 0 si ya no usarás la tarjeta."><NumInput value={plan.comprasEstimadas} onChange={(n) => setPlan({ ...plan, comprasEstimadas: Number(n) || 0 })} min={0} /></Field>
          <p className="text-xs text-muted">Los abonos se suponen aplicados a capital: pide al banco que el saldo a favor liquide los pagos pendientes.</p>
        </Card>
      </Section>

      <Section title="Registrar un abono">
        <Card className="text-sm text-muted">
          Los pagos reales se registran en <Link href="/movimientos" className="font-medium text-accent-text underline">Movimientos</Link> con la categoría «Pago de tarjeta»: ahí se descuentan de la deuda y de esta tabla. Aquí solo se calcula el plan.
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

/** Tarjetas para elegir de cuál es el plan, con el mismo color y banco que en «Tarjetas». */
function SelectorTarjeta({ cards, actual, conPlan, onSelect }: { cards: CardT[]; actual: string; conPlan?: string; onSelect: (id: string) => void }) {
  return (
    <Section title={cards.length > 1 ? "¿De qué tarjeta es el plan?" : "Tarjeta del plan"}>
      <div role="radiogroup" aria-label="Tarjeta del plan" className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:py-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {cards.map((c) => {
          const on = c.id === actual;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${c.banco} ${c.nombre}${c.terminacion ? ` terminación ${c.terminacion}` : ""}`}
              onClick={() => onSelect(c.id)}
              className={cx(
                "press relative w-44 shrink-0 snap-start rounded-2xl p-1 text-left transition-[opacity,box-shadow] duration-[var(--dur)] sm:w-auto",
                on ? "ring-2 ring-accent" : "opacity-55 hover:opacity-100",
              )}
            >
              <CardVisual card={c} />
              <span className="mt-1.5 flex min-h-6 items-center justify-between gap-1 px-1 text-xs">
                <span className={cx("truncate", on ? "font-semibold" : "text-muted")}>{c.banco} {c.nombre}</span>
                {conPlan === c.id && <span className="shrink-0 whitespace-nowrap"><Badge tone="accent">con plan</Badge></span>}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
