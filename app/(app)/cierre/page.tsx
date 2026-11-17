"use client";
import { useState } from "react";
import { useData, useTxMonths } from "@/components/DataProvider";
import { IconAdelante, IconAtras } from "@/components/icons";
import { AnimatedNumber, useToast } from "@/components/motion";
import { Btn, Card, Empty, IconBtn, PageHeader, Section, Skeleton, Stat, cx } from "@/components/ui";
import { addMonthKey, fmesTitulo, fmonth, monthKey } from "@/lib/dates";
import { fijosDelMes, porCobrar, porPagar } from "@/lib/fijos";
import { mxn, round2 } from "@/lib/money";
import { gastadoPorCategoria, nivelPresupuesto } from "@/lib/presupuesto";
import { PAGO_TARJETA, type Transaction } from "@/lib/types";

const sumar = (ts: Transaction[], tipo: Transaction["tipo"]) => round2(ts.filter((t) => t.tipo === tipo).reduce((s, t) => s + t.monto, 0));
const mesCorto = (k: string) => fmonth(k).split(" ")[0];

/**
 * Cierre de mes al estilo kakeibo: las cuatro preguntas (cuánto tenías, cuánto querías ahorrar,
 * cuánto gastaste y cómo mejorar), con el gasto por categoría contra el mes anterior y el presupuesto.
 */
