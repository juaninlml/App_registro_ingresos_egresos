"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useData, useTxRange } from "@/components/DataProvider";
import { IconAdelante, IconAtras, IconBorrar, IconGasto, IconIngreso, IconMas, IconPagoTarjeta } from "@/components/icons";
import { AnimatedNumber, Segmented, useToast } from "@/components/motion";
import { Badge, Btn, Card, Field, IconBtn, Input, Modal, NumInput, PageHeader, Select, Skeleton, Stat, cx } from "@/components/ui";
import { addDays, addMonths, ahoraHM, fhora, fmonth, fshort, lunesDe, monthKey, weekday, ymd } from "@/lib/dates";
import { mxn, uid } from "@/lib/money";
import { PAGO_TARJETA, type Transaction } from "@/lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const corto = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const suma = (ts: Transaction[], tipo: Transaction["tipo"]) => ts.filter((t) => t.tipo === tipo).reduce((s, t) => s + t.monto, 0);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Clase = "ingreso" | "gasto" | "pago";
const clase = (t: Transaction): Clase => (t.tipo === "ingreso" ? "ingreso" : t.categoria === PAGO_TARJETA && t.tarjetaId ? "pago" : "gasto");
const TONO = { ingreso: "ok", gasto: "danger", pago: "accent" } as const;
const ICONO = { ingreso: IconIngreso, gasto: IconGasto, pago: IconPagoTarjeta } as const;

/** Agrega un id a un conjunto por un rato (para animaciones que se apagan solas). */
function marcar(set: (fn: (s: Set<string>) => Set<string>) => void, id: string, ms: number) {
  set((s) => new Set(s).add(id));
  setTimeout(() => set((s) => {
    const n = new Set(s);
    n.delete(id);
    return n;
  }), ms);
}

