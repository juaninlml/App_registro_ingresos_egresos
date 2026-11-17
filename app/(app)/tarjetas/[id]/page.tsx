"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { readTxMonth, useData, type Write } from "@/components/DataProvider";
import { BancoColorFields, CardVisual, isColorId, type BancoColor } from "@/components/CardVisual";
import { IconBorrar, IconMas, IconPagoTarjeta } from "@/components/icons";
import { AnimatedNumber, useToast } from "@/components/motion";
import { useComprasCredito } from "@/components/Cuentas";
import { DebitoDetalle } from "@/components/DebitoDetalle";
import { ImportStatement } from "@/components/ImportStatement";
import { esDebito } from "@/lib/cuentas";
import { Badge, Btn, Card, Empty, Field, Input, Modal, NumInput, PageHeader, Progress, Section, Skeleton, TableWrap, td, th } from "@/components/ui";
import { addDays, addMonths, daysBetween, fdate, fshort, isISO, nextBusinessDay } from "@/lib/dates";
import { abonadoDesdeCorte, deudaActual, latestStatement, msiInfo, primerCorteSugerido } from "@/lib/finance";
import { mxn, round2, uid } from "@/lib/money";
import type { Msi, Payment, Statement } from "@/lib/types";

export default function TarjetaDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, save, commit, today } = useData();
  const toast = useToast();
  const card = db.cards.find((c) => c.id === id);
  const [modal, setModal] = useState<null | "estado" | "abono" | "msi" | "editar" | "pdf">(null);
  const [editMsi, setEditMsi] = useState<Msi | null>(null);
  const compras = useComprasCredito();

  if (!card) {
    return <Empty>No se encontró la tarjeta. <Link href="/tarjetas" className="font-medium text-accent-text underline">Volver</Link></Empty>;
  }
  if (esDebito(card)) return <DebitoDetalle card={card} />;
  const st = latestStatement(card);
  const abonado = st ? abonadoDesdeCorte(card, db.payments, st) : 0;
  const falta = st ? Math.max(0, round2(st.pagoNoIntereses - abonado)) : 0;
  // deuda real: lo del corte + compras registradas después − todo lo abonado
  const misCompras = compras?.[card.id];
  const comprado = misCompras?.total ?? 0;
  const abonadoTotal = abonado;
  const deuda = st ? deudaActual(card, db.payments, st, comprado) : 0;
  const msis = db.msi.filter((m) => m.cardId === card.id);
  const ref = st?.fechaCorte ?? today;
  const infos = msis.map((m) => ({ m, i: msiInfo(m, ref) }));
  const activos = infos.filter((x) => !x.i.liquidado);
  const pagos = db.payments.filter((p) => p.destino === "card" && p.targetId === card.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const d = st ? daysBetween(today, st.fechaLimite) : null;

  const saveCard = (patch: Partial<typeof card>) => save("cards", db.cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));

  async function borrarTarjeta() {
    const c = card!;
    if (!confirm(`¿Borrar ${c.banco} ${c.nombre}? También se borrarán sus MSI y abonos. Los pagos registrados en Movimientos se conservan como gastos.`)) return;
    const mios = db.payments.filter((p) => p.destino === "card" && p.targetId === c.id);
    const writes: Write[] = [
      { key: "msi", value: db.msi.filter((m) => m.cardId !== c.id) },
      { key: "payments", value: db.payments.filter((p) => !mios.includes(p)) },
      { key: "cards", value: db.cards.filter((x) => x.id !== c.id) },
    ];
    if (db.plan?.cardId === c.id) writes.push({ key: "plan", value: null });
    // los movimientos de pago a esta tarjeta se quedan, pero ya sin apuntar a una tarjeta que no existe
    try {
      for (const month of new Set(mios.filter((p) => p.txId).map((p) => p.fecha.slice(0, 7)))) {
        const list = await readTxMonth(month);
        if (list.some((t) => t.tarjetaId === c.id)) {
          writes.push({ key: `tx:${month}`, value: list.map((t) => (t.tarjetaId === c.id ? { ...t, tarjetaId: undefined } : t)) });
        }
      }
    } catch (e) {
      alert(`No se pudo borrar: ${(e as Error).message}`);
      return;
    }
    if (await commit(writes)) router.replace("/tarjetas");
  }

  /** Borra un abono y, si nació en Movimientos, también ese movimiento (todo junto). */
  async function borrarAbono(p: Payment) {
    if (!confirm(p.txId ? "¿Borrar este abono? También se quitará el movimiento de pago." : "¿Borrar este abono?")) return;
    const writes: Write[] = [{ key: "payments", value: db.payments.filter((x) => x.id !== p.id) }];
    if (p.txId) {
      const month = p.fecha.slice(0, 7);
      try {
        const list = await readTxMonth(month);
        if (list.some((t) => t.id === p.txId)) writes.push({ key: `tx:${month}`, value: list.filter((t) => t.id !== p.txId) });
      } catch (e) {
        alert(`No se pudo borrar: ${(e as Error).message}`);
        return;
      }
    }
    if (await commit(writes)) {
      toast({ tone: "muted", icon: <IconBorrar size={18} />, title: "Abono borrado", detail: `${mxn(p.monto)} del ${fdate(p.fecha)}${p.txId ? " · y su movimiento" : ""}` });
    }
  }

  return (
    <>
      <PageHeader
        lead={<CardVisual card={card} compact className="w-14 shrink-0" />}
        title={`${card.banco} ${card.nombre}`}
        sub={`${card.terminacion ? `•••• ${card.terminacion} · ` : ""}corte día ${card.diaCorte}${card.limite ? ` · límite ${mxn(card.limite)}` : ""}`}
        actions={
          <>
            <Btn onClick={() => setModal("editar")}>Editar</Btn>
            <Btn variant="primary" onClick={() => setModal("abono")}><IconMas size={18} />Abono</Btn>
          </>
        }
      />

      {st ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <div className="text-xs font-medium text-muted">Pago para no generar intereses</div>
            <div className="num mt-1 text-xl font-semibold">{mxn(st.pagoNoIntereses)}</div>
            <div className="mt-0.5 text-xs text-muted">Corte {fdate(st.fechaCorte)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Fecha límite</div>
            <div className="mt-1 text-xl font-semibold">{fshort(st.fechaLimite)}</div>
            <div className="mt-0.5">{d !== null && (falta > 0 ? <Badge tone={d < 0 ? "danger" : d <= 7 ? "warn" : "muted"}>{d < 0 ? `Venció hace ${-d} d` : d === 0 ? "Hoy" : `En ${d} días`}</Badge> : <Badge tone="ok">Cubierto</Badge>)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Abonado desde el corte</div>
            <div className="mt-1 text-xl font-semibold text-ok"><AnimatedNumber value={abonado} tone="ok" /></div>
            <div className="mt-2"><Progress value={abonado} max={st.pagoNoIntereses} tone="ok" label="Abonado del pago para no generar intereses" /></div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Falta para el límite</div>
            <div className={`mt-1 text-xl font-semibold ${falta > 0 ? "text-danger" : "text-ok"}`}><AnimatedNumber value={falta} tone={{ up: "danger", down: "ok" }} /></div>
            <div className="mt-0.5 text-xs text-muted">Pago del corte del {fshort(st.fechaCorte)}</div>
          </Card>
        </div>
      ) : (
        <div className="mb-6"><Empty>Registra tu primer estado de cuenta para empezar.</Empty></div>
      )}

      {st && (
        <Section title="Deuda real">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-muted">Deuda actual</div>
                <div className="mt-1 text-2xl font-semibold">{misCompras ? <AnimatedNumber value={deuda} tone={{ up: "danger", down: "ok" }} /> : <Skeleton className="h-8 w-36" />}</div>
                <div className="mt-1 text-xs text-muted">
                  Al corte {mxn(st.saldoTotal)} + compras {mxn(comprado)} − abonos {mxn(abonadoTotal)}
                </div>
              </div>
              {card.limite ? (
                <div>
                  <div className="text-xs font-medium text-muted">Crédito disponible</div>
                  <div className={`mt-1 text-2xl font-semibold ${card.limite - deuda < 0 ? "text-danger" : ""}`}>
                    {misCompras ? <AnimatedNumber value={round2(card.limite - deuda)} tone={{ up: "ok", down: "danger" }} /> : <Skeleton className="h-8 w-36" />}
                  </div>
                  <div className="mt-2"><Progress value={deuda} max={card.limite} tone={deuda / card.limite > 0.8 ? "danger" : "accent"} label="Uso del límite de crédito" /></div>
                  <div className="mt-1 text-xs text-muted">Usas {Math.round((deuda / card.limite) * 100)}% de {mxn(card.limite)}</div>
                </div>
              ) : null}
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 text-xs font-semibold text-muted">Compras desde el corte del {fshort(st.fechaCorte)}</div>
              {!misCompras ? (
                <Skeleton className="h-16" />
              ) : !misCompras.lista.length ? (
                <p className="text-sm text-muted">Los gastos que registres en Movimientos con esta tarjeta aparecen aquí y se suman a la deuda hasta tu siguiente estado de cuenta.</p>
              ) : (
                <ul className="divide-y divide-border/60 text-sm">
                  {[...misCompras.lista].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 15).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate"><span className="font-medium">{t.nota || t.categoria}</span> <span className="text-muted">· {fshort(t.fecha)}{t.nota ? ` · ${t.categoria}` : ""}</span></span>
                      <span className="num shrink-0 font-semibold">−{mxn(t.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </Section>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <Btn variant="primary" onClick={() => setModal("pdf")}>Subir estado de cuenta (PDF)</Btn>
        <Btn onClick={() => setModal("estado")}>Registrar a mano</Btn>
        <Link href="/plan"><Btn>Ver plan de abonos</Btn></Link>
        <Link href="/msi"><Btn>Proyección por corte</Btn></Link>
      </div>

      <Section title={`Meses sin intereses (${activos.length} activos)`} actions={<Btn small variant="primary" onClick={() => { setEditMsi(null); setModal("msi"); }}><IconMas size={16} />Agregar MSI</Btn>}>
        {!msis.length ? (
          <Empty>Sin cargos a meses.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {infos
              .sort((a, b) => Number(a.i.liquidado) - Number(b.i.liquidado) || a.i.fechaTermino.localeCompare(b.i.fechaTermino))
              .map(({ m, i }) => (
                <Card key={m.id} className={i.liquidado ? "opacity-60" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.descripcion}</div>
                      <div className="text-xs text-muted">{fshort(m.fechaOperacion)} · total {mxn(m.montoOriginal)}{m.terminacionTarjeta ? ` · •••• ${m.terminacionTarjeta}` : ""}</div>
                    </div>
                    <Badge tone={i.liquidado ? "ok" : "accent"}>{i.pagoActual}/{m.totalPagos}</Badge>
                  </div>
                  <div className="mt-2"><Progress value={i.pagoActual} max={m.totalPagos} /></div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-muted">Mensual</div><div className="num font-medium">{mxn(m.pagoMensual)}</div></div>
                    <div><div className="text-muted">Pendiente</div><div className="num font-medium">{mxn(i.saldoPendiente)}</div></div>
                    <div><div className="text-muted">Termina</div><div className="font-medium">{fshort(i.fechaTermino)}</div></div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Btn small onClick={() => { setEditMsi(m); setModal("msi"); }}>Editar</Btn>
                    <Btn small variant="danger" onClick={() => confirm(`¿Borrar "${m.descripcion}"?`) && save("msi", db.msi.filter((x) => x.id !== m.id))}>Borrar</Btn>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </Section>

      <Section title="Abonos registrados">
        {!pagos.length ? (
          <Empty>Aún no registras abonos a esta tarjeta.</Empty>
        ) : (
          <TableWrap>
            <thead><tr><th className={th}>Fecha</th><th className={th}>Monto</th><th className={th}>Nota</th><th className={th}></th></tr></thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{fdate(p.fecha)}</td>
                  <td className={td}>{mxn(p.monto)}</td>
                  <td className={`${td} text-muted`}>{p.nota ?? ""} {p.txId && <Badge tone="accent">desde movimientos</Badge>}</td>
                  <td className={td}><Btn small variant="ghost" onClick={() => void borrarAbono(p)}>Borrar</Btn></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Section>

      <Section title="Historial de estados de cuenta">
        {!card.statements.length ? (
          <Empty>Sin estados de cuenta.</Empty>
        ) : (
          <TableWrap>
            <thead><tr><th className={th}>Corte</th><th className={th}>Límite</th><th className={th}>Saldo total</th><th className={th}>Pago sin intereses</th><th className={th}>Mínimo</th><th className={th}></th></tr></thead>
            <tbody>
              {[...card.statements].sort((a, b) => b.fechaCorte.localeCompare(a.fechaCorte)).map((s) => (
                <tr key={s.fechaCorte}>
                  <td className={td}>{fdate(s.fechaCorte)}</td>
                  <td className={td}>{fdate(s.fechaLimite)}</td>
                  <td className={td}>{mxn(s.saldoTotal)}</td>
                  <td className={td}>{mxn(s.pagoNoIntereses)}</td>
                  <td className={td}>{s.pagoMinimo != null ? mxn(s.pagoMinimo) : "—"}</td>
                  <td className={td}><Btn small variant="ghost" onClick={() => confirm("¿Borrar este estado de cuenta?") && saveCard({ statements: card.statements.filter((x) => x.fechaCorte !== s.fechaCorte) })}>Borrar</Btn></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Section>

      <div className="mt-8"><Btn variant="danger" onClick={borrarTarjeta}>Borrar tarjeta</Btn></div>

      <ImportStatement card={card} open={modal === "pdf"} onClose={() => setModal(null)} />
      <EstadoModal open={modal === "estado"} onClose={() => setModal(null)} onSave={async (s) => {
        const rest = card.statements.filter((x) => x.fechaCorte !== s.fechaCorte);
        if (await saveCard({ statements: [...rest, s] })) setModal(null);
      }} diaCorte={card.diaCorte} ultimo={st} />
      <AbonoModal open={modal === "abono"} onClose={() => setModal(null)} today={today} onSave={async (p) => {
        setModal(null); // se cierra al instante para ver cómo suben el abonado y la barra
        if (await save("payments", [...db.payments, { ...p, id: uid(), destino: "card", targetId: card.id }])) {
          toast({ tone: "accent", icon: <IconPagoTarjeta size={18} />, title: `Abono a ${card.banco} ${card.nombre} registrado`, detail: `${mxn(p.monto)} · ${fdate(p.fecha)}` });
        } else {
          toast({ tone: "danger", title: "No se guardó el abono", detail: `${mxn(p.monto)} · revisa tu conexión e intenta de nuevo` });
        }
      }} />
      <MsiModal open={modal === "msi"} onClose={() => setModal(null)} edit={editMsi} today={today} sugerir={(f) => primerCorteSugerido(card, f)} onSave={async (m) => {
        const next = editMsi ? db.msi.map((x) => (x.id === editMsi.id ? { ...m, id: editMsi.id, cardId: card.id } : x)) : [...db.msi, { ...m, id: uid(), cardId: card.id }];
        if (await save("msi", next)) setModal(null);
      }} />
      <EditarModal open={modal === "editar"} onClose={() => setModal(null)} card={card} onSave={async (p) => { if (await saveCard(p)) setModal(null); }} />
    </>
  );
}

function EstadoModal({ open, onClose, onSave, diaCorte, ultimo }: { open: boolean; onClose: () => void; onSave: (s: Statement) => void; diaCorte: number; ultimo: Statement | null }) {
  const sugerido = ultimo ? addMonths(ultimo.fechaCorte, 1) : "";
  const [f, setF] = useState({ corte: "", limite: "", total: "" as number | "", pago: "" as number | "", minimo: "" as number | "" });
  const corte = f.corte || sugerido;
  const limite = f.limite || (corte && isISO(corte) ? nextBusinessDay(addDays(corte, 19)) : "");
  return (
    <Modal open={open} onClose={onClose} title="Registrar estado de cuenta">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ fechaCorte: corte, fechaLimite: limite, saldoTotal: Number(f.total), pagoNoIntereses: Number(f.pago), pagoMinimo: f.minimo === "" ? undefined : f.minimo });
          setF({ corte: "", limite: "", total: "", pago: "", minimo: "" });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de corte" hint={`Día habitual: ${diaCorte}`}><Input type="date" value={corte} onChange={(e) => setF({ ...f, corte: e.target.value })} required /></Field>
          <Field label="Fecha límite de pago" hint="Se sugiere corte + 19 días hábiles"><Input type="date" value={limite} onChange={(e) => setF({ ...f, limite: e.target.value })} required /></Field>
        </div>
        <Field label="Saldo total al corte"><NumInput value={f.total} onChange={(n) => setF({ ...f, total: n })} min={0} required /></Field>
        <Field label="Pago para no generar intereses"><NumInput value={f.pago} onChange={(n) => setF({ ...f, pago: n })} min={0} required /></Field>
        <Field label="Pago mínimo (opcional)"><NumInput value={f.minimo} onChange={(n) => setF({ ...f, minimo: n })} min={0} /></Field>
        <Btn variant="primary" type="submit" className="w-full">Guardar</Btn>
      </form>
    </Modal>
  );
}

function AbonoModal({ open, onClose, onSave, today }: { open: boolean; onClose: () => void; onSave: (p: Pick<Payment, "fecha" | "monto" | "nota">) => void; today: string }) {
  const [f, setF] = useState({ fecha: "", monto: "" as number | "", nota: "" });
  return (
    <Modal open={open} onClose={onClose} title="Registrar abono">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ fecha: f.fecha || today, monto: Number(f.monto), nota: f.nota.trim() || undefined });
          setF({ fecha: "", monto: "", nota: "" });
        }}
        className="space-y-3"
      >
        <Field label="Fecha"><Input type="date" value={f.fecha || today} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Field>
        <Field label="Monto"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field>
        <Field label="Nota (opcional)"><Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={120} /></Field>
        <Btn variant="primary" type="submit" className="w-full">Guardar abono</Btn>
      </form>
    </Modal>
  );
}

function MsiModal({ open, onClose, onSave, edit, today, sugerir }: { open: boolean; onClose: () => void; onSave: (m: Omit<Msi, "id" | "cardId">) => void; edit: Msi | null; today: string; sugerir: (f: string) => string }) {
  return (
    <Modal open={open} onClose={onClose} title={edit ? "Editar MSI" : "Nuevo cargo a meses"}>
      {open && <MsiForm key={edit?.id ?? "nuevo"} onSave={onSave} edit={edit} today={today} sugerir={sugerir} />}
    </Modal>
  );
}

function MsiForm({ onSave, edit, today, sugerir }: { onSave: (m: Omit<Msi, "id" | "cardId">) => void; edit: Msi | null; today: string; sugerir: (f: string) => string }) {
  const [f, setF] = useState({
    descripcion: edit?.descripcion ?? "",
    fecha: edit?.fechaOperacion ?? today,
    monto: (edit?.montoOriginal ?? "") as number | "",
    plazo: (edit?.totalPagos ?? 12) as number | "",
    mensual: (edit?.pagoMensual ?? "") as number | "",
    primer: edit?.primerCorte ?? "",
    term: edit?.terminacionTarjeta ?? "",
  });
  const mensual = f.mensual !== "" ? f.mensual : f.monto !== "" && f.plazo ? round2(Number(f.monto) / Number(f.plazo)) : "";
  const primer = f.primer || (isISO(f.fecha) ? sugerir(f.fecha) : "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ descripcion: f.descripcion.trim(), fechaOperacion: f.fecha, montoOriginal: Number(f.monto), totalPagos: Number(f.plazo), pagoMensual: Number(mensual), primerCorte: primer, terminacionTarjeta: f.term.trim() || undefined });
      }}
      className="space-y-3"
    >
      <Field label="Descripción"><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} required maxLength={80} placeholder="Mercado Libre" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de la compra"><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value, primer: "" })} required /></Field>
        <Field label="Meses"><NumInput value={f.plazo} onChange={(n) => setF({ ...f, plazo: n })} min={1} max={72} required /></Field>
        <Field label="Monto total"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={0.01} required /></Field>
        <Field label="Pago mensual" hint="Se calcula si lo dejas vacío"><NumInput value={f.mensual} onChange={(n) => setF({ ...f, mensual: n })} min={0} placeholder={mensual === "" ? "" : String(mensual)} /></Field>
      </div>
      <Field label="Corte del primer pago" hint="Sugerido: el siguiente corte tras la compra. Cámbialo si tu estado de cuenta indica otro."><Input type="date" value={primer} onChange={(e) => setF({ ...f, primer: e.target.value })} required /></Field>
      <Field label="Terminación de la tarjeta usada (opcional)"><Input value={f.term} onChange={(e) => setF({ ...f, term: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" /></Field>
      <Btn variant="primary" type="submit" className="w-full">Guardar</Btn>
    </form>
  );
}

function EditarModal({ open, onClose, card, onSave }: { open: boolean; onClose: () => void; card: { banco: string; color?: string; nombre: string; terminacion?: string; limite?: number; diaCorte: number; notas?: string }; onSave: (p: Partial<typeof card>) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Editar tarjeta">
      {open && <EditarForm card={card} onSave={onSave} />}
    </Modal>
  );
}
function EditarForm({ card, onSave }: { card: { banco: string; color?: string; nombre: string; terminacion?: string; limite?: number; diaCorte: number; notas?: string }; onSave: (p: Partial<typeof card>) => void }) {
  const [f, setF] = useState({ banco: card.banco, color: (isColorId(card.color) ? card.color : "") as BancoColor["color"], nombre: card.nombre, terminacion: card.terminacion ?? "", limite: (card.limite ?? "") as number | "", dia: card.diaCorte as number | "", notas: card.notas ?? "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ banco: f.banco.trim(), color: f.color || undefined, nombre: f.nombre.trim(), terminacion: f.terminacion || undefined, limite: f.limite === "" ? undefined : f.limite, diaCorte: Number(f.dia), notas: f.notas.trim() || undefined }); }} className="space-y-3">
      <BancoColorFields value={f} onChange={(v) => setF({ ...f, ...v })} nombre={f.nombre} terminacion={f.terminacion} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Field>
        <Field label="Últimos 4 dígitos"><Input value={f.terminacion} onChange={(e) => setF({ ...f, terminacion: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" /></Field>
        <Field label="Día de corte"><NumInput value={f.dia} onChange={(n) => setF({ ...f, dia: n })} min={1} max={31} required /></Field>
      </div>
      <Field label="Límite de crédito"><NumInput value={f.limite} onChange={(n) => setF({ ...f, limite: n })} min={0} /></Field>
      <Field label="Notas"><Input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} maxLength={300} /></Field>
      <Btn variant="primary" type="submit" className="w-full">Guardar</Btn>
    </form>
  );
}
