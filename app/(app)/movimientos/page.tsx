"use client";
import { useRef, useState } from "react";
import { useData, useTxRange } from "@/components/DataProvider";
import { Badge, Btn, Card, Empty, Field, Input, NumInput, PageHeader, Select, Stat, cx } from "@/components/ui";
import { addDays, addMonths, ahoraHM, fhora, fmonth, fshort, lunesDe, monthKey, weekday, ymd } from "@/lib/dates";
import { mxn, uid } from "@/lib/money";
import { PAGO_TARJETA, type Transaction } from "@/lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const corto = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const suma = (ts: Transaction[], tipo: Transaction["tipo"]) => ts.filter((t) => t.tipo === tipo).reduce((s, t) => s + t.monto, 0);

export default function Movimientos() {
  const { db, save, today } = useData();
  const [vista, setVista] = useState<"semana" | "mes">("semana");
  const [ancla, setAncla] = useState(today);
  const formRef = useRef<HTMLDivElement>(null);

  const lunes = lunesDe(ancla);
  const mes = monthKey(ancla);
  const desde = vista === "semana" ? lunes : `${mes}-01`;
  const hasta = vista === "semana" ? addDays(lunes, 6) : addDays(addMonths(`${mes}-01`, 1), -1);
  const meses = [...new Set([monthKey(desde), monthKey(hasta)])];
  const { map, err, add, remove } = useTxRange(meses);

  const [tipo, setTipo] = useState<"gasto" | "ingreso">("gasto");
  const [f, setF] = useState({ monto: "" as number | "", cat: "", nota: "", fecha: "", metodo: "", tarjeta: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const catsBase = tipo === "gasto" ? db.settings.categoriasGasto : db.settings.categoriasIngreso;
  const cats = tipo === "gasto" && !catsBase.includes(PAGO_TARJETA) ? [...catsBase, PAGO_TARJETA] : catsBase;
  const cat = f.cat && cats.includes(f.cat) ? f.cat : cats[0] ?? "Otros";
  const esPago = tipo === "gasto" && cat === PAGO_TARJETA;
  const tarjeta = f.tarjeta && db.cards.some((c) => c.id === f.tarjeta) ? f.tarjeta : db.cards[0]?.id ?? "";
  const fecha = f.fecha || today;
  const nombreTarjeta = (id?: string) => {
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };
  const esPagoTx = (t: Transaction) => t.tipo === "gasto" && t.categoria === PAGO_TARJETA && !!t.tarjetaId;

  const items = map ? meses.flatMap((m) => map[m] ?? []).filter((t) => t.fecha >= desde && t.fecha <= hasta) : null;
  const porDia = new Map<string, Transaction[]>();
  for (const t of items ?? []) porDia.set(t.fecha, [...(porDia.get(t.fecha) ?? []), t]);
  for (const [k, v] of porDia) porDia.set(k, [...v].sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? "")));
  const ing = suma(items ?? [], "ingreso");
  const gas = suma(items ?? [], "gasto");
  const pagosTarjeta = (items ?? []).filter(esPagoTx).reduce((s, t) => s + t.monto, 0);

  const mover = (dir: -1 | 1) => setAncla(vista === "semana" ? addDays(ancla, dir * 7) : addMonths(`${mes}-01`, dir));
  const etiqueta = vista === "semana"
    ? `${fshort(lunes)} – ${fshort(addDays(lunes, 6))}`
    : fmonth(mes);

  function irAForm(d: string) {
    setF((x) => ({ ...x, fecha: d }));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (esPago && !tarjeta) {
      setMsg("Primero agrega una tarjeta para registrar pagos.");
      return;
    }
    setMsg(null);
    const t: Transaction = {
      id: uid(), fecha, hora: ahoraHM(), tipo, monto: Number(f.monto), categoria: cat, nota: f.nota.trim() || undefined,
      metodo: !esPago && tipo === "gasto" ? f.metodo || undefined : undefined,
      tarjetaId: esPago ? tarjeta : undefined,
    };
    if (!(await add(t))) return;
    if (esPago) {
      const ok = await save("payments", [...db.payments, { id: uid(), fecha, monto: t.monto, destino: "card", targetId: tarjeta, nota: t.nota ?? "Pago desde movimientos", txId: t.id }]);
      if (!ok) {
        await remove(t); // sin el abono no se deja el movimiento a medias
        setMsg("No se pudo registrar el abono a la tarjeta; no se guardó el movimiento.");
        return;
      }
    }
    setF({ ...f, monto: "", nota: "" });
  }

  async function borrar(t: Transaction) {
    if (!confirm(esPagoTx(t) ? "¿Borrar este pago? También se quitará el abono de la tarjeta." : "¿Borrar este movimiento?")) return;
    if ((await remove(t)) && db.payments.some((p) => p.txId === t.id)) {
      await save("payments", db.payments.filter((p) => p.txId !== t.id));
    }
  }

  function Mov({ t }: { t: Transaction }) {
    const tono = t.tipo === "ingreso" ? "border-l-ok bg-ok-soft" : esPagoTx(t) ? "border-l-accent bg-accent-soft" : "border-l-danger bg-danger-soft";
    return (
      <div className={cx("rounded-lg border-l-4 px-2.5 py-2 text-xs", tono)}>
        <div className="flex items-start justify-between gap-1">
          <span className="font-medium text-muted">{fhora(t.hora) || "—"}</span>
          <button type="button" aria-label="Borrar movimiento" onClick={() => void borrar(t)} className="-mr-1 -mt-0.5 rounded px-1 text-muted hover:text-danger">✕</button>
        </div>
        <div className="mt-0.5 text-sm font-semibold leading-tight">{t.categoria}{esPagoTx(t) && <span className="font-normal text-muted"> → {nombreTarjeta(t.tarjetaId)}</span>}</div>
        {t.nota && <div className="mt-0.5 break-words text-muted">{t.nota}</div>}
        {!esPagoTx(t) && t.metodo && <div className="mt-0.5 text-muted">Con {nombreTarjeta(t.metodo)}</div>}
        <div className={cx("num mt-1 text-sm font-bold", t.tipo === "ingreso" && "text-ok")}>{t.tipo === "ingreso" ? "+" : "−"}{mxn(t.monto)}</div>
      </div>
    );
  }

  // Calendario del mes
  const primer = `${mes}-01`;
  const offset = (weekday(primer) + 6) % 7;
  const nDias = ymd(hasta).day;
  const celdas: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDias }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  while (celdas.length % 7) celdas.push(null);
  const semanasMes = Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
  const totalDia = (d: string) => ({ ing: suma(porDia.get(d) ?? [], "ingreso"), gas: suma(porDia.get(d) ?? [], "gasto") });

  return (
    <>
      <PageHeader title="Ingresos y gastos" actions={
        <>
          <div className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {(["semana", "mes"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setVista(v)} className={cx("rounded-lg px-3 py-1 font-medium capitalize", vista === v ? "bg-surface shadow-sm" : "text-muted")}>{v}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Btn small onClick={() => mover(-1)} aria-label="Anterior">‹</Btn>
            <span className="min-w-36 text-center text-sm font-semibold capitalize">{etiqueta}</span>
            <Btn small onClick={() => mover(1)} aria-label="Siguiente">›</Btn>
            <Btn small onClick={() => setAncla(today)}>Hoy</Btn>
          </div>
        </>
      } />
      {(err || msg) && <p role="alert" className="mb-3 text-sm text-danger">{err ?? msg}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={`Ingresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? mxn(ing) : "…"} tone="ok" />
        <Stat label={`Egresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? mxn(gas) : "…"} sub={pagosTarjeta > 0 ? `incluye ${mxn(pagosTarjeta)} en pagos de tarjeta` : undefined} />
      </div>

      {!items ? <p className="mb-6 text-sm text-muted">Cargando…</p> : vista === "semana" ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {DIAS.map((nombre, i) => {
            const d = addDays(lunes, i);
            const ts = porDia.get(d) ?? [];
            const tot = totalDia(d);
            const hoy = d === today;
            return (
              <div key={d} className={cx("flex min-h-28 flex-col rounded-2xl border bg-surface", hoy ? "border-accent" : "border-border")}>
                <div className="flex items-center justify-between gap-1 border-b border-border px-3 py-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold">{nombre}</span>
                    <span className="num text-lg font-bold">{ymd(d).day}</span>
                    {hoy && <Badge tone="accent">Hoy</Badge>}
                  </div>
                  <button type="button" aria-label={`Agregar movimiento el ${nombre} ${ymd(d).day}`} onClick={() => irAForm(d)} className="grid size-7 place-items-center rounded-full bg-surface-2 text-base text-muted hover:text-fg">+</button>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {ts.length ? ts.map((t) => <Mov key={t.id} t={t} />) : <p className="px-1 py-2 text-xs text-muted">Sin movimientos</p>}
                </div>
                {ts.length > 0 && (
                  <div className="num flex justify-between gap-2 border-t border-border px-3 py-1.5 text-xs">
                    <span className="text-ok">{tot.ing > 0 ? `+${mxn(tot.ing)}` : ""}</span>
                    <span>{tot.gas > 0 ? `−${mxn(tot.gas)}` : ""}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-6">
          <Card className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted sm:text-xs">
              {DIAS.map((n) => <div key={n}>{n.slice(0, 3)}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {celdas.map((d, i) => {
                if (!d) return <div key={i} />;
                const tot = totalDia(d);
                return (
                  <button key={d} type="button" onClick={() => { setAncla(d); setVista("semana"); }} aria-label={`Ver semana del ${d}`}
                    className={cx("flex min-h-16 flex-col items-stretch rounded-lg border p-1 text-left text-[10px] leading-tight transition hover:border-accent sm:min-h-20 sm:p-1.5 sm:text-xs", d === today ? "border-accent bg-accent-soft" : "border-border bg-surface-2/40")}>
                    <span className="num text-xs font-bold sm:text-sm">{ymd(d).day}</span>
                    {tot.ing > 0 && <span className="num mt-0.5 truncate text-ok">+{corto(tot.ing)}</span>}
                    {tot.gas > 0 && <span className="num truncate">−{corto(tot.gas)}</span>}
                  </button>
                );
              })}
            </div>
          </Card>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-muted">Total por semana</div>
            <ul className="divide-y divide-border/60 text-sm">
              {semanasMes.map((sem, i) => {
                const dias = sem.filter((x): x is string => !!x);
                const ts = dias.flatMap((d) => porDia.get(d) ?? []);
                return (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="capitalize">{fshort(dias[0])} – {fshort(dias[dias.length - 1])}</span>
                    <span className="num flex gap-3"><span className="text-ok">+{mxn(suma(ts, "ingreso"))}</span><span>−{mxn(suma(ts, "gasto"))}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {items && !items.length && <div className="mb-6"><Empty>Sin movimientos en este periodo.</Empty></div>}

      <div ref={formRef}>
        <Card className="mb-6">
          <div className="mb-3 inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {(["gasto", "ingreso"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded-lg px-4 py-1.5 font-medium ${tipo === t ? "bg-surface shadow-sm" : "text-muted"}`}>{t === "gasto" ? "Gasto" : "Ingreso"}</button>
            ))}
          </div>
          <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2"><Field label="Monto"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field></div>
            <div className="sm:col-span-2"><Field label="Categoría"><Select value={cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
            <div className="sm:col-span-2"><Field label="Fecha" hint="La hora se guarda sola al registrar"><Input type="date" value={fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Field></div>
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
            <div className="flex items-end sm:col-span-1"><Btn variant="primary" type="submit" disabled={!map} className="w-full">Agregar</Btn></div>
          </form>
        </Card>
      </div>
    </>
  );
}
