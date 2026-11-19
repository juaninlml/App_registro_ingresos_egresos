"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BancoColorFields, CardVisual, type BancoColor } from "@/components/CardVisual";
import { useComprasCredito, useCuentas } from "@/components/Cuentas";
import { useData } from "@/components/DataProvider";
import { IconMas } from "@/components/icons";
import { ImportStatement } from "@/components/ImportStatement";
import { AnimatedNumber, Segmented, useToast } from "@/components/motion";
import { Badge, Btn, Card, Empty, Field, Input, Modal, NumInput, PageHeader, Section, Skeleton } from "@/components/ui";
import { creditos } from "@/lib/cuentas";
import { ahoraHM, daysBetween, fdate, fshort } from "@/lib/dates";
import { abonadoDesdeCorte, creditoMsi, deudaActual, latestStatement, proximoPago } from "@/lib/finance";
import { mxn, uid } from "@/lib/money";
import type { Card as CardT } from "@/lib/types";

type Tipo = "credito" | "debito";

export default function Tarjetas() {
  const { db, save, today } = useData();
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  // /tarjetas?nueva=debito abre directo el alta de una tarjeta de débito (desde el Resumen)
  const [open, setOpen] = useState(() => params.get("nueva") === "debito");
  const [pdf, setPdf] = useState(false);
  const vacio = { tipo: (params.get("nueva") === "debito" ? "debito" : "credito") as Tipo, banco: "", color: "" as BancoColor["color"], nombre: "", terminacion: "", limite: "" as number | "", diaCorte: "" as number | "", saldo: "" as number | "" };
  const [f, setF] = useState(vacio);
  const { cuentas } = useCuentas();
  const compras = useComprasCredito();
  const credito = creditos(db.cards);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const debito = f.tipo === "debito";
    const card: CardT = {
      id: uid(),
      tipo: f.tipo,
      banco: f.banco.trim(),
      color: f.color || undefined,
      nombre: f.nombre.trim(),
      terminacion: f.terminacion.trim() || undefined,
      limite: !debito && f.limite !== "" ? f.limite : undefined,
      diaCorte: debito ? 0 : Number(f.diaCorte),
      statements: [],
      saldo: debito ? { monto: Number(f.saldo || 0), fecha: today, hora: ahoraHM() } : undefined,
    };
    if (await save("cards", [...db.cards, card])) {
      setOpen(false);
      setF(vacio);
      toast({ tone: "accent", title: `Tarjeta de ${debito ? "débito" : "crédito"} agregada`, detail: `${card.banco} ${card.nombre}${debito ? ` · saldo ${mxn(card.saldo!.monto)}` : ""}` });
      if (params.get("nueva")) router.replace("/tarjetas");
    }
  }

  const abrir = (tipo: Tipo) => {
    setF({ ...vacio, tipo });
    setOpen(true);
  };

  return (
    <>
      <PageHeader title="Tarjetas" sub="Débito para tu dinero; crédito para lo que debes" actions={<><Btn onClick={() => setPdf(true)}>Crédito desde PDF</Btn><Btn variant="primary" onClick={() => abrir("credito")}><IconMas size={18} />Nueva tarjeta</Btn></>} />

      <Section title="Débito" actions={<Btn small onClick={() => abrir("debito")}><IconMas size={16} />Débito</Btn>}>
        {!cuentas.length ? (
          <Empty>Agrega tu tarjeta de débito con lo que tienes hoy y la app llevará tu saldo con cada ingreso, gasto y pago de tarjeta.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cuentas.map(({ card: c, disponible }) => (
              <Link key={c.id} href={`/tarjetas/${c.id}`}>
                <Card className="press h-full transition-colors duration-[var(--dur-fast)] hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <CardVisual card={c} compact className="w-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{c.banco} {c.nombre}</div>
                      <div className="text-xs text-muted">{c.terminacion ? `•••• ${c.terminacion} · ` : ""}débito</div>
                    </div>
                    <Badge tone="accent">Débito</Badge>
                  </div>
                  <div className="mt-3 text-sm">
                    <div className="text-muted">Disponible</div>
                    <div className={`text-lg font-semibold ${disponible !== undefined && disponible < 0 ? "text-danger" : ""}`}>
                      {disponible === undefined ? <Skeleton className="h-6 w-28" /> : <AnimatedNumber value={disponible} tone={{ up: "ok", down: "danger" }} />}
                    </div>
                    {c.saldo && <div className="mt-1 text-xs text-muted">Saldo capturado el {fdate(c.saldo.fecha)}</div>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Crédito">
        {!credito.length ? (
          <Empty>Sube el PDF de tu estado de cuenta para crear la tarjeta con sus meses sin intereses, o agrégala a mano con «Nueva tarjeta».</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {credito.map((c) => {
              const st = latestStatement(c);
              const abonado = st ? abonadoDesdeCorte(c, db.payments, st) : 0;
              const falta = st ? Math.max(0, st.pagoNoIntereses - abonado) : 0;
              const d = st ? daysBetween(today, st.fechaLimite) : null;
              const comprado = compras?.[c.id]?.total ?? 0;
              const prox = st ? proximoPago(c, db.msi, compras?.[c.id]?.lista ?? [], st) : null;
              const cred = creditoMsi(db.msi.filter((m) => m.cardId === c.id), st?.fechaCorte ?? today, c.limite);
              return (
                <Link key={c.id} href={`/tarjetas/${c.id}`}>
                  <Card className="press h-full transition-colors duration-[var(--dur-fast)] hover:border-accent">
                    <div className="flex items-start justify-between gap-2">
                      <CardVisual card={c} compact className="w-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{c.banco} {c.nombre}</div>
                        <div className="text-xs text-muted">{c.terminacion ? `•••• ${c.terminacion} · ` : ""}corte día {c.diaCorte}</div>
                      </div>
                      {st && d !== null && (falta > 0 ? <Badge tone={d < 0 ? "danger" : d <= 7 ? "warn" : "muted"}>{d < 0 ? "Vencido" : `${d} d`}</Badge> : <Badge tone="ok">Al corriente</Badge>)}
                    </div>
                    {st ? (
                      <div className="mt-3 text-sm">
                        <div className="text-muted">Deuda actual</div>
                        <div className="text-lg font-semibold"><AnimatedNumber value={deudaActual(c, db.payments, st, comprado)} tone={{ up: "danger", down: "ok" }} /></div>
                        <div className="mt-1 text-xs text-muted">Falta {mxn(falta)} · límite {fdate(st.fechaLimite)}{comprado > 0 ? ` · ${mxn(comprado)} en compras nuevas` : ""}</div>
                        {/* siguiente corte (MSI + compras antes del corte) y crédito que ocupan los MSI */}
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs">
                          <div>
                            <div className="text-muted">Próximo pago · {fshort(prox!.corte)}</div>
                            <div className="num text-sm font-semibold text-fg">{compras ? mxn(prox!.total) : "…"}</div>
                          </div>
                          <div>
                            <div className="text-muted">MSI ocupando</div>
                            <div className="num text-sm font-semibold text-fg">{cred.activos ? mxn(cred.ocupado) : "—"}</div>
                            {cred.activos > 0 && cred.liberado !== null && <div className="text-ok">{mxn(cred.liberado)} liberado de {mxn(cred.limite!)}</div>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-muted">Sin estados de cuenta</div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      <ImportStatement card={null} open={pdf} onClose={() => setPdf(false)} onCreated={(id) => router.push(`/tarjetas/${id}`)} />
      <Modal open={open} onClose={() => setOpen(false)} title={f.tipo === "debito" ? "Nueva tarjeta de débito" : "Nueva tarjeta de crédito"}>
        <form onSubmit={crear} className="space-y-3">
          <Segmented label="Tipo de tarjeta" value={f.tipo} onChange={(tipo) => setF({ ...f, tipo })} options={[{ value: "credito", label: "Crédito" }, { value: "debito", label: "Débito" }]} />
          {open && <BancoColorFields value={f} onChange={(v) => setF({ ...f, ...v })} nombre={f.nombre} terminacion={f.terminacion} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder={f.tipo === "debito" ? "Nómina" : "Unique"} required maxLength={40} /></Field>
            <Field label="Últimos 4 dígitos"><Input value={f.terminacion} onChange={(e) => setF({ ...f, terminacion: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="1234" /></Field>
          </div>
          {f.tipo === "debito" ? (
            <Field label="¿Cuánto tiene hoy?" hint="Lo que dice tu app del banco ahora. Después lo puedes ajustar cuando no cuadre.">
              <NumInput value={f.saldo} onChange={(n) => setF({ ...f, saldo: n })} required placeholder="0.00" className="num !py-3 !text-xl font-semibold" />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día de corte"><NumInput value={f.diaCorte} onChange={(n) => setF({ ...f, diaCorte: n })} min={1} max={31} required /></Field>
              <Field label="Límite (opcional)"><NumInput value={f.limite} onChange={(n) => setF({ ...f, limite: n })} min={0} /></Field>
            </div>
          )}
          <p className="text-xs text-muted">Nunca guardes el número completo de la tarjeta, solo los últimos 4 dígitos.</p>
          <Btn variant="primary" type="submit" className="w-full">Agregar tarjeta de {f.tipo === "debito" ? "débito" : "crédito"}</Btn>
        </form>
      </Modal>
    </>
  );
}
