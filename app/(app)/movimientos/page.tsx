"use client";
import { useMemo, useState } from "react";
import { useData, useMonthTx } from "@/components/DataProvider";
import { Badge, Btn, Card, Empty, Field, Input, NumInput, PageHeader, Section, Select, Stat } from "@/components/ui";
import { addMonthKey, fmonth, monthKey, parse } from "@/lib/dates";
import { mxn, uid } from "@/lib/money";
import { PAGO_TARJETA, type Transaction } from "@/lib/types";

const fDia = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default function Movimientos() {
  const { db, save, today } = useData();
  const [mes, setMes] = useState(() => monthKey(today));
  const { list, err, write } = useMonthTx(mes);
  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto");
  const [f, setF] = useState({ monto: "" as number | "", cat: "", nota: "", fecha: "", metodo: "", tarjeta: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const catsBase = tipo === "gasto" ? db.settings.categoriasGasto : db.settings.categoriasIngreso;
  const cats = tipo === "gasto" && !catsBase.includes(PAGO_TARJETA) ? [...catsBase, PAGO_TARJETA] : catsBase;
  const cat = f.cat && cats.includes(f.cat) ? f.cat : cats[0] ?? "Otros";
  const esPago = tipo === "gasto" && cat === PAGO_TARJETA;
  const tarjeta = f.tarjeta && db.cards.some((c) => c.id === f.tarjeta) ? f.tarjeta : db.cards[0]?.id ?? "";
  const fecha = f.fecha && monthKey(f.fecha) === mes ? f.fecha : mes === monthKey(today) ? today : `${mes}-01`;
  const nombreTarjeta = (id?: string) => {
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };

  const items = useMemo(() => list ?? [], [list]);
  const ing = items.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gas = items.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  const pagosTarjeta = items.filter((t) => t.tipo === "gasto" && t.categoria === PAGO_TARJETA).reduce((s, t) => s + t.monto, 0);
  const porCat = Object.entries(items.filter((t) => t.tipo === "gasto").reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.monto), a), {})).sort((a, b) => b[1] - a[1]);

  const dias = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of items) m.set(t.fecha, [...(m.get(t.fecha) ?? []), t]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([fecha, ts]) => ({
      fecha,
      ts,
      ing: ts.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0),
      gas: ts.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0),
    }));
  }, [items]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!list) return;
    if (esPago && !tarjeta) {
      setMsg("Primero agrega una tarjeta para registrar pagos.");
      return;
    }
    setMsg(null);
    const t: Transaction = {
      id: uid(), fecha, tipo, monto: Number(f.monto), categoria: cat, nota: f.nota.trim() || undefined,
      metodo: !esPago && tipo === "gasto" ? f.metodo || undefined : undefined,
      tarjetaId: esPago ? tarjeta : undefined,
    };
    if (!(await write([...list, t]))) return;
    if (esPago) {
      const ok = await save("payments", [...db.payments, { id: uid(), fecha, monto: t.monto, destino: "card", targetId: tarjeta, nota: t.nota ?? "Pago desde movimientos", txId: t.id }]);
      if (!ok) {
        await write(list); // sin el abono no se deja el movimiento a medias
        setMsg("No se pudo registrar el abono a la tarjeta; no se guardó el movimiento.");
        return;
      }
    }
    setF({ ...f, monto: "", nota: "" });
  }

  async function borrar(t: Transaction) {
    if (!list || !confirm(esPagoTx(t) ? "¿Borrar este pago? También se quitará el abono de la tarjeta." : "¿Borrar este movimiento?")) return;
    if (await write(list.filter((x) => x.id !== t.id)) && db.payments.some((p) => p.txId === t.id)) {
      await save("payments", db.payments.filter((p) => p.txId !== t.id));
    }
  }
  const esPagoTx = (t: Transaction) => t.tipo === "gasto" && t.categoria === PAGO_TARJETA && !!t.tarjetaId;

  return (
    <>
      <PageHeader title="Ingresos y gastos" actions={
        <div className="flex items-center gap-1">
          <Btn small onClick={() => setMes(addMonthKey(mes, -1))} aria-label="Mes anterior">←</Btn>
          <span className="min-w-32 text-center text-sm font-medium capitalize">{fmonth(mes)}</span>
          <Btn small onClick={() => setMes(addMonthKey(mes, 1))} aria-label="Mes siguiente">→</Btn>
        </div>
      } />
      {(err || msg) && <p role="alert" className="mb-3 text-sm text-danger">{err ?? msg}</p>}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Ingresos del mes" value={mxn(ing)} tone="ok" />
        <Stat label="Gastos del mes" value={mxn(gas)} sub={pagosTarjeta > 0 ? `incluye ${mxn(pagosTarjeta)} en pagos de tarjeta` : undefined} />
        <Stat label="Balance del mes" value={mxn(ing - gas)} tone={ing - gas < 0 ? "danger" : "ok"} />
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
          {esPago ? (
            <div className="sm:col-span-2">
              <Field label="Tarjeta que pagas" hint="Se registra también como abono de esa tarjeta">
                <Select value={tarjeta} onChange={(e) => setF({ ...f, tarjeta: e.target.value })} required>
                  {!db.cards.length && <option value="">Sin tarjetas</option>}
                  {db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}{c.terminacion ? ` •••• ${c.terminacion}` : ""}</option>)}
                </Select>
              </Field>
            </div>
          ) : tipo === "gasto" ? (
            <div className="sm:col-span-2"><Field label="Pagado con"><Select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}><option value="">Efectivo / débito</option>{db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}</option>)}</Select></Field></div>
          ) : null}
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

      <Section title="Movimientos por día">
        {!list ? <p className="text-sm text-muted">Cargando…</p> : !dias.length ? <Empty>Sin movimientos en este mes.</Empty> : (
          <div className="space-y-4">
            {dias.map((d) => (
              <Card key={d.fecha} className="p-0 sm:p-0">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <div className="text-sm font-semibold capitalize">{fDia.format(parse(d.fecha))}</div>
                  <div className="num flex gap-3 text-xs">
                    {d.ing > 0 && <span className="text-ok">+{mxn(d.ing)}</span>}
                    {d.gas > 0 && <span>−{mxn(d.gas)}</span>}
                  </div>
                </div>
                <div className="divide-y divide-border/60">
                  {d.ts.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {t.categoria}
                          {esPagoTx(t) && <span className="font-normal text-muted"> → {nombreTarjeta(t.tarjetaId)}</span>}
                          {t.nota ? <span className="font-normal text-muted"> · {t.nota}</span> : null}
                        </div>
                        {(t.metodo || esPagoTx(t)) && (
                          <div className="mt-0.5 text-xs text-muted">{esPagoTx(t) ? <Badge tone="accent">abono a tarjeta</Badge> : `Con ${nombreTarjeta(t.metodo)}`}</div>
                        )}
                      </div>
                      <div className={`num text-sm font-semibold ${t.tipo === "ingreso" ? "text-ok" : ""}`}>{t.tipo === "ingreso" ? "+" : "−"}{mxn(t.monto)}</div>
                      <Btn small variant="ghost" aria-label="Borrar movimiento" onClick={() => void borrar(t)}>✕</Btn>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
            <Card className="flex items-center justify-between text-sm font-semibold">
              <span className="capitalize">Total de {fmonth(mes)}</span>
              <span className="num">{mxn(ing - gas)} <span className="font-normal text-muted">(+{mxn(ing)} / −{mxn(gas)})</span></span>
            </Card>
          </div>
        )}
      </Section>
    </>
  );
}
