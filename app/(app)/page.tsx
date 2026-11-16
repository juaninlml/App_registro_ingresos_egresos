"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useData, useTxMonths } from "@/components/DataProvider";
import { Badge, Card, Empty, PageHeader, Section, Stat, cx } from "@/components/ui";
import { buildAlerts } from "@/lib/alerts";
import { daysBetween, fdate, fmonth, monthKey } from "@/lib/dates";
import { abonadoDesdeCorte, latestStatement } from "@/lib/finance";
import { loanSummary } from "@/lib/loan";
import { mxn } from "@/lib/money";
import { buildPlan } from "@/lib/plan";

export default function Resumen() {
  const { db, today } = useData();
  const mes = monthKey(today);
  const txs = useTxMonths([mes]);
  const alerts = useMemo(() => buildAlerts(db, today), [db, today]);

  const cards = db.cards.map((card) => {
    const st = latestStatement(card);
    const abonado = st ? abonadoDesdeCorte(card, db.payments, st) : 0;
    return { card, st, abonado, falta: st ? Math.max(0, st.pagoNoIntereses - abonado) : 0 };
  });
  const deudaTarjetas = cards.reduce((s, c) => s + (c.st?.saldoTotal ?? 0), 0);
  const prestamos = db.loans.reduce((s, l) => s + loanSummary(l).saldo, 0);
  const proximos = cards
    .filter((c) => c.st && c.falta > 0)
    .sort((a, b) => a.st!.fechaLimite.localeCompare(b.st!.fechaLimite));

  const plan = db.plan && db.cards.find((c) => c.id === db.plan!.cardId);
  const planRes = plan && db.plan ? buildPlan(db.plan, plan, db.msi, db.payments, today) : null;

  const lista = txs?.[mes] ?? [];
  const ing = lista.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gas = lista.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  const porCat = Object.entries(
    lista.filter((t) => t.tipo === "gasto").reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.monto), a), {}),
  ).sort((a, b) => b[1] - a[1]);

  const vacio = !db.cards.length && !db.loans.length;

  return (
    <>
      <PageHeader title="Resumen" sub={fdate(today)} />

      {vacio && (
        <Empty>
          Aún no hay datos. Importa tu respaldo en <Link href="/ajustes" className="font-medium text-accent underline">Ajustes</Link> o agrega tu primera{" "}
          <Link href="/tarjetas" className="font-medium text-accent underline">tarjeta</Link>.
        </Empty>
      )}

      {alerts.length > 0 && (
        <Section title="Avisos">
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={cx(
                  "block rounded-xl border px-4 py-3 text-sm",
                  a.nivel === "rojo" && "border-danger/40 bg-danger-soft text-danger",
                  a.nivel === "ambar" && "border-warn/40 bg-warn-soft text-warn",
                  a.nivel === "info" && "border-border bg-surface",
                )}
              >
                <div className="font-semibold">{a.titulo}</div>
                <div className={cx("mt-0.5", a.nivel === "info" && "text-muted")}>{a.detalle}</div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {!vacio && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Deuda en tarjetas" value={mxn(deudaTarjetas)} sub="Saldo del último estado de cuenta" />
          <Stat label="Saldo de créditos" value={mxn(prestamos)} sub={`${db.loans.length} crédito${db.loans.length === 1 ? "" : "s"}`} />
          <Stat label={`Ingresos ${fmonth(mes).split(" ")[0]}`} value={txs ? mxn(ing) : "…"} tone="ok" />
          <Stat label={`Gastos ${fmonth(mes).split(" ")[0]}`} value={txs ? mxn(gas) : "…"} tone={gas > ing && ing > 0 ? "danger" : undefined} sub={txs ? `Balance ${mxn(ing - gas)}` : undefined} />
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
                    <div className="text-xs text-muted">de {mxn(st!.pagoNoIntereses)} · límite {fdate(st!.fechaLimite)} · abonado {mxn(abonado)}</div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {planRes?.liquidacion && (
        <Section title="Plan de abonos">
          <Link href="/plan">
            <Card className="transition hover:border-accent">
              <div className="text-sm text-muted">Con tu plan actual terminas de pagar el</div>
              <div className="mt-1 text-xl font-semibold">{fdate(planRes.liquidacion.lunes)}</div>
              <div className="mt-0.5 text-xs text-muted">Deuda inicial {mxn(planRes.deudaInicial)} · último MSI {planRes.ultimoVencimientoMSI ? fdate(planRes.ultimoVencimientoMSI) : "—"}</div>
            </Card>
          </Link>
        </Section>
      )}

      {porCat.length > 0 && (
        <Section title={`Gastos por categoría · ${fmonth(mes)}`}>
          <Card>
            <ul className="space-y-3">
              {porCat.map(([cat, m]) => (
                <li key={cat}>
                  <div className="mb-1 flex justify-between text-sm"><span>{cat}</span><span className="num">{mxn(m)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(m / porCat[0][1]) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </>
  );
}
