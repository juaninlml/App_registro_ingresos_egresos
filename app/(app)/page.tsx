"use client";
import Link from "next/link";
import { useState } from "react";
import { readTxMonth, useData, useTxMonths } from "@/components/DataProvider";
import { Avatar } from "@/components/Avatar";
import { DisponibleCard, useComprasCredito } from "@/components/Cuentas";
import { FijosLista, movimientoDeFijo } from "@/components/Fijos";
import { PresupuestoMes } from "@/components/Presupuesto";
import { IconGasto, IconIngreso, IconLibreta } from "@/components/icons";
import { useToast } from "@/components/motion";
import { creditos } from "@/lib/cuentas";
import { esIngresoFijo, fijosDelMes, porCobrar, porPagar, type FijoDelMes } from "@/lib/fijos";
import { Bars, Donut, GroupedBars, Legend, LineArea } from "@/components/charts";
import { IconAdelante } from "@/components/icons";
import { AnimatedNumber } from "@/components/motion";
import { Badge, Btn, Card, Empty, PageHeader, Section, Skeleton, Stat, cx } from "@/components/ui";
import { buildAlerts } from "@/lib/alerts";
import { addMonthKey, daysBetween, fdate, fmonth, fshort, monthKey } from "@/lib/dates";
import { abonadoDesdeCorte, deudaActual, latestStatement, projectCuts, proximoPago } from "@/lib/finance";
import { loanSummary } from "@/lib/loan";
import { mxn } from "@/lib/money";
import { buildPlan } from "@/lib/plan";

const mesCorto = (k: string) => fmonth(k).split(" ")[0].slice(0, 3);
const PUNTO = { rojo: "bg-danger", ambar: "bg-warn", info: "bg-muted" } as const;

