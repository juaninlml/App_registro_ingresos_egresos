"use client";
import { useState } from "react";
import { useData, type Write } from "@/components/DataProvider";
import { IconCredito, IconDeshacer, IconMas } from "@/components/icons";
import { AnimatedNumber, useToast } from "@/components/motion";
import { Badge, Btn, Card, Empty, Field, Input, Modal, NumInput, PageHeader, Progress, Section, TableWrap, td, th } from "@/components/ui";
import { daysBetween, fdate, fshort } from "@/lib/dates";
import { loanSchedule, loanSummary, pagoCalculado } from "@/lib/loan";
import { mxn, uid } from "@/lib/money";
import type { Loan, Payment } from "@/lib/types";

export default function Prestamos() {
  const { db, save, commit, today } = useData();
  const toast = useToast();
  const [edit, setEdit] = useState<Loan | "nuevo" | null>(null);
  const [ver, setVer] = useState<string | null>(null);

  const loansCon = (l: Loan) => ({ key: "loans" as const, value: db.loans.map((x) => (x.id === l.id ? l : x)) });

  /** Registra el siguiente pago: sube el contador y guarda el abono, juntos. */
  const registrarPago = (l: Loan, monto: number) => {
    const n = l.pagosHechos + 1;
    const abono: Payment = { id: uid(), fecha: today, monto, destino: "loan", targetId: l.id, nota: `Pago ${n}`, loanPago: n };
    return commit([loansCon({ ...l, pagosHechos: n }), { key: "payments", value: [...db.payments, abono] }]);
  };

  /** Deshace el último pago: baja el contador y quita el abono que se registró con él. */
  const deshacerPago = (l: Loan) => {
    const n = l.pagosHechos;
    const deEste = db.payments.filter((p) => p.destino === "loan" && p.targetId === l.id);
    // abonos nuevos llevan `loanPago`; los anteriores solo la nota "Pago n"
    const abono = deEste.find((p) => p.loanPago === n) ?? deEste.filter((p) => p.loanPago === undefined && p.nota === `Pago ${n}`).at(-1);
    const writes: Write[] = [loansCon({ ...l, pagosHechos: n - 1 })];
    if (abono) writes.push({ key: "payments", value: db.payments.filter((p) => p !== abono) });
    return commit(writes);
  };

  const borrarPrestamo = (l: Loan) =>
    commit([
      { key: "loans", value: db.loans.filter((x) => x.id !== l.id) },
      { key: "payments", value: db.payments.filter((p) => !(p.destino === "loan" && p.targetId === l.id)) },
    ]);

  return (
    <>
      <PageHeader title="Créditos personales" sub="Tabla de amortización y pagos" actions={<Btn variant="primary" onClick={() => setEdit("nuevo")}><IconMas size={18} />Nuevo crédito</Btn>} />
      {!db.loans.length ? (
        <Empty>Agrega tu crédito personal (monto, tasa anual, plazo y fecha del primer pago) para ver la amortización.</Empty>
      ) : (
        db.loans.map((l) => {
          const s = loanSummary(l);
          const rows = loanSchedule(l);
          const abierta = ver === l.id;
          const d = s.proximo ? daysBetween(today, s.proximo.fecha) : null;
          return (
            <Section key={l.id} title={`${l.banco} · ${l.nombre}`}>
              <Card>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><div className="text-xs text-muted">Saldo</div><div className="text-lg font-semibold"><AnimatedNumber value={s.saldo} tone={{ up: "danger", down: "ok" }} /></div></div>
                  <div><div className="text-xs text-muted">Pago mensual</div><div className="num text-lg font-semibold">{mxn(s.pago)}</div></div>
                  <div>
                    <div className="text-xs text-muted">Próximo pago</div>
                    <div className="font-semibold">{s.proximo ? fshort(s.proximo.fecha) : "Liquidado"}</div>
                    {d !== null && <Badge tone={d < 0 ? "danger" : d <= 7 ? "warn" : "muted"}>{d < 0 ? `Vencido ${-d} d` : d === 0 ? "Hoy" : `En ${d} días`}</Badge>}
                  </div>
                  <div><div className="text-xs text-muted">Termina</div><div className="font-semibold">{s.fechaTermino ? fshort(s.fechaTermino) : "—"}</div></div>
                </div>
                <div className="mt-3"><Progress value={l.pagosHechos} max={l.plazoMeses} label={`Pagos hechos de ${l.nombre}`} /></div>
                <div className="mt-1 flex justify-between text-xs text-muted"><span>{l.pagosHechos} de {l.plazoMeses} pagos</span><span>Intereses{l.ivaPct ? " + IVA" : ""} totales: {mxn(s.interesTotal)}</span></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.proximo && (
                    <Btn variant="primary" small onClick={async () => {
                      const n = l.pagosHechos + 1;
                      if (await registrarPago(l, s.proximo!.pago)) {
                        toast({ tone: "accent", icon: <IconCredito size={18} />, title: `Pago ${n} de ${l.plazoMeses} registrado`, detail: `${mxn(s.proximo!.pago)} · ${l.nombre}${n === l.plazoMeses ? " · ¡crédito liquidado!" : ""}` });
                      }
                    }}>Registrar pago {l.pagosHechos + 1}</Btn>
                  )}
                  {l.pagosHechos > 0 && <Btn small onClick={async () => {
                    if (!confirm("¿Deshacer el último pago registrado?")) return;
                    if (await deshacerPago(l)) toast({ tone: "muted", icon: <IconDeshacer size={18} />, title: `Pago ${l.pagosHechos} deshecho`, detail: l.nombre });
                  }}>Deshacer último</Btn>}
                  <Btn small onClick={() => setVer(abierta ? null : l.id)}>{abierta ? "Ocultar tabla" : "Ver amortización"}</Btn>
                  <Btn small onClick={() => setEdit(l)}>Editar</Btn>
                  <Btn small variant="danger" onClick={() => confirm(`¿Borrar "${l.nombre}"? También se borrarán sus pagos registrados.`) && void borrarPrestamo(l)}>Borrar</Btn>
                </div>
              </Card>
              {abierta && (
                <div className="mt-3">
                  <TableWrap>
                    <thead><tr><th className={th}>#</th><th className={th}>Fecha</th><th className={th}>Pago</th><th className={th}>Capital</th><th className={th}>Interés</th>{l.ivaPct ? <th className={th}>IVA</th> : null}<th className={th}>Saldo</th><th className={th}></th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.n} className={r.pagado ? "text-muted" : ""}>
                          <td className={td}>{r.n}</td><td className={td}>{fdate(r.fecha)}</td><td className={td}>{mxn(r.pago)}</td><td className={td}>{mxn(r.capital)}</td><td className={td}>{mxn(r.interes)}</td>
                          {l.ivaPct ? <td className={td}>{mxn(r.iva)}</td> : null}
                          <td className={td}>{mxn(r.saldo)}</td><td className={td}>{r.pagado ? <Badge tone="ok">pagado</Badge> : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </div>
              )}
            </Section>
          );
        })
      )}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === "nuevo" ? "Nuevo crédito" : "Editar crédito"}>
        {edit !== null && <LoanForm key={edit === "nuevo" ? "n" : edit.id} loan={edit === "nuevo" ? null : edit} today={today} onSave={async (l) => {
          const ok = edit === "nuevo" ? await save("loans", [...db.loans, { ...l, id: uid() }]) : await save("loans", db.loans.map((x) => (x.id === (edit as Loan).id ? { ...l, id: x.id } : x)));
          if (ok) setEdit(null);
        }} />}
      </Modal>
    </>
  );
}

