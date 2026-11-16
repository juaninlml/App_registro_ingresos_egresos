"use client";
import { useState } from "react";
import { useData, useMonthTx } from "@/components/DataProvider";
import { Btn, Card, Empty, Field, Input, NumInput, PageHeader, Section, Select, Stat } from "@/components/ui";
import { addMonthKey, fdate, fmonth, monthKey } from "@/lib/dates";
import { mxn, uid } from "@/lib/money";
import type { Transaction } from "@/lib/types";

export default function Movimientos() {
  const { db, today } = useData();
  const [mes, setMes] = useState(() => monthKey(today));
  const { list, err, write } = useMonthTx(mes);
  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto");
  const [f, setF] = useState({ monto: "" as number | "", cat: "", nota: "", fecha: "", metodo: "" });

  const cats = tipo === "gasto" ? db.settings.categoriasGasto : db.settings.categoriasIngreso;
  const cat = f.cat && cats.includes(f.cat) ? f.cat : cats[0] ?? "Otros";
  const fecha = f.fecha && monthKey(f.fecha) === mes ? f.fecha : mes === monthKey(today) ? today : `${mes}-01`;
  const items = [...(list ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ing = items.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gas = items.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  const porCat = Object.entries(items.filter((t) => t.tipo === "gasto").reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.monto), a), {})).sort((a, b) => b[1] - a[1]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!list) return;
    const t: Transaction = { id: uid(), fecha, tipo, monto: Number(f.monto), categoria: cat, nota: f.nota.trim() || undefined, metodo: f.metodo || undefined };
    if (await write([...list, t])) setF({ ...f, monto: "", nota: "" });
  }

  return (
    <>
      <PageHeader title="Ingresos y gastos" actions={
        <div className="flex items-center gap-1">
          <Btn small onClick={() => setMes(addMonthKey(mes, -1))} aria-label="Mes anterior">←</Btn>
          <span className="min-w-32 text-center text-sm font-medium capitalize">{fmonth(mes)}</span>
          <Btn small onClick={() => setMes(addMonthKey(mes, 1))} aria-label="Mes siguiente">→</Btn>
        </div>
      } />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Ingresos" value={mxn(ing)} tone="ok" />
        <Stat label="Gastos" value={mxn(gas)} />
        <Stat label="Balance" value={mxn(ing - gas)} tone={ing - gas < 0 ? "danger" : "ok"} />
      </div>

      <Card className="mb-6">
        <div className="mb-3 inline-flex rounded-xl bg-surface-2 p-1 text-sm">
          {(["gasto", "ingreso"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded-lg px-4 py-1.5 font-medium ${tipo === t ? "bg-surface shadow-sm" : "text-muted"}`}>{t === "gasto" ? "Gasto" : "Ingreso"}</button>
          ))}
        </div>
        <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2"><Field label="Monto"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field></div>
          <div className="sm:col-span-2"><Field label="Categoría"><Select value={cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
          <div className="sm:col-span-2"><Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Field></div>
          <div className="sm:col-span-3"><Field label="Nota"><Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={120} placeholder="Opcional" /></Field></div>
          {tipo === "gasto" && (
            <div className="sm:col-span-2"><Field label="Pagado con"><Select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}><option value="">Efectivo / débito</option>{db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}</option>)}</Select></Field></div>
          )}
          <div className="flex items-end sm:col-span-1"><Btn variant="primary" type="submit" disabled={!list} className="w-full">Agregar</Btn></div>
        </form>
      </Card>

      {porCat.length > 0 && (
        <Section title="Gastos por categoría">
          <Card>
            <ul className="space-y-2">
              {porCat.map(([c, m]) => (
                <li key={c} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 truncate">{c}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(m / porCat[0][1]) * 100}%` }} /></div>
                  <span className="num w-24 text-right">{mxn(m)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      <Section title="Movimientos">
        {!list ? <p className="text-sm text-muted">Cargando…</p> : !items.length ? <Empty>Sin movimientos en este mes.</Empty> : (
          <Card className="divide-y divide-border p-0 sm:p-0">
            {items.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.categoria}{t.nota ? <span className="font-normal text-muted"> · {t.nota}</span> : null}</div>
                  <div className="text-xs text-muted">{fdate(t.fecha)}{t.metodo ? ` · ${db.cards.find((c) => c.id === t.metodo)?.nombre ?? "tarjeta"}` : ""}</div>
                </div>
                <div className={`num text-sm font-semibold ${t.tipo === "ingreso" ? "text-ok" : ""}`}>{t.tipo === "ingreso" ? "+" : "−"}{mxn(t.monto)}</div>
                <Btn small variant="ghost" aria-label="Borrar movimiento" onClick={() => confirm("¿Borrar este movimiento?") && write(list.filter((x) => x.id !== t.id))}>✕</Btn>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </>
  );
}
