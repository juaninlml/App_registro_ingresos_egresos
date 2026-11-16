"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImportStatement } from "@/components/ImportStatement";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Badge, Btn, Card, Empty, Field, Input, Modal, NumInput, PageHeader } from "@/components/ui";
import { daysBetween, fdate } from "@/lib/dates";
import { abonadoDesdeCorte, deudaActual, latestStatement } from "@/lib/finance";
import { mxn, uid } from "@/lib/money";
import type { Card as CardT } from "@/lib/types";

export default function Tarjetas() {
  const { db, save, today } = useData();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [f, setF] = useState({ banco: "", nombre: "", terminacion: "", limite: "" as number | "", diaCorte: "" as number | "" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const card: CardT = {
      id: uid(),
      banco: f.banco.trim(),
      nombre: f.nombre.trim(),
      terminacion: f.terminacion.trim() || undefined,
      limite: f.limite === "" ? undefined : f.limite,
      diaCorte: Number(f.diaCorte),
      statements: [],
    };
    if (await save("cards", [...db.cards, card])) {
      setOpen(false);
      setF({ banco: "", nombre: "", terminacion: "", limite: "", diaCorte: "" });
    }
  }

  return (
    <>
      <PageHeader title="Tarjetas" sub="Santander y otros bancos funcionan igual" actions={<><Btn variant="primary" onClick={() => setPdf(true)}>Crear desde estado de cuenta (PDF)</Btn><Btn onClick={() => setOpen(true)}>+ Nueva tarjeta</Btn></>} />
      {!db.cards.length ? (
        <Empty>Sube el PDF de tu estado de cuenta para crear la tarjeta con sus meses sin intereses, o agrégala a mano con «Nueva tarjeta».</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {db.cards.map((c) => {
            const st = latestStatement(c);
            const abonado = st ? abonadoDesdeCorte(c, db.payments, st) : 0;
            const falta = st ? Math.max(0, st.pagoNoIntereses - abonado) : 0;
            const d = st ? daysBetween(today, st.fechaLimite) : null;
            return (
              <Link key={c.id} href={`/tarjetas/${c.id}`}>
                <Card className="h-full transition hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{c.banco} {c.nombre}</div>
                      <div className="text-xs text-muted">{c.terminacion ? `•••• ${c.terminacion} · ` : ""}corte día {c.diaCorte}</div>
                    </div>
                    {st && d !== null && (falta > 0 ? <Badge tone={d < 0 ? "danger" : d <= 7 ? "warn" : "muted"}>{d < 0 ? "Vencido" : `${d} d`}</Badge> : <Badge tone="ok">Al corriente</Badge>)}
                  </div>
                  {st ? (
                    <div className="mt-3 text-sm">
                      <div className="text-muted">Deuda actual</div>
                      <div className="num text-lg font-semibold">{mxn(deudaActual(c, db.payments, st))}</div>
                      <div className="mt-1 text-xs text-muted">Falta {mxn(falta)} · límite {fdate(st.fechaLimite)}</div>
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

      <ImportStatement card={null} open={pdf} onClose={() => setPdf(false)} onCreated={(id) => router.push(`/tarjetas/${id}`)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva tarjeta">
        <form onSubmit={crear} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco"><Input value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} placeholder="Santander" required maxLength={40} /></Field>
            <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Unique" required maxLength={40} /></Field>
            <Field label="Últimos 4 dígitos"><Input value={f.terminacion} onChange={(e) => setF({ ...f, terminacion: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="1234" /></Field>
            <Field label="Día de corte"><NumInput value={f.diaCorte} onChange={(n) => setF({ ...f, diaCorte: n })} min={1} max={31} required /></Field>
          </div>
          <Field label="Límite de crédito (opcional)"><NumInput value={f.limite} onChange={(n) => setF({ ...f, limite: n })} min={0} /></Field>
          <p className="text-xs text-muted">Nunca guardes el número completo de la tarjeta, solo los últimos 4 dígitos.</p>
          <Btn variant="primary" type="submit" className="w-full">Guardar</Btn>
        </form>
      </Modal>
    </>
  );
}