export default function Movimientos() {
  const { db, today } = useData();
  const toast = useToast();
  const dbRef = useRef(db);
  useEffect(() => {
    dbRef.current = db;
  }, [db]);
  // filas recién agregadas (se iluminan) y filas que se están borrando (salen animadas)
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
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
    // el movimiento y el abono a la tarjeta se guardan juntos: o ambos o ninguno
    const abono = esPago
      ? [{ key: "payments" as const, value: [...db.payments, { id: uid(), fecha, monto: t.monto, destino: "card" as const, targetId: tarjeta, nota: t.nota ?? "Pago desde movimientos", txId: t.id }] }]
      : [];
    setGuardando(true);
    marcar(setRecientes, t.id, 2200);
    if (fecha >= lunes && fecha <= addDays(lunes, 6)) setSelDia(fecha); // muestra el día donde aterrizó
    const ok = await add(t, abono);
    setGuardando(false);
    if (!ok) return;
    setF({ ...f, monto: "", nota: "" });
    setAbierto(false);
    const k = clase(t);
    const Icono = ICONO[k];
    toast({
      tone: TONO[k],
      icon: <Icono size={18} />,
      title: esPago ? `Pago a ${nombreTarjeta(tarjeta)} registrado` : `${t.tipo === "ingreso" ? "Ingreso" : "Gasto"} registrado`,
      detail: `${t.tipo === "ingreso" ? "+" : "−"}${mxn(t.monto)} · ${esPago ? "también se abonó a la tarjeta" : t.categoria}`,
    });
  }

  /** Borra sin preguntar: la fila sale animada y el aviso permite deshacer. */
  async function borrar(t: Transaction) {
    const ligados = db.payments.filter((p) => p.txId === t.id);
    setSaliendo((s) => new Set(s).add(t.id));
    await espera(190);
    const ok = await remove(t, ligados.length ? [{ key: "payments", value: db.payments.filter((p) => p.txId !== t.id) }] : []);
    setSaliendo((s) => {
      const n = new Set(s);
      n.delete(t.id);
      return n;
    });
    if (!ok) return;
    toast({
      tone: "muted",
      icon: <IconBorrar size={18} />,
      title: esPagoTx(t) ? "Pago borrado" : `${t.tipo === "ingreso" ? "Ingreso" : "Gasto"} borrado`,
      detail: `${t.categoria} · ${mxn(t.monto)}${ligados.length ? " · y su abono" : ""}`,
      action: {
        label: "Deshacer",
        onClick: () => {
          marcar(setRecientes, t.id, 2200);
          const pagos = dbRef.current.payments;
          void add(t, ligados.length ? [{ key: "payments", value: [...pagos, ...ligados] }] : []);
        },
      },
    });
  }

  const mov = (t: Transaction) => {
    const k = clase(t);
    const Icono = ICONO[k];
    return (
      <div
        key={t.id}
        style={{ "--tone": `var(--${TONO[k]})` } as CSSProperties}
        className={cx("flex items-center gap-3 rounded-xl border border-border bg-surface py-2.5 pl-2.5 pr-1", recientes.has(t.id) && "row-new", saliendo.has(t.id) && "row-out")}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ color: `var(--${TONO[k]})`, background: `color-mix(in oklab, var(--${TONO[k]}) 15%, transparent)` }}>
          <Icono size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{k === "pago" ? `Pago a ${nombreTarjeta(t.tarjetaId)}` : t.categoria}</div>
          <div className="truncate text-xs text-muted">
            {[fhora(t.hora), t.nota, k !== "pago" && t.metodo ? `Con ${nombreTarjeta(t.metodo)}` : null].filter(Boolean).join(" · ") || "Sin hora"}
          </div>
        </div>
        <div className={cx("num shrink-0 text-sm font-semibold", k === "ingreso" ? "text-ok" : k === "pago" ? "text-accent" : "")}>{t.tipo === "ingreso" ? "+" : "−"}{mxn(t.monto)}</div>
        <IconBtn label={`Borrar ${t.categoria} de ${mxn(t.monto)}`} small onClick={() => void borrar(t)} className="hover:!text-danger"><IconBorrar size={17} /></IconBtn>
      </div>
    );
  };

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
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <Segmented label="Vista" value={vista} onChange={setVista} options={[{ value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }]} />
            {/* en celular la navegación ocupa su propia fila completa */}
            <div className="order-last flex w-full items-center justify-between gap-1 rounded-xl bg-surface-2/60 p-0.5 sm:order-none sm:w-auto sm:bg-transparent sm:p-0">
              <IconBtn label={vista === "semana" ? "Semana anterior" : "Mes anterior"} onClick={() => mover(-1)}><IconAtras size={18} /></IconBtn>
              <span className="min-w-32 flex-1 text-center text-sm font-semibold capitalize sm:flex-none">{etiqueta}</span>
              <Btn small onClick={() => { setAncla(today); setSelDia(today); }}>Hoy</Btn>
              <IconBtn label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"} onClick={() => mover(1)}><IconAdelante size={18} /></IconBtn>
            </div>
            <Btn variant="primary" onClick={() => irAForm(vista === "semana" ? diaSel : today)}><IconMas size={18} />Agregar</Btn>
          </div>
        </>
      } />
      {(err || msg) && <p role="alert" className="mb-3 text-sm text-danger">{err ?? msg}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={`Ingresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? <AnimatedNumber value={ing} tone="ok" /> : <Skeleton className="mt-1 h-7 w-32" />} tone="ok" />
        <Stat label={`Egresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? <AnimatedNumber value={gas} tone="danger" /> : <Skeleton className="mt-1 h-7 w-32" />} sub={pagosTarjeta > 0 ? <>incluye <AnimatedNumber value={pagosTarjeta} /> en pagos de tarjeta</> : undefined} />
      </div>

      {!items ? <Skeleton className="mb-6 h-72 rounded-2xl" /> : vista === "semana" ? (
        <div className="mb-6">
          <div className="mb-3 grid grid-cols-7 gap-1.5 sm:gap-2">
            {DIAS.map((nombre, i) => {
              const d = addDays(lunes, i);
              const tot = totalDia(d);
              const sel = d === diaSel;
              return (
                <button key={d} type="button" onClick={() => setSelDia(d)} aria-pressed={sel} aria-label={`${nombre} ${ymd(d).day}`}
                  className={cx("press flex flex-col items-center rounded-xl border px-1 py-2 text-center", sel ? "border-accent bg-accent-soft" : d === today ? "border-accent/60 bg-surface" : "border-border bg-surface hover:border-accent/50")}>
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
                  <IconBtn label={`Agregar movimiento el ${nombre} ${ymd(diaSel).day}`} onClick={() => irAForm(diaSel)} className="bg-accent !text-accent-fg hover:bg-accent hover:opacity-90"><IconMas size={20} /></IconBtn>
                </div>
                <div className="space-y-2 p-3">
                  {ts.length ? ts.map(mov) : (
                    <div className="py-6 text-center text-sm text-muted">
                      <p>Sin movimientos este día.</p>
                      <button type="button" onClick={() => irAForm(diaSel)} className="mt-1 font-medium text-accent underline">Registrar uno</button>
                    </div>
                  )}
                </div>
                {ts.length > 0 && (
                  <div className="num flex justify-between gap-3 border-t border-border px-4 py-2.5 text-sm font-semibold">
                    <span className="text-ok">+<AnimatedNumber value={tot.ing} /></span>
                    <span>−<AnimatedNumber value={tot.gas} /></span>
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
                    className={cx("press flex min-h-16 flex-col items-stretch rounded-lg border p-1 text-left text-[10px] leading-tight hover:border-accent sm:min-h-20 sm:p-1.5 sm:text-xs", d === today ? "border-accent bg-accent-soft" : "border-border bg-surface-2/40")}>
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

      <Modal open={abierto} onClose={() => setAbierto(false)} title={esPago ? "Registrar pago de tarjeta" : tipo === "gasto" ? "Registrar gasto" : "Registrar ingreso"}>
        <div>
          <div className="mb-4">
            <Segmented label="Tipo de movimiento" value={tipo} onChange={setTipo} tones={{ gasto: "danger", ingreso: "ok" }} options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]} />
          </div>
          {msg && <p role="alert" className="mb-3 text-sm text-danger">{msg}</p>}
          <form onSubmit={agregar} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Monto">
                <span className="relative block">
                  <span aria-hidden className={cx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold", tipo === "ingreso" ? "text-ok" : esPago ? "text-accent" : "text-danger")}>{tipo === "ingreso" ? "+" : "−"}$</span>
                  <NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required autoFocus placeholder="0.00" className="num !py-3 pl-11 !text-2xl font-semibold" />
                </span>
              </Field>
            </div>
            <div className="col-span-2"><Field label="Categoría"><Select value={cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
            <div className="col-span-2"><Field label="Fecha" hint="La hora se guarda sola al registrar"><Input type="date" value={fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Field></div>
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
            <div className="col-span-2 flex items-end">
              <Btn variant="primary" type="submit" disabled={!map || guardando} className="w-full">
                {guardando ? "Guardando…" : esPago ? "Registrar pago" : tipo === "gasto" ? "Registrar gasto" : "Registrar ingreso"}
              </Btn>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
