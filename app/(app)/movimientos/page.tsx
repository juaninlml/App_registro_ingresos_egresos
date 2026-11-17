"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useData, useTxRange } from "@/components/DataProvider";
import { BuscarModal } from "@/components/Buscar";
import { CuentaSelect, DisponibleCard } from "@/components/Cuentas";
import { FijosLista, movimientoDeFijo } from "@/components/Fijos";
import { IconAdelante, IconAtras, IconBorrar, IconBuscar, IconGasto, IconIngreso, IconMas, IconPagoTarjeta, IconTransferencia } from "@/components/icons";
import { AnimatedNumber, Segmented, useToast } from "@/components/motion";
import { Badge, Btn, Card, Field, IconBtn, Input, Modal, NumInput, PageHeader, Select, Skeleton, Stat, cx } from "@/components/ui";
import { addDays, addMonths, ahoraHM, fhora, fmesTitulo, fmonth, fshort, lunesDe, monthKey, weekday, ymd } from "@/lib/dates";
import { mxn, uid } from "@/lib/money";
import { creditos, debitos, esDebito } from "@/lib/cuentas";
import { esIngresoFijo, fijosDelMes, porCobrar, porPagar, type FijoDelMes } from "@/lib/fijos";
import { gastadoPorCategoria, nivelPresupuesto } from "@/lib/presupuesto";
import { PAGO_TARJETA, TRANSFERENCIA, type Payment, type Transaction } from "@/lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const corto = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const suma = (ts: Transaction[], tipo: Transaction["tipo"]) => ts.filter((t) => t.tipo === tipo).reduce((s, t) => s + t.monto, 0);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Clase = "ingreso" | "gasto" | "pago" | "transferencia";
const clase = (t: Transaction): Clase =>
  t.tipo === "ingreso" ? "ingreso" : t.tipo === "transferencia" ? "transferencia" : t.categoria === PAGO_TARJETA && t.tarjetaId ? "pago" : "gasto";
