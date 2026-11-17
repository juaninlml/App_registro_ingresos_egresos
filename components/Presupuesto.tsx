"use client";
import Link from "next/link";
import { useState } from "react";
import { useData, useTxMonths } from "@/components/DataProvider";
import { AnimatedNumber, useToast } from "@/components/motion";
import { Btn, Card, Field, NumInput, Progress, Section, cx } from "@/components/ui";
import { addMonthKey, fmonth, monthKey } from "@/lib/dates";
import type { FijoDelMes } from "@/lib/fijos";
import { mxn, round2 } from "@/lib/money";
import { gastadoPorCategoria, libreParaGastar, nivelPresupuesto, type Nivel } from "@/lib/presupuesto";
import { PAGO_TARJETA, type Transaction } from "@/lib/types";

const COLOR: Record<Nivel, string> = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" };
const TEXTO: Record<Nivel, string> = { ok: "text-muted", warn: "text-warn", danger: "text-danger" };

/** Barra de una categoría: lo gastado contra su tope. */
function BarraCategoria({ nombre, gastado, tope }: { nombre: string; gastado: number; tope: number }) {
  const { pct, nivel, restante } = nivelPresupuesto(gastado, tope);
  return (
    <li className="py-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{nombre}</span>
        <span className="num shrink-0 text-xs text-muted"><span className="font-semibold text-fg">{mxn(gastado)}</span> de {mxn(tope)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${nombre}: ${Math.round(pct * 100)}% del presupuesto`} aria-valuenow={Math.round(Math.min(pct, 1) * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("bar-fill h-full rounded-full", COLOR[nivel])} style={{ transform: `scaleX(${Math.min(pct, 1)})` }} />
      </div>
      <div className={cx("mt-1 text-xs", TEXTO[nivel])}>
        {restante >= 0 ? `Te quedan ${mxn(restante)}` : `Te pasaste por ${mxn(-restante)}`}
        {nivel === "warn" && " · vas en " + Math.round(pct * 100) + "%"}
      </div>
    </li>
  );
}

/**
 * Presupuesto del mes (método kakeibo): cuánto puedes gastar sin tocar tu meta de ahorro y
 * cómo vas en cada categoría con tope.
 */
export function PresupuestoMes({ mes, txMes, fijosMes, ingresosMes, egresosMes }: {
  mes: string;
  txMes: Transaction[] | null;
  fijosMes: FijoDelMes[] | null;
  ingresosMes: number;
  egresosMes: number;
}) {
  const { db } = useData();
  const topes = db.settings.presupuestos ?? {};
  const meta = db.settings.metaAhorro ?? 0;
  const conTope = Object.entries(topes).filter(([, v]) => v > 0);

  if (!conTope.length && !meta) {
    return (
      <Section title={`Presupuesto · ${fmonth(mes)}`}>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">Ponle un tope a tus categorías y una meta de ahorro: la app te dirá cuánto puedes gastar este mes y te avisará antes de pasarte.</p>
          <Link href="/ajustes#presupuesto"><Btn variant="primary">Definir presupuesto</Btn></Link>
        </Card>
      </Section>
    );
  }

  const gastado = txMes ? gastadoPorCategoria(txMes, fijosMes ?? []) : null;
  const balance = round2(ingresosMes - egresosMes);
  const libre = libreParaGastar(ingresosMes, egresosMes, meta);
  const filas = gastado
    ? conTope.map(([nombre, tope]) => ({ nombre, tope, gastado: gastado[nombre] ?? 0 })).sort((a, b) => b.gastado / b.tope - a.gastado / a.tope)
    : [];

  return (
    <Section title={`Presupuesto · ${fmonth(mes)}`} actions={<Link href="/ajustes#presupuesto" className="text-xs font-medium text-accent-text underline">Editar</Link>}>
      <Card>
        {meta > 0 && (
          <div className="grid gap-4 border-b border-border pb-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted">Libre para gastos variables</div>
              <div className={cx("mt-1 text-2xl font-semibold", libre < 0 ? "text-danger" : "text-ok")}>{txMes ? <AnimatedNumber value={libre} tone={{ up: "ok", down: "danger" }} /> : "…"}</div>
              <div className="mt-0.5 text-xs text-muted">Ingresos − egresos − meta de ahorro</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted">Ahorro del mes</div>
              <div className="mt-1 flex items-baseline gap-1.5"><span className="text-2xl font-semibold">{txMes ? <AnimatedNumber value={Math.max(0, balance)} /> : "…"}</span><span className="num text-sm text-muted">de {mxn(meta)}</span></div>
              <div className="mt-2"><Progress value={Math.max(0, balance)} max={meta} tone={balance >= meta ? "ok" : "accent"} label="Avance de la meta de ahorro" /></div>
              <div className="mt-1 text-xs text-muted">{balance >= meta ? "¡Meta cumplida con lo proyectado!" : `Faltan ${mxn(meta - Math.max(0, balance))} para tu meta`}</div>
            </div>
          </div>
        )}
        {conTope.length > 0 && (
          <ul className={cx("divide-y divide-border/60", meta > 0 && "pt-1")}>
            {filas.map((f) => <BarraCategoria key={f.nombre} {...f} />)}
          </ul>
        )}
      </Card>
    </Section>
  );
}

/** Editor del presupuesto en Ajustes: tope por categoría (con lo gastado el mes pasado como guía) y meta de ahorro. */
export function PresupuestoEditor() {
  const { db, save, today } = useData();
  const toast = useToast();
  const cats = db.settings.categoriasGasto.filter((c) => c !== PAGO_TARJETA);
  const pasado = addMonthKey(monthKey(today), -1);
  const txs = useTxMonths([pasado]);
  const referencia = txs ? gastadoPorCategoria(txs[pasado] ?? []) : {};
  const [topes, setTopes] = useState<Record<string, number | "">>(() => Object.fromEntries(cats.map((c) => [c, db.settings.presupuestos?.[c] ?? ""])));
  const [meta, setMeta] = useState<number | "">(db.settings.metaAhorro ?? "");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    // solo categorías que existen (por si alguna se renombró o se quitó mientras editabas)
    const presupuestos = Object.fromEntries(Object.entries(topes).filter(([k, v]) => cats.includes(k) && v !== "" && Number(v) > 0).map(([k, v]) => [k, round2(Number(v))]));
    const ok = await save("settings", { ...db.settings, presupuestos, metaAhorro: meta === "" ? undefined : round2(Number(meta)) });
    if (ok) toast({ tone: "accent", title: "Presupuesto guardado", detail: `${Object.keys(presupuestos).length} categorías con tope${meta ? ` · meta de ahorro ${mxn(Number(meta))}` : ""}` });
  }

  const total = Object.values(topes).reduce<number>((s, v) => s + (v === "" ? 0 : Number(v)), 0);

  return (
    <Card>
      <form onSubmit={guardar} className="space-y-4">
        <Field label="Meta de ahorro mensual" hint="Lo que quieres que te sobre cada mes. Se descuenta de lo que tienes libre para gastar.">
          <NumInput value={meta} onChange={setMeta} min={0} placeholder="0.00" />
        </Field>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted">Tope mensual por categoría</span>
            <span className="num text-xs text-muted">Total {mxn(total)}</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {cats.map((c) => (
              <li key={c} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c}</span>
                  <span className="block truncate text-xs text-muted">{referencia[c] ? `${fmonth(pasado).split(" ")[0]}: ${mxn(referencia[c])}` : "Sin gasto el mes pasado"}</span>
                </span>
                <NumInput value={topes[c] ?? ""} onChange={(n) => setTopes({ ...topes, [c]: n })} min={0} placeholder="Sin tope" aria-label={`Tope de ${c}`} className="!w-28 text-right" />
              </li>
            ))}
          </ul>
        </div>
        <Btn variant="primary" type="submit" className="w-full">Guardar presupuesto</Btn>
      </form>
    </Card>
  );
}