export default function Cierre() {
  const { db, save, today } = useData();
  const toast = useToast();
  const hoy = monthKey(today);
  const [mes, setMes] = useState(hoy);
  const anterior = addMonthKey(mes, -1);
  const txs = useTxMonths([anterior, mes]);
  const [nota, setNota] = useState<{ mes: string; texto: string } | null>(null);
  const texto = nota?.mes === mes ? nota.texto : db.settings.notasMes?.[mes] ?? "";
  const guardada = (db.settings.notasMes?.[mes] ?? "") === texto;

  const lista = txs?.[mes] ?? [];
  const previa = txs?.[anterior] ?? [];
  // el mes en curso todavía tiene fijos por pagar o por cobrar: se cuentan como proyección
  const enCurso = mes === hoy;
  const fijos = enCurso && txs ? fijosDelMes(db.fijos, lista, mes, today, db.cards) : [];
  const ingresos = round2(sumar(lista, "ingreso") + porCobrar(fijos));
  const egresos = round2(sumar(lista, "gasto") + porPagar(fijos));
  const ahorro = round2(ingresos - egresos);
  const meta = db.settings.metaAhorro ?? 0;

  const actual = gastadoPorCategoria(lista, fijos);
  const pasado = gastadoPorCategoria(previa);
  const topes = db.settings.presupuestos ?? {};
  const pagosTarjeta = round2(lista.filter((t) => t.tipo === "gasto" && t.categoria === PAGO_TARJETA).reduce((s, t) => s + t.monto, 0));
  const categorias = [...new Set([...Object.keys(actual), ...Object.keys(pasado)])]
    .map((c) => ({ c, este: actual[c] ?? 0, antes: pasado[c] ?? 0, tope: topes[c] }))
    .sort((a, b) => b.este - a.este);
  const mayor = Math.max(1, ...categorias.map((x) => Math.max(x.este, x.antes)));
  const subieron = categorias.filter((x) => x.antes > 0 && x.este > x.antes * 1.15).slice(0, 3);
  const pasados = categorias.filter((x) => x.tope && x.este > x.tope);

  async function guardarNota() {
    const notasMes = { ...(db.settings.notasMes ?? {}) };
    if (texto.trim()) notasMes[mes] = texto.trim();
    else delete notasMes[mes];
    if (await save("settings", { ...db.settings, notasMes })) toast({ tone: "accent", title: "Reflexión guardada", detail: fmonth(mes) });
  }

  return (
    <>
      <PageHeader
        title="Cierre de mes"
        sub="Las cuatro preguntas del kakeibo"
        actions={
          <div className="flex items-center gap-1">
            <IconBtn label="Mes anterior" onClick={() => setMes(anterior)}><IconAtras size={18} /></IconBtn>
            <span className="min-w-36 text-center text-sm font-semibold">{fmesTitulo(mes)}</span>
            <IconBtn label="Mes siguiente" disabled={mes >= hoy} onClick={() => setMes(addMonthKey(mes, 1))}><IconAdelante size={18} /></IconBtn>
          </div>
        }
      />

      {!txs ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          {enCurso && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">El mes aún no termina: los fijos por pagar y por cobrar ya se cuentan como proyección.</p>}

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="1 · ¿Cuánto tuviste?" value={<AnimatedNumber value={ingresos} tone="ok" />} tone="ok" sub="Ingresos del mes" />
            <Stat label="2 · ¿Cuánto querías ahorrar?" value={meta ? mxn(meta) : "—"} sub={meta ? "Tu meta mensual" : "Define tu meta en Ajustes"} />
            <Stat label="3 · ¿Cuánto gastaste?" value={<AnimatedNumber value={egresos} tone="danger" />} sub={pagosTarjeta > 0 ? `incluye ${mxn(pagosTarjeta)} en pagos de tarjeta` : "Egresos del mes"} />
            <Stat
              label="Ahorro"
              value={<AnimatedNumber value={ahorro} tone={{ up: "ok", down: "danger" }} />}
              tone={ahorro < 0 ? "danger" : meta && ahorro >= meta ? "ok" : undefined}
              sub={!meta ? "Ingresos − egresos" : ahorro >= meta ? "¡Cumpliste tu meta!" : `Te faltaron ${mxn(meta - ahorro)}`}
            />
          </div>

          <Section title="En qué se fue el dinero">
            {!categorias.length ? (
              <Empty>No hay gastos registrados en {fmonth(mes)}.</Empty>
            ) : (
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-border/60">
                  {categorias.map(({ c, este, antes, tope }) => {
                    const cambio = antes > 0 ? (este - antes) / antes : null;
                    const nivel = tope ? nivelPresupuesto(este, tope).nivel : null;
                    return (
                      <li key={c} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">{c}</span>
                          <span className="num shrink-0 font-semibold">{mxn(este)}</span>
                        </div>
                        {/* este mes contra el anterior, en la misma escala */}
                        <div className="mt-1.5 space-y-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={cx("bar-fill h-full rounded-full", nivel === "danger" ? "bg-danger" : nivel === "warn" ? "bg-warn" : "bg-accent")} style={{ transform: `scaleX(${este / mayor})` }} /></div>
                          <div className="h-1 overflow-hidden rounded-full bg-surface-2"><div className="bar-fill h-full rounded-full bg-muted/50" style={{ transform: `scaleX(${antes / mayor})` }} /></div>
                        </div>
                        <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                          <span>
                            {mesCorto(anterior)}: {mxn(antes)}
                            {cambio !== null && Math.abs(cambio) >= 0.01 && (
                              <span className={cx("ml-1 font-semibold", cambio > 0 ? "text-danger" : "text-ok")}>{cambio > 0 ? "+" : "−"}{Math.round(Math.abs(cambio) * 100)}%</span>
                            )}
                          </span>
                          {tope ? <span className={nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warn" : ""}>Tope {mxn(tope)}</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-border px-4 py-2 text-xs text-muted">Barra gruesa: {mesCorto(mes)} · barra delgada: {mesCorto(anterior)}. Los pagos de tarjeta no cuentan aquí: lo comprado ya está en su categoría.</p>
              </Card>
            )}
          </Section>

          <Section title="4 · ¿Cómo puedes mejorar?">
            <Card className="space-y-3">
              {(subieron.length > 0 || pasados.length > 0 || (meta > 0 && ahorro < meta)) && (
                <ul className="space-y-1 text-sm">
                  {pasados.map((x) => <li key={`p${x.c}`} className="text-danger">• Te pasaste del tope de <b>{x.c}</b> por {mxn(x.este - (x.tope ?? 0))}.</li>)}
                  {subieron.map((x) => <li key={`s${x.c}`} className="text-warn">• <b>{x.c}</b> subió {Math.round(((x.este - x.antes) / x.antes) * 100)}% respecto a {mesCorto(anterior)}.</li>)}
                  {meta > 0 && ahorro < meta && <li className="text-muted">• Para tu meta te faltaron {mxn(meta - ahorro)}.</li>}
                </ul>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Tu reflexión del mes</span>
                <textarea
                  value={texto}
                  onChange={(e) => setNota({ mes, texto: e.target.value })}
                  maxLength={2000}
                  rows={4}
                  placeholder="¿Qué funcionó, qué no y qué vas a cambiar el próximo mes?"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:text-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </label>
              <Btn variant="primary" disabled={guardada} onClick={() => void guardarNota()}>{guardada ? "Guardada" : "Guardar reflexión"}</Btn>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