const TONO = { ingreso: "ok", gasto: "danger", pago: "accent", transferencia: "muted" } as const;
const ICONO = { ingreso: IconIngreso, gasto: IconGasto, pago: IconPagoTarjeta, transferencia: IconTransferencia } as const;
const SIGNO = { ingreso: "+", gasto: "−", pago: "−", transferencia: "" } as const;
const NOMBRE = { ingreso: "Ingreso", gasto: "Gasto", pago: "Pago", transferencia: "Transferencia" } as const;
type Tipo = Transaction["tipo"];

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
  const [editados, setEditados] = useState<Set<string>>(new Set());
  // movimiento que se está editando (null = alta nueva)
  const [editando, setEditando] = useState<Transaction | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<"semana" | "mes">("semana");
  const [ancla, setAncla] = useState(today);
  const [selDia, setSelDia] = useState(today);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const lunes = lunesDe(ancla);
  const mes = monthKey(ancla);
  const desde = vista === "semana" ? lunes : `${mes}-01`;
  const hasta = vista === "semana" ? addDays(lunes, 6) : addDays(addMonths(`${mes}-01`, 1), -1);
  const meses = [...new Set([monthKey(desde), monthKey(hasta)])];
  const { map, err, add, remove, update } = useTxRange(meses);

  const [tipo, setTipo] = useState<Tipo>("gasto");
  // metodo/destino null = usar la sugerencia (tarjeta de débito principal / otra cuenta)
  const vacio = { monto: "" as number | "", cat: "", nota: "", fecha: "", metodo: null as string | null, tarjeta: "", destino: null as string | null };
  const [f, setF] = useState(vacio);
  const [msg, setMsg] = useState<string | null>(null);

  const catsBase = tipo === "gasto" ? db.settings.categoriasGasto : db.settings.categoriasIngreso;
  const cats = tipo === "gasto" && !catsBase.includes(PAGO_TARJETA) ? [...catsBase, PAGO_TARJETA] : catsBase;
  const cat = f.cat && cats.includes(f.cat) ? f.cat : cats[0] ?? "Otros";
  const esPago = tipo === "gasto" && cat === PAGO_TARJETA;
  const esTransf = tipo === "transferencia";
  const credito = creditos(db.cards);
  const tarjeta = f.tarjeta && credito.some((c) => c.id === f.tarjeta) ? f.tarjeta : credito[0]?.id ?? "";
  // cuenta del movimiento: ingresos y pagos de tarjeta solo pueden ser débito o efectivo
  const cuentaPrincipal = debitos(db.cards)[0]?.id ?? "";
  const elegida = f.metodo ?? cuentaPrincipal;
  const soloDebito = tipo !== "gasto" || esPago;
  const cuenta = soloDebito && elegida && !esDebito(db.cards.find((c) => c.id === elegida)) ? cuentaPrincipal : elegida;
  // en transferencias: hacia dónde va el dinero (otra cuenta de débito, o efectivo si es un retiro)
  const sugerido = debitos(db.cards).find((c) => c.id !== cuenta)?.id ?? (cuenta ? "" : cuentaPrincipal);
  const destinoElegido = f.destino ?? sugerido;
  const destino = destinoElegido && !esDebito(db.cards.find((c) => c.id === destinoElegido)) ? sugerido : destinoElegido;
  const fecha = f.fecha || today;
  const nombreTarjeta = (id?: string) => {
    const c = db.cards.find((x) => x.id === id);
    return c ? `${c.banco} ${c.nombre}` : "tarjeta";
  };
  const esPagoTx = (t: Transaction) => t.tipo === "gasto" && t.categoria === PAGO_TARJETA && !!t.tarjetaId;
  const nombreCuenta = (id?: string) => (id ? nombreTarjeta(id) : "Efectivo");
  /** «Transferencia», «Retiro de efectivo» o «Depósito de efectivo», según las cuentas. */
  const tituloTransf = (t: Pick<Transaction, "metodo" | "destinoId">) => (!t.metodo ? "Depósito de efectivo" : !t.destinoId ? "Retiro de efectivo" : "Transferencia");
  /** «registrada» para una transferencia, «registrado» para un retiro o depósito. */
  const conGenero = (t: Pick<Transaction, "metodo" | "destinoId">, raiz: string) => raiz + (t.metodo && t.destinoId ? "a" : "o");

  const items = map ? meses.flatMap((m) => map[m] ?? []).filter((t) => t.fecha >= desde && t.fecha <= hasta) : null;
  const porDia = new Map<string, Transaction[]>();
  for (const t of items ?? []) porDia.set(t.fecha, [...(porDia.get(t.fecha) ?? []), t]);
  for (const [k, v] of porDia) porDia.set(k, [...v].sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? "")));
  const ing = suma(items ?? [], "ingreso");
  const gas = suma(items ?? [], "gasto");
  const pagosTarjeta = (items ?? []).filter(esPagoTx).reduce((s, t) => s + t.monto, 0);
  // gastos fijos del periodo: los que faltan por pagar ya cuentan en los egresos
  const fijosRango = map ? meses.flatMap((m) => fijosDelMes(db.fijos, map[m] ?? [], m, today, db.cards)).filter((x) => x.fecha >= desde && x.fecha <= hasta) : [];
  const fijosPend = porPagar(fijosRango);
  const fijosCobrar = porCobrar(fijosRango);
  const fijosMes = map ? fijosDelMes(db.fijos, map[mes] ?? [], mes, today, db.cards) : null;

  const mover = (dir: -1 | 1) => setAncla(vista === "semana" ? addDays(ancla, dir * 7) : addMonths(`${mes}-01`, dir));
  const domingo = addDays(lunes, 6);
  const diaSel = selDia >= lunes && selDia <= domingo ? selDia : today >= lunes && today <= domingo ? today : lunes;
  const etiqueta = vista === "semana"
    ? `${fshort(lunes)} – ${fshort(addDays(lunes, 6))}`
    : fmesTitulo(mes);

  /** Registra el pago de un gasto fijo como movimiento (queda ligado para no contarlo dos veces). */
  async function pagarFijo(x: FijoDelMes) {
    const t = movimientoDeFijo(x.fijo, monthKey(x.fecha), today);
    marcar(setRecientes, t.id, 2200);
    if (t.fecha >= lunes && t.fecha <= addDays(lunes, 6)) setSelDia(t.fecha);
    if (await add(t)) {
      const ingreso = esIngresoFijo(x);
      toast({
        tone: ingreso ? "ok" : "danger",
        icon: ingreso ? <IconIngreso size={18} /> : <IconGasto size={18} />,
        title: `${x.fijo.nombre} ${ingreso ? "cobrado" : "pagado"}`,
        detail: `${ingreso ? "+" : "−"}${mxn(t.monto)} · ${x.fijo.metodo ? `${ingreso ? "en" : "con"} ${nombreTarjeta(x.fijo.metodo)}` : "en efectivo"}`,
      });
    }
  }

  function irAForm(d: string) {
    if (editando) {
      // venía de editar: empezar en limpio (conservando la última categoría)
      setEditando(null);
      setF({ ...vacio, cat: f.cat, fecha: d });
    } else {
      setF((x) => ({ ...x, fecha: d }));
    }
    setMsg(null);
    setAbierto(true);
  }

  /** Abre el formulario con los datos del movimiento para corregirlo. */
  function editar(t: Transaction) {
    setEditando(t);
    setTipo(t.tipo);
    setF({ monto: t.monto, cat: t.tipo === "transferencia" ? f.cat : t.categoria, nota: t.nota ?? "", fecha: t.fecha, metodo: t.metodo ?? "", tarjeta: t.tarjetaId ?? "", destino: t.destinoId ?? "" });
    setMsg(null);
    setAbierto(true);
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (esPago && !tarjeta) {
      setMsg("Primero agrega una tarjeta de crédito para registrar pagos.");
      return;
    }
    if (esTransf && cuenta === destino) {
      setMsg("Elige cuentas distintas: el dinero tiene que salir de una y llegar a otra.");
      return;
    }
    setMsg(null);
    const previo = editando;
    const t: Transaction = {
      id: previo?.id ?? uid(),
      hora: previo?.hora ?? ahoraHM(), // se conserva la hora original: ordena el movimiento frente al ajuste de saldo
      fecha,
      tipo,
      monto: Number(f.monto),
      categoria: esTransf ? TRANSFERENCIA : cat,
      nota: f.nota.trim() || undefined,
      metodo: cuenta || undefined,
      tarjetaId: esPago ? tarjeta : undefined,
      destinoId: esTransf ? destino || undefined : undefined,
      fijoId: tipo === "gasto" ? previo?.fijoId : undefined,
    };
    // el abono ligado a un pago de tarjeta se crea, actualiza o quita junto con el movimiento (todo o nada)
    const ligado = db.payments.find((p) => p.txId === t.id);
    const abono: Payment | null = esPago
      ? { id: ligado?.id ?? uid(), fecha, monto: t.monto, destino: "card", targetId: tarjeta, nota: t.nota ?? "Pago desde movimientos", txId: t.id }
      : null;
    const extra = ligado || abono ? [{ key: "payments" as const, value: [...db.payments.filter((p) => p.txId !== t.id), ...(abono ? [abono] : [])] }] : [];

    // el formulario se cierra al instante para que se vea el cambio; si no se guarda, se reabre con los datos
    const antes = f;
    setAbierto(false);
    setEditando(null);
    setF(previo ? { ...vacio, cat: f.cat } : { ...f, monto: "", nota: "" });
    setGuardando(true);
    marcar(previo ? setEditados : setRecientes, t.id, 2200);
    if (fecha >= lunes && fecha <= addDays(lunes, 6)) setSelDia(fecha); // muestra el día donde quedó
    const ok = previo ? await update(previo, t, extra) : await add(t, extra);
    setGuardando(false);
    if (!ok) {
      setF(antes);
      setEditando(previo);
      setMsg("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
      setAbierto(true);
      return;
    }
    const k = clase(t);
    const Icono = ICONO[k];
    toast({
      tone: TONO[k],
      icon: <Icono size={18} />,
      title: previo
        ? k === "transferencia" ? `${tituloTransf(t)} ${conGenero(t, "actualizad")}` : `${NOMBRE[k]} actualizado`
        : esPago
          ? `Pago a ${nombreTarjeta(tarjeta)} registrado`
          : esTransf
            ? `${tituloTransf(t)} ${conGenero(t, "registrad")}`
            : `${NOMBRE[k]} registrado`,
      detail: esTransf
        ? `${mxn(t.monto)} · ${nombreCuenta(t.metodo)} → ${nombreCuenta(t.destinoId)}`
        : `${SIGNO[k]}${mxn(t.monto)} · ${esPago ? (previo ? "también se actualizó el abono" : "también se abonó a la tarjeta") : t.categoria}`,
    });

    // aviso de presupuesto: si con este gasto la categoría llega al 80 % de su tope (o lo pasa)
    const tope = db.settings.presupuestos?.[t.categoria];
    const m = t.fecha.slice(0, 7);
    if (tope && t.tipo === "gasto" && map?.[m]) {
      const lista = [...map[m].filter((x) => x.id !== t.id), t];
      const gastado = gastadoPorCategoria(lista, fijosDelMes(db.fijos, lista, m, today, db.cards))[t.categoria] ?? 0;
      const { pct, nivel, restante } = nivelPresupuesto(gastado, tope);
      if (nivel !== "ok") {
        toast({
          tone: nivel === "danger" ? "danger" : "warn",
          title: nivel === "danger" ? `Te pasaste del presupuesto de ${t.categoria}` : `Llevas ${Math.round(pct * 100)}% de ${t.categoria}`,
          detail: restante >= 0 ? `Te quedan ${mxn(restante)} de ${mxn(tope)} este mes` : `${mxn(-restante)} arriba del tope de ${mxn(tope)}`,
        });
      }
    }
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
      title: clase(t) === "transferencia" ? `${tituloTransf(t)} ${conGenero(t, "borrad")}` : `${NOMBRE[clase(t)]} borrado`,
      detail: `${clase(t) === "transferencia" ? `${nombreCuenta(t.metodo)} → ${nombreCuenta(t.destinoId)}` : t.categoria} · ${mxn(t.monto)}${ligados.length ? " · y su abono" : ""}`,
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
        className={cx("flex items-center gap-1 rounded-xl border border-border bg-surface p-1", recientes.has(t.id) && "row-new", editados.has(t.id) && "row-edited", saliendo.has(t.id) && "row-out")}
      >
        {/* toda la fila abre la edición; el botón de basura queda aparte */}
        <button
          type="button"
          onClick={() => editar(t)}
          aria-label={`Editar ${k === "transferencia" ? tituloTransf(t) : t.categoria} de ${mxn(t.monto)}`}
          className="press flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1.5 pl-1.5 pr-1 text-left hover:bg-surface-2/60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ color: `var(--${TONO[k]})`, background: `color-mix(in oklab, var(--${TONO[k]}) 15%, transparent)` }}>
            <Icono size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{k === "pago" ? `Pago a ${nombreTarjeta(t.tarjetaId)}` : k === "transferencia" ? tituloTransf(t) : t.categoria}</span>
            <span className="block truncate text-xs text-muted">
              {[
                fhora(t.hora),
                k === "transferencia" ? `${nombreCuenta(t.metodo)} → ${nombreCuenta(t.destinoId)}` : null,
                t.nota,
                k !== "transferencia" && t.metodo ? `${k === "ingreso" ? "En" : k === "pago" ? "Desde" : "Con"} ${nombreTarjeta(t.metodo)}` : null,
              ].filter(Boolean).join(" · ") || "Sin hora"}
            </span>
          </span>
          <span className={cx("num shrink-0 text-sm font-semibold", k === "ingreso" ? "text-ok" : k === "pago" ? "text-accent-text" : k === "transferencia" ? "text-muted" : "")}>{SIGNO[k]}{mxn(t.monto)}</span>
        </button>
        <IconBtn label={`Borrar ${k === "transferencia" ? tituloTransf(t) : t.categoria} de ${mxn(t.monto)}`} small onClick={() => void borrar(t)} className="hover:!text-danger"><IconBorrar size={17} /></IconBtn>
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
              <span className="min-w-32 flex-1 text-center text-sm font-semibold sm:flex-none">{etiqueta}</span>
              <Btn small onClick={() => { setAncla(today); setSelDia(today); }}>Hoy</Btn>
              <IconBtn label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"} onClick={() => mover(1)}><IconAdelante size={18} /></IconBtn>
            </div>
            <span className="flex items-center gap-1">
              <IconBtn label="Buscar movimientos" onClick={() => setBuscando(true)}><IconBuscar size={19} /></IconBtn>
              <Btn variant="primary" onClick={() => irAForm(vista === "semana" ? diaSel : today)}><IconMas size={18} />Agregar</Btn>
            </span>
          </div>
        </>
      } />
      {(err || msg) && <p role="alert" className="mb-3 text-sm text-danger">{err ?? msg}</p>}

      <DisponibleCard />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={`Ingresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? <AnimatedNumber value={ing + fijosCobrar} tone="ok" /> : <Skeleton className="mt-1 h-7 w-32" />} tone="ok" sub={fijosCobrar > 0 ? <>incluye <AnimatedNumber value={fijosCobrar} /> por cobrar</> : undefined} />
        <Stat label={`Egresos ${vista === "semana" ? "de la semana" : "del mes"}`} value={items ? <AnimatedNumber value={gas + fijosPend} tone={{ up: "danger", down: "ok" }} /> : <Skeleton className="mt-1 h-7 w-32" />} sub={
          fijosPend > 0 || pagosTarjeta > 0 ? (
            <>
              {fijosPend > 0 && <span className="block">incluye <AnimatedNumber value={fijosPend} /> de fijos por pagar</span>}
              {pagosTarjeta > 0 && <span className="block">incluye <AnimatedNumber value={pagosTarjeta} /> en pagos de tarjeta</span>}
            </>
          ) : undefined
        } />
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
                    {fijosRango.some((x) => x.fecha === d && x.estado !== "pagado" && esIngresoFijo(x)) && <span title="Ingreso fijo por cobrar" className="size-1.5 rounded-full border border-ok" />}
                    {fijosRango.some((x) => x.fecha === d && x.estado !== "pagado" && !esIngresoFijo(x)) && <span title="Gasto fijo por pagar" className="size-1.5 rounded-full border border-danger" />}
                  </span>
                </button>
              );
            })}
          </div>
          {(() => {
            const ts = porDia.get(diaSel) ?? [];
            const fijosDia = fijosRango.filter((x) => x.fecha === diaSel && x.estado !== "pagado");
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
                  {fijosDia.map((x) => {
                    const ingreso = esIngresoFijo(x);
                    return (
                      <div key={x.fijo.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border py-2.5 pl-2.5 pr-1.5">
                        <span className={cx("grid size-9 shrink-0 place-items-center rounded-full border border-dashed", ingreso ? "border-ok/50 text-ok" : "border-danger/50 text-danger")}>
                          {ingreso ? <IconIngreso size={18} /> : <IconGasto size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{x.fijo.nombre}</div>
                          <div className="truncate text-xs text-muted">{ingreso ? "Ingreso fijo por cobrar" : "Gasto fijo por pagar"} · {x.fijo.categoria}</div>
                        </div>
                        <div className="num shrink-0 text-sm font-semibold text-muted">{ingreso ? "+" : "−"}{mxn(x.fijo.monto)}</div>
                        <Btn small variant="primary" onClick={() => void pagarFijo(x)}>{ingreso ? "Cobrar" : "Pagar"}</Btn>
                      </div>
                    );
                  })}
                  {ts.length ? ts.map(mov) : fijosDia.length ? null : (
                    <div className="py-6 text-center text-sm text-muted">
                      <p>Sin movimientos este día.</p>
                      <button type="button" onClick={() => irAForm(diaSel)} className="mt-1 font-medium text-accent-text underline">Registrar uno</button>
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
                    <span>{fshort(dias[0])} – {fshort(dias[dias.length - 1])}</span>
                    <span className="num flex gap-3"><span className="text-ok">+{mxn(suma(ts, "ingreso"))}</span><span>−{mxn(suma(ts, "gasto"))}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <BuscarModal
        open={buscando}
        onClose={() => setBuscando(false)}
        onElegir={(t) => {
          setBuscando(false);
          setTimeout(() => editar(t), 180); // deja terminar de cerrarse el buscador
        }}
      />

      <section className="mb-6">
        <FijosLista month={mes} lista={fijosMes} onPagar={pagarFijo} />
      </section>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={editando ? `Editar ${esTransf ? "transferencia" : esPago ? "pago de tarjeta" : tipo}` : esTransf ? "Transferir entre cuentas" : esPago ? "Registrar pago de tarjeta" : tipo === "gasto" ? "Registrar gasto" : "Registrar ingreso"}
      >
        <div>
          <div className="mb-4">
            <Segmented
              label="Tipo de movimiento"
              value={tipo}
              onChange={setTipo}
              tones={{ gasto: "danger", ingreso: "ok", transferencia: "muted" }}
              options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }, { value: "transferencia", label: "Transferir" }]}
            />
          </div>
          {msg && <p role="alert" className="mb-3 text-sm text-danger">{msg}</p>}
          <form onSubmit={agregar} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Monto">
                <span className="relative block">
                  <span aria-hidden className={cx("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold", esTransf ? "text-muted" : tipo === "ingreso" ? "text-ok" : esPago ? "text-accent-text" : "text-danger")}>{esTransf ? "" : tipo === "ingreso" ? "+" : "−"}$</span>
                  <NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required autoFocus placeholder="0.00" className={cx("num !py-3 !text-2xl font-semibold", esTransf ? "pl-8" : "pl-11")} />
                </span>
              </Field>
            </div>
            {esTransf ? (
              <>
                <div className="col-span-2">
                  <Field label="Desde" hint={cuenta ? "Se resta del saldo de esta cuenta." : "Depósito de efectivo: el dinero sale de tu bolsillo."}>
                    <CuentaSelect value={cuenta} onChange={(v) => setF({ ...f, metodo: v })} solo="debito" />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Hacia" hint={destino ? "Se suma al saldo de esta cuenta." : "Retiro de efectivo: el dinero sale de la tarjeta a tu bolsillo."}>
                    <CuentaSelect value={destino} onChange={(v) => setF({ ...f, destino: v })} solo="debito" />
                  </Field>
                </div>
                <p className="col-span-2 -mt-1 text-xs text-muted">Una transferencia no cuenta como ingreso ni como gasto: solo mueve tu dinero de lugar.</p>
              </>
            ) : (
              <div className="col-span-2"><Field label="Categoría"><Select value={cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
            )}
            <div className="col-span-2"><Field label="Fecha" hint={editando ? undefined : "La hora se guarda sola al registrar"}><Input type="date" value={fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Field></div>
            <div className="col-span-2"><Field label="Nota"><Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={120} placeholder="Opcional" /></Field></div>
            {esPago ? (
              <div className="col-span-2">
                <Field label="Tarjeta de crédito que pagas" hint="Se registra también como abono de esa tarjeta">
                  <CuentaSelect value={tarjeta} onChange={(v) => setF({ ...f, tarjeta: v })} solo="credito" efectivo={false} required />
                </Field>
              </div>
            ) : null}
            <div className={cx("col-span-2", esTransf && "hidden")}>
              <Field
                label={esPago ? "Pagado desde" : tipo === "ingreso" ? "Depositado en" : "Pagado con"}
                hint={!cuenta ? "En efectivo: no cambia el saldo de ninguna tarjeta." : esDebito(db.cards.find((c) => c.id === cuenta)) ? (tipo === "ingreso" ? "Se suma al saldo de esa tarjeta de débito." : "Se resta del saldo de esa tarjeta de débito.") : "Con crédito no sale de tu dinero; se suma a la deuda de la tarjeta."}
              >
                <CuentaSelect value={cuenta} onChange={(v) => setF({ ...f, metodo: v })} solo={soloDebito ? "debito" : undefined} />
              </Field>
            </div>
            <div className="col-span-2 flex items-end">
              <Btn variant="primary" type="submit" disabled={!map || guardando} className="w-full">
                {guardando ? "Guardando…" : editando ? "Guardar cambios" : esTransf ? "Transferir" : esPago ? "Registrar pago" : tipo === "gasto" ? "Registrar gasto" : "Registrar ingreso"}
              </Btn>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
