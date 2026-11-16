"use client";
import Link from "next/link";
import { useState } from "react";
import { useData, useTxMonths } from "@/components/DataProvider";
import { Bars, Donut, GroupedBars, Legend, LineArea } from "@/components/charts";
import { Badge, Card, Empty, PageHeader, Section, Stat, cx } from "@/components/ui";
import { buildAlerts } from "@/lib/alerts";
import { addMonthKey, daysBetween, fdate, fmonth, fshort, monthKey } from "@/lib/dates";
import { abonadoDesdeCorte, deudaActual, latestStatement, projectCuts } from "@/lib/finance";
import { loanSummary } from "@/lib/loan";
import { mxn } from "@/lib/money";
import { buildPlan } from "@/lib/plan";

const mesCorto = (k: string) => fmonth(k).split(" ")[0].slice(0, 3);
const PUNTO = { rojo: "bg-danger", ambar: "bg-warn", info: "bg-muted" } as const;

export default function Resumen() {
  const { db, today } = useData();
  const mes = monthKey(today);
  const meses = Array.from({ length: 6 }, (_, i) => addMonthKey(mes, i - 5));
  const txs = useTxMonths(meses);
  const alerts = buildAlerts(db, today);
  const [todas, setTodas] = useState(false);

  const cards = db.cards.map((card) => {
    const st = latestStatement(card);
    const abonado = st ? abonadoDesdeCorte(card, db.payments, st) : 0;
    return { card, st, abonado, falta: st ? Math.max(0, st.pagoNoIntereses - abonado) : 0 };
  });
  const deudaTarjetas = cards.reduce((s, c) => s + (c.st ? deudaActual(c.card, db.payments, c.st) : 0), 0);
  const prestamos = db.loans.reduce((s, l) => s + loanSummary(l).saldo, 0);
  const proximos = cards.filter((c) => c.st && c.falta > 0).sort((a, b) => a.st!.fechaLimite.localeCompare(b.st!.fechaLimite));

  // Ingresos / egresos por mes (últimos 6)
  const porMes = meses.map((m) => {
    const l = txs?.[m] ?? [];
    return { m, ing: l.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0), gas: l.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0) };
  });
  const actual = porMes[porMes.length - 1];

  // Gastos por categoría del mes (top 5 + resto)
  const cats = Object.entries(
    (txs?.[mes] ?? []).filter((t) => t.tipo === "gasto").reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.monto), a), {}),
  ).sort((a, b) => b[1] - a[1]);
  const donut = [...cats.slice(0, 5), ...(cats.length > 5 ? [["Otras", cats.slice(5).reduce((s, c) => s + c[1], 0)] as [string, number]] : [])].map(([label, value]) => ({ label, value }));

  // Lo que vence cada mes en tarjetas
  const vence = new Map<string, number>();
  for (const c of db.cards) {
    for (const r of projectCuts(c, db.msi, db.plan?.cardId === c.id ? db.plan.comprasEstimadas : 0, 7)) {
      const k = monthKey(r.limite);
      vence.set(k, (vence.get(k) ?? 0) + r.total);
    }
  }
  const venceMeses = [...vence.keys()].sort().slice(0, 7);

  // Deuda proyectada con el plan
  const plan = db.plan && db.cards.find((c) => c.id === db.plan!.cardId);
  const planRes = plan && db.plan ? buildPlan(db.plan, plan, db.msi, db.payments, today) : null;
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
      <PageHeader title="Resumen" sub={fdate(today)} />

      {vacio && (
        <Empty>
          Aún no hay datos. Importa tu respaldo en <Link href="/ajustes" className="font-medium text-accent underline">Ajustes</Link> o crea tu primera{" "}
          <Link href="/tarjetas" className="font-medium text-accent underline">tarjeta subiendo el PDF de tu estado de cuenta</Link>.
        </Empty>
      )}

      {alerts.length > 0 && (
        <Section title={`Avisos (${alerts.length})`} actions={alerts.length > 3 ? <button type="button" onClick={() => setTodas(!todas)} className="text-xs font-medium text-accent underline">{todas ? "Ver menos" : `Ver las ${alerts.length}`}</button> : undefined}>
          <Card className="divide-y divide-border/60 p-0 sm:p-0">
            {visibles.map((a, i) => (
              <Link key={i} href={a.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                <span className={cx("size-2.5 shrink-0 rounded-full", PUNTO[a.nivel])} aria-label={a.nivel === "rojo" ? "Urgente" : a.nivel === "ambar" ? "Atención" : "Info"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.titulo}</span>
                  <span className="block truncate text-xs text-muted">{a.detalle}</span>
                </span>
                <span aria-hidden className="text-muted">›</span>
              </Link>
            ))}
          </Card>
        </Section>
      )}

      {!vacio && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Deuda en tarjetas" value={mxn(deudaTarjetas)} sub="Saldo al corte menos tus abonos" />
          <Stat label="Saldo de créditos" value={mxn(prestamos)} sub={`${db.loans.length} crédito${db.loans.length === 1 ? "" : "s"}`} />
          <Stat label={`Ingresos ${mesCorto(mes)}`} value={txs ? mxn(actual.ing) : "…"} tone="ok" />
          <Stat label={`Egresos ${mesCorto(mes)}`} value={txs ? mxn(actual.gas) : "…"} tone={actual.gas > actual.ing && actual.ing > 0 ? "danger" : undefined} sub={txs ? `Balance ${mxn(actual.ing - actual.gas)}` : undefined} />
        </div>
      )}

      {proximos.length > 0 && (
        <Section title="Próximos pagos de tarjetas">
          <div className="grid gap-3 sm:grid-cols-2">
            {proximos.map(({ card, st, abonado, falta }) => {
              const d = daysBetween(today, st!.fechaLimite);
              return (
                <Link key={card.id} href={`/tarjetas/${card.id}`}>
                  <Card className="transition hover:border-accent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{card.banco} {card.nombre}</div>
                      <Badge tone={d < 0 ? "danger" : d <= 7 ? "warn" : "muted"}>{d < 0 ? "Vencido" : d === 0 ? "Hoy" : `${d} d`}</Badge>
                    </div>
                    <div className="num mt-2 text-xl font-semibold">{mxn(falta)}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ok" style={{ width: `${Math.min(100, (abonado / (st!.pagoNoIntereses || 1)) * 100)}%` }} /></div>
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
          <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Ingresos y egresos · 6 meses</h2><Link href="/movimientos" className="text-xs font-medium text-accent underline">Ver movimientos</Link></div>
          <Legend items={[{ color: "var(--ok)", label: "Ingresos" }, { color: "var(--danger)", label: "Egresos" }]} />
          {txs ? <GroupedBars data={[porMes.map((x) => x.ing), porMes.map((x) => x.gas)]} labels={porMes.map((x) => mesCorto(x.m))} colors={["var(--ok)", "var(--danger)"]} aria="Ingresos y egresos de los últimos seis meses" /> : <p className="py-10 text-center text-sm text-muted">Cargando…</p>}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold capitalize">En qué gastas · {fmonth(mes)}</h2>
          {donut.length ? <Donut items={donut} aria={`Gastos por categoría de ${fmonth(mes)}`} /> : <p className="py-10 text-center text-sm text-muted">{txs ? "Sin gastos este mes." : "Cargando…"}</p>}
        </Card>

        {venceMeses.length > 0 && (
          <Card>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Lo que vence cada mes en tarjetas</h2><Link href="/msi" className="text-xs font-medium text-accent underline">Proyección</Link></div>
            <p className="mb-2 text-xs text-muted">Pago para no generar intereses (MSI + compras estimadas).</p>
            <Bars data={venceMeses.map((k) => vence.get(k)!)} labels={venceMeses.map(mesCorto)} color="var(--accent)" aria="Pagos de tarjeta que vencen cada mes" />
          </Card>
        )}

        {deudaSerie && planRes && (
          <Card>
            <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Deuda con tu plan de abonos</h2><Link href="/plan" className="text-xs font-medium text-accent underline">Plan</Link></div>
            <p className="mb-2 text-xs text-muted">{planRes.liquidacion ? <>Terminas de pagar el <b className="text-fg">{fdate(planRes.liquidacion.lunes)}</b></> : "Con este plan aún no alcanza a liquidar."}</p>
            <LineArea values={deudaSerie.v} labels={deudaSerie.l} aria="Deuda restante semana a semana según el plan" />
          </Card>
        )}
      </div>
    </>
  );
}