export default function Resumen() {
  const { db, today, commit } = useData();
  const toast = useToast();
  const mes = monthKey(today);
  const meses = Array.from({ length: 6 }, (_, i) => addMonthKey(mes, i - 5));
  const txs = useTxMonths(meses);
  const alerts = buildAlerts(db, today);
  const compras = useComprasCredito();
  const [todas, setTodas] = useState(false);

  const cards = creditos(db.cards).map((card) => {
    const st = latestStatement(card);
    const abonado = st ? abonadoDesdeCorte(card, db.payments, st) : 0;
    return { card, st, abonado, falta: st ? Math.max(0, st.pagoNoIntereses - abonado) : 0 };
  });
  const deudaTarjetas = cards.reduce((s, c) => s + (c.st ? deudaActual(c.card, db.payments, c.st, compras?.[c.card.id]?.total ?? 0) : 0), 0);
  const comprasTotal = Object.values(compras ?? {}).reduce((s, c) => s + c.total, 0);
  const prestamos = db.loans.reduce((s, l) => s + loanSummary(l).saldo, 0);
  const proximos = cards.filter((c) => c.st && c.falta > 0).sort((a, b) => a.st!.fechaLimite.localeCompare(b.st!.fechaLimite));

  // Ingresos / egresos por mes (últimos 6)
  const porMes = meses.map((m) => {
    const l = txs?.[m] ?? [];
    return { m, ing: l.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0), gas: l.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0) };
  });
  const actual = porMes[porMes.length - 1];
  // gastos fijos del mes: los que faltan por pagar ya cuentan en los egresos y el balance
  const fijosMes = txs ? fijosDelMes(db.fijos, txs[mes] ?? [], mes, today, db.cards) : null;
  const fijosPend = fijosMes ? porPagar(fijosMes) : 0;
  const egresosMes = actual.gas + fijosPend;
  const fijosCobrar = fijosMes ? porCobrar(fijosMes) : 0;
  const ingresosMes = actual.ing + fijosCobrar;

  async function pagarFijo(x: FijoDelMes) {
    const t = movimientoDeFijo(x.fijo, mes, today);
    const m = t.fecha.slice(0, 7);
    try {
      if (await commit([{ key: `tx:${m}`, value: [...(await readTxMonth(m)), t] }])) {
        const ingreso = esIngresoFijo(x);
        toast({
          tone: ingreso ? "ok" : "danger",
          icon: ingreso ? <IconIngreso size={18} /> : <IconGasto size={18} />,
          title: `${x.fijo.nombre} ${ingreso ? "cobrado" : "pagado"}`,
          detail: `${ingreso ? "+" : "−"}${mxn(t.monto)} · ${x.credito ? "con tarjeta de crédito" : x.fijo.metodo ? (ingreso ? "a tu débito" : "de tu débito") : "en efectivo"}`,
        });
      }
    } catch (e) {
      toast({ tone: "danger", title: "No se pudo registrar el pago", detail: (e as Error).message });
    }
  }

  // Gastos por categoría del mes (top 5 + resto)
  const cats = Object.entries(
    (txs?.[mes] ?? []).filter((t) => t.tipo === "gasto").reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.monto), a), {}),
  ).sort((a, b) => b[1] - a[1]);
  const donut = [...cats.slice(0, 5), ...(cats.length > 5 ? [["Otras", cats.slice(5).reduce((s, c) => s + c[1], 0)] as [string, number]] : [])].map(([label, value]) => ({ label, value }));

  // Lo que vence cada mes en tarjetas
  const vence = new Map<string, number>();
  for (const c of creditos(db.cards)) {
    const stc = latestStatement(c);
    const prox = stc && compras ? proximoPago(c, db.msi, compras[c.id]?.lista ?? [], stc).comprasTotal : undefined;
    for (const r of projectCuts(c, db.msi, db.plan?.cardId === c.id ? db.plan.comprasEstimadas : 0, 7, prox)) {
      const k = monthKey(r.limite);
      vence.set(k, (vence.get(k) ?? 0) + r.total);
    }
  }
  const venceMeses = [...vence.keys()].sort().slice(0, 7);

  // Deuda proyectada con el plan
  const plan = db.plan && db.cards.find((c) => c.id === db.plan!.cardId);
  const stPlan = plan ? latestStatement(plan) : null;
  const planRes = plan && db.plan ? buildPlan(db.plan, plan, db.msi, db.payments, today, stPlan && compras ? proximoPago(plan, db.msi, compras[plan.id]?.lista ?? [], stPlan).comprasTotal : undefined) : null;
  let deudaSerie: { v: number[]; l: string[] } | null = null;
  if (planRes?.weeks.length) {
    const fin = planRes.liquidacion ? planRes.weeks.indexOf(planRes.liquidacion) + 1 : planRes.weeks.length;
    const ws = planRes.weeks.slice(0, Math.min(planRes.weeks.length, Math.max(fin, 2)));
    const paso = Math.max(1, Math.ceil(ws.length / 24));
    const sel = ws.filter((_, i) => i % paso === 0 || i === ws.length - 1);
    deudaSerie = { v: [planRes.deudaInicial, ...sel.map((w) => Math.max(0, w.deudaRestante))], l: ["Corte", ...sel.map((w) => fshort(w.lunes))] };
  }

  const vacio = !db.cards.length && !db.loans.length;
  const visibles = todas ? alerts : alerts.slice(0, 3);

  return (
    <>
      <PageHeader
        title={db.perfil?.nombre ? `Hola, ${db.perfil.nombre.split(" ")[0]}` : "Resumen"}
        sub={fdate(today)}
        lead={<Link href="/perfil" aria-label="Tu perfil" className="press rounded-full md:hidden"><Avatar perfil={db.perfil} size={44} /></Link>}
        actions={<Link href="/cierre"><Btn small><IconLibreta size={16} />Cierre de mes</Btn></Link>}
      />

      <DisponibleCard />

      {vacio && (
        <Empty>
          Aún no hay datos. Importa tu respaldo en <Link href="/ajustes" className="font-medium text-accent-text underline">Ajustes</Link> o crea tu primera{" "}
          <Link href="/tarjetas" className="font-medium text-accent-text underline">tarjeta subiendo el PDF de tu estado de cuenta</Link>.
        </Empty>
      )}

      {alerts.length > 0 && (
        <Section title={`Avisos (${alerts.length})`} actions={alerts.length > 3 ? <button type="button" onClick={() => setTodas(!todas)} className="text-xs font-medium text-accent-text underline">{todas ? "Ver menos" : `Ver las ${alerts.length}`}</button> : undefined}>
          <Card className="divide-y divide-border/60 p-0 sm:p-0">
            {visibles.map((a, i) => (
              <Link key={i} href={a.href} className="group flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] hover:bg-surface-2">
                <span className={cx("size-2.5 shrink-0 rounded-full", PUNTO[a.nivel])} aria-label={a.nivel === "rojo" ? "Urgente" : a.nivel === "ambar" ? "Atención" : "Info"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.titulo}</span>
                  <span className="block truncate text-xs text-muted">{a.detalle}</span>
                </span>
                <IconAdelante size={16} className="shrink-0 text-muted transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5" />
              </Link>
            ))}
          </Card>
        </Section>
      )}

      {!vacio && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Deuda en tarjetas" value={<AnimatedNumber value={deudaTarjetas} tone={{ up: "danger", down: "ok" }} />} sub={comprasTotal > 0 ? <>Al corte + <AnimatedNumber value={comprasTotal} /> en compras − abonos</> : "Saldo al corte menos tus abonos"} />
          <Stat label="Saldo de créditos" value={<AnimatedNumber value={prestamos} tone={{ up: "danger", down: "ok" }} />} sub={`${db.loans.length} crédito${db.loans.length === 1 ? "" : "s"}`} />
          <Stat label={`Ingresos ${mesCorto(mes)}`} value={txs ? <AnimatedNumber value={ingresosMes} tone="ok" /> : <Skeleton className="mt-1 h-7 w-28" />} tone="ok" sub={fijosCobrar > 0 ? `incluye ${mxn(fijosCobrar)} por cobrar` : undefined} />
          <Stat
            label={`Egresos ${mesCorto(mes)}`}
            value={txs ? <AnimatedNumber value={egresosMes} tone={{ up: "danger", down: "ok" }} /> : <Skeleton className="mt-1 h-7 w-28" />}
            tone={egresosMes > ingresosMes && ingresosMes > 0 ? "danger" : undefined}
            sub={txs ? (
              <>
                {fijosPend > 0 && <span className="block">incluye {mxn(fijosPend)} de fijos por pagar</span>}
                <span className="block">Balance <AnimatedNumber value={ingresosMes - egresosMes} tone={{ up: "ok", down: "danger" }} /></span>
              </>
            ) : undefined}
          />
        </div>
      )}

      <section className="mb-6">
        <FijosLista month={mes} lista={fijosMes} onPagar={pagarFijo} compacto />
      </section>

      <PresupuestoMes mes={mes} txMes={txs ? txs[mes] ?? [] : null} fijosMes={fijosMes} ingresosMes={ingresosMes} egresosMes={egresosMes} />

      {proximos.length > 0 && (
        <Section title="Próximos pagos de tarjetas">
          <div className="grid gap-3 sm:grid-cols-2">
            {proximos.map(({ card, st, abonado, falta }) => {
              const d = daysBetween(today, st!.fechaLimite);
              return (
                <Link key={card.id} href={`/tarjetas/${card.id}`}>
                  <Card className="transition-colors duration-[var(--dur-fast)] hover:border-accent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{card.banco} {card.nombre}</div>
                      <Badge tone={d < 0 ? "danger" : d <= 7 ? "warn" : "muted"}>{d < 0 ? "Vencido" : d === 0 ? "Hoy" : `${d} d`}</Badge>
                    </div>
                    <div className="num mt-2 text-xl font-semibold">{mxn(falta)}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="bar-fill h-full rounded-full bg-ok" style={{ transform: `scaleX(${Math.min(1, abonado / (st!.pagoNoIntereses || 1))})` }} /></div>
                    <div className="mt-1 text-xs text-muted">abonado {mxn(abonado)} de {mxn(st!.pagoNoIntereses)} · límite {fdate(st!.fechaLimite)}</div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Ingresos y egresos · 6 meses</h2><Link href="/movimientos" className="text-xs font-medium text-accent-text underline">Ver movimientos</Link></div>
          <Legend items={[{ color: "var(--ok)", label: "Ingresos" }, { color: "var(--danger)", label: "Egresos" }]} />
          {txs ? <GroupedBars data={[porMes.map((x) => x.ing), porMes.map((x) => x.gas)]} labels={porMes.map((x) => mesCorto(x.m))} colors={["var(--ok)", "var(--danger)"]} aria="Ingresos y egresos de los últimos seis meses" /> : <Skeleton className="h-40" />}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">En qué gastas · {fmonth(mes)}</h2>
          {donut.length ? <Donut items={donut} aria={`Gastos por categoría de ${fmonth(mes)}`} /> : (txs ? <p className="py-10 text-center text-sm text-muted">Sin gastos este mes.</p> : <Skeleton className="h-40" />)}
        </Card>

        {venceMeses.length > 0 && (
          <Card>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Lo que vence cada mes en tarjetas</h2><Link href="/msi" className="text-xs font-medium text-accent-text underline">Proyección</Link></div>
            <p className="mb-2 text-xs text-muted">Pago para no generar intereses (MSI + compras estimadas).</p>
            <Bars data={venceMeses.map((k) => vence.get(k)!)} labels={venceMeses.map(mesCorto)} color="var(--accent)" aria="Pagos de tarjeta que vencen cada mes" />
          </Card>
        )}

        {deudaSerie && planRes && (
          <Card>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Deuda con tu plan de abonos</h2><Link href="/plan" className="text-xs font-medium text-accent-text underline">Plan</Link></div>
            <p className="mb-2 text-xs text-muted">{planRes.liquidacion ? <>Terminas de pagar el <b className="text-fg">{fdate(planRes.liquidacion.lunes)}</b></> : "Con este plan aún no alcanza a liquidar."}</p>
            <LineArea values={deudaSerie.v} labels={deudaSerie.l} aria="Deuda restante semana a semana según el plan" />
          </Card>
        )}
      </div>
    </>
  );
}
