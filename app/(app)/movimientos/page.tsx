"use client";
import { useState } from "react";
import { useData, useTxRange } from "@/components/DataProvider";
import { Badge, Btn, Card, Field, Input, Modal, NumInput, PageHeader, Select, Stat, cx } from "@/components/ui";
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
  const [selDia, setSelDia] = useState(today);
  const [abierto, setAbierto] = useState(false);

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
  const domingo = addDays(lunes, 6);
  const diaSel = selDia >= lunes && selDia <= domingo ? selDia : today >= lunes && today <= domingo ? today : lunes;
  const etiqueta = vista === "semana"
    ? `${fshort(lunes)} – ${fshort(addDays(lunes, 6))}`
    : fmonth(mes);

  function irAForm(d: string) {
    setF((x) => ({ ...x, fecha: d }));
    setMsg(null);
    setAbierto(true);
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
    setAbierto(false);
  }

  async function borrar(t: Transaction) {
    if (!confirm(esPagoTx(t) ? "¿Borrar este pago? También se quitará el abono de la tarjeta." : "¿Borrar este movimiento?")) return;
    if ((await remove(t)) && db.payments.some((p) => p.txId === t.id)) {
      await save("payments", db.payments.filter((p) => p.txId !== t.id));
    }
  }

  function Mov({ t }: { t: Transaction }) {
    const tono = t.tipo === "ingreso" ? "border-ok/50 bg-ok-soft" : esPagoTx(t) ? "border-accent/50 bg-accent-soft" : "border-danger/40 bg-danger-soft";
    return (
      <div className={cx("flex items-center gap-3 rounded-xl border px-3 py-2.5", tono)}>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">{fhora(t.hora) || "Sin hora"}</div>
          <div className="truncate text-sm font-bold">{t.categoria}{esPagoTx(t) && <span className="font-normal text-muted"> → {nombreTarjeta(t.tarjetaId)}</span>}</div>
          {(t.nota || (!esPagoTx(t) && t.metodo)) && <div className="truncate text-xs text-muted">{t.nota}{!esPagoTx(t) && t.metodo ? `${t.nota ? " · " : ""}Con ${nombreTarjeta(t.metodo)}` : ""}</div>}
        </div>
        <div className={cx("num shrink-0 text-sm font-bold", t.tipo === "ingreso" && "text-ok")}>{t.tipo === "ingreso" ? "+" : "−"}{mxn(t.monto)}</div>
        <button type="button" aria-label="Borrar movimiento" onClick={() => void borrar(t)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger">✕</button>
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
            <Btn small onClick={() => { setAncla(today); setSelDia(today); }}>Hoy</Btn>
          </div>
          <Btn small variant="primary" onClick={() => irAForm(vista === "semana" ? diaSel : today)}>+ Agregar</Btn>
        </>
      } />
      {(err || msg) && <p role="alert" className="mb-3 text-sm text-danger">{err ?? msg}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={`Ingresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? mxn(ing) : "…"} tone="ok" />
        <Stat label={`Egresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? mxn(gas) : "…"} sub={pagosTarjeta > 0 ? `incluye ${mxn(pagosTarjeta)} en pagos de tarjeta` : undefined} />
      </div>

      {!items ? <p className="mb-6 text-sm text-muted">Cargando…</p> : vista === "semana" ? (
        <div className="mb-6">
          <div className="mb-3 grid grid-cols-7 gap-1.5 sm:gap-2">
            {DIAS.map((nombre, i) => {
              const d = addDays(lunes, i);
              const tot = totalDia(d);
              const sel = d === diaSel;
              return (
                <button key={d} type="button" onClick={() => setSelDia(d)} aria-pressed={sel} aria-label={`${nombre} ${ymd(d).day}`}
                  className={cx("flex flex-col items-center rounded-xl border px-1 py-2 text-center transition", sel ? "border-accent bg-accent-soft" : d === today ? "border-accent/60 bg-surface" : "border-border bg-surface hover:border-accent/50")}>
                  <span className="text-[11px] font-semibold text-muted sm:text-xs">{nombre.slice(0, 3)}</span>
                  <span className="num text-base font-bold sm:text-lg">{ymd(d).day}</span>
                  <span className="mt-1 flex h-1.5 gap-1">
                    {tot.ing > 0 && <span className="size-1.5 rounded-full bg-ok" />}
                    {tot.gas > 0 && <span className="size-1.5 rounded-full bg-danger" />}
                  </span>
                </button>
              );
            })}
          </div>
          {(() => {
            const ts = porDia.get(diaSel) ?? [];
            const tot = totalDia(diaSel);
            const nombre = DIAS[(weekday(diaSel) + 6) % 7];
            return (
              <div className={cx("overflow-hidden rounded-2xl border bg-surface", diaSel === today ? "border-accent" : "border-border")}>
                <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{nombre}</span>
                    {diaSel === today && <Badge tone="accent">Hoy</Badge>}
                    <span className="num text-xl font-bold">{ymd(diaSel).day}</span>
                  </div>
                  <button type="button" aria-label={`Agregar movimiento el ${nombre} ${ymd(diaSel).day}`} onClick={() => irAForm(diaSel)} className="grid size-9 place-items-center rounded-full bg-accent text-lg font-semibold text-accent-fg">+</button>
                </div>
                <div className="space-y-2 p-3">
                  {ts.length ? ts.map((t) => <Mov key={t.id} t={t} />) : <p className="py-6 text-center text-sm text-muted">Sin movimientos este día</p>}
                </div>
                {ts.length > 0 && (
                  <div className="num flex justify-between gap-3 border-t border-border px-4 py-2.5 text-sm font-semibold">
                    <span className="text-ok">{tot.ing > 0 ? `+${mxn(tot.ing)}` : "Ingresos $0.00"}</span>
                    <span>{tot.gas > 0 ? `−${mxn(tot.gas)}` : "Egresos $0.00"}</span>
                  </div>
                )}
              </div>
            );
          })()}
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
                  <button key={d} type="button" onClick={() => { setAncla(d); setSelDia(d); setVista("semana"); }} aria-label={`Ver semana del ${d}`}
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

      <Modal open={abierto} onClose={() => setAbierto(false)} title={tipo === "gasto" ? "Agregar gasto" : "Agregar ingreso"}>
        <div>
          <div className="mb-3 inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {(["gasto", "ingreso"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded-lg px-4 py-1.5 font-medium ${tipo === t ? "bg-surface shadow-sm" : "text-muted"}`}>{t === "gasto" ? "Gasto" : "Ingreso"}</button>
            ))}
          </div>
          {msg && <p role="alert" className="mb-3 text-sm text-danger">{msg}</p>}
          <form onSubmit={agregar} className="grid grid-cols-2 gap-3">
            <div><Field label="Monto"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field></div>
            <div className="col-span-2"><Field label="Categoría"><Select value={cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
            <div><Field label="Fecha" hint="La hora se guarda sola al registrar"><Input type="date" value={fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Field></div>
            <div className="col-span-2"><Field label="Nota"><Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={120} placeholder="Opcional" /></Field></div>
            {esPago ? (
              <div className="col-span-2">
                <Field label="Tarjeta que pagas" hint="Se registra también como abono de esa tarjeta">
                  <Select value={tarjeta} onChange={(e) => setF({ ...f, tarjeta: e.target.value })} required>
                    {!db.cards.length && <option value="">Sin tarjetas</option>}
                    {db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}{c.terminacion ? ` •••• ${c.terminacion}` : ""}</option>)}
                  </Select>
                </Field>
              </div>
            ) : tipo === "gasto" ? (
              <div className="col-span-2"><Field label="Pagado con"><Select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}><option value="">Efectivo / débito</option>{db.cards.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}</option>)}</Select></Field></div>
            ) : null}
            <div className="col-span-2 flex items-end"><Btn variant="primary" type="submit" disabled={!map} className="w-full">Agregar</Btn></div>
          </form>
        </div>
      </Modal>
    </>
  );
}