function LoanForm({ loan, onSave, today }: { loan: Loan | null; today: string; onSave: (l: Loan) => void }) {
  const [f, setF] = useState({
    nombre: loan?.nombre ?? "Crédito personal", banco: loan?.banco ?? "Santander",
    monto: (loan?.montoOriginal ?? "") as number | "", tasa: (loan?.tasaAnual ?? "") as number | "", plazo: (loan?.plazoMeses ?? "") as number | "",
    primer: loan?.primerPago ?? today, pago: (loan?.pagoMensual ?? "") as number | "", iva: (loan?.ivaPct ?? 16) as number | "", hechos: (loan?.pagosHechos ?? 0) as number | "",
  });
  const calc = f.monto !== "" && f.tasa !== "" && f.plazo !== "" ? pagoCalculado({ id: "", nombre: "", banco: "", montoOriginal: Number(f.monto), tasaAnual: Number(f.tasa), plazoMeses: Number(f.plazo), primerPago: f.primer, ivaPct: Number(f.iva) || 0, pagosHechos: 0 }) : null;
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSave({ id: loan?.id ?? "", nombre: f.nombre.trim(), banco: f.banco.trim(), montoOriginal: Number(f.monto), tasaAnual: Number(f.tasa), plazoMeses: Number(f.plazo), primerPago: f.primer, pagoMensual: f.pago === "" ? undefined : f.pago, ivaPct: f.iva === "" || f.iva === 0 ? undefined : f.iva, pagosHechos: Number(f.hechos) || 0, notas: loan?.notas });
    }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={60} /></Field>
        <Field label="Banco"><Input value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} required maxLength={40} /></Field>
        <Field label="Monto del crédito"><NumInput value={f.monto} onChange={(n) => setF({ ...f, monto: n })} min={1} required /></Field>
        <Field label="Tasa anual (%)"><NumInput value={f.tasa} onChange={(n) => setF({ ...f, tasa: n })} min={0} required /></Field>
        <Field label="Plazo (meses)"><NumInput value={f.plazo} onChange={(n) => setF({ ...f, plazo: n })} min={1} max={600} required /></Field>
        <Field label="Fecha del primer pago"><Input type="date" value={f.primer} onChange={(e) => setF({ ...f, primer: e.target.value })} required /></Field>
        <Field label="IVA sobre intereses (%)" hint="16 si tu banco lo cobra"><NumInput value={f.iva} onChange={(n) => setF({ ...f, iva: n })} min={0} max={30} /></Field>
        <Field label="Pagos ya hechos"><NumInput value={f.hechos} onChange={(n) => setF({ ...f, hechos: n })} min={0} /></Field>
      </div>
      <Field label="Pago mensual del contrato (opcional)" hint={calc ? `Calculado: ${mxn(calc)}. Escribe el de tu contrato si es distinto.` : "Si lo dejas vacío se calcula."}><NumInput value={f.pago} onChange={(n) => setF({ ...f, pago: n })} min={0} /></Field>
      <Btn variant="primary" type="submit" className="w-full">Guardar</Btn>
    </form>
  );
}
