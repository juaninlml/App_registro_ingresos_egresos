"use client";
import { useRef, useState } from "react";
import { useData } from "./DataProvider";
import { Badge, Btn, Field, Input, Modal, NumInput, TableWrap, td, th } from "./ui";
import { readStatementPdf } from "@/lib/statement-import";
import { addMonths, fdate } from "@/lib/dates";
import { mxn, uid } from "@/lib/money";
import type { ParsedStatement } from "@/lib/statement";
import type { Card, Msi } from "@/lib/types";

interface Row {
  key: string;
  incluir: boolean;
  descripcion: string;
  fechaOperacion: string;
  montoOriginal: number | "";
  pagoMensual: number | "";
  pagoActual: number | "";
  totalPagos: number | "";
  terminacion: string;
  existenteId: string | null;
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.015;

/** Sin `card`, crea una tarjeta nueva a partir del estado de cuenta. */
export function ImportStatement({ card, open, onClose, onCreated }: { card: Card | null; open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { db, commit } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<"elegir" | "leyendo" | "revisar">("elegir");
  const [estado, setEstado] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<ParsedStatement | null>(null);
  const [f, setF] = useState({ corte: "", limite: "", total: "" as number | "", pago: "" as number | "", minimo: "" as number | "", limiteCredito: "" as number | "" });
  const [rows, setRows] = useState<Row[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [nc, setNc] = useState({ banco: "", nombre: "", terminacion: "" });

  function reset() {
    setFase("elegir");
    setErr(null);
    setP(null);
    setRows([]);
    if (input.current) input.current.value = "";
  }
  function cerrar() {
    reset();
    onClose();
  }

  async function leer(file: File) {
    setErr(null);
    setFase("leyendo");
    try {
      const parsed = await readStatementPdf(file, setEstado);
      setP(parsed);
      setF({ corte: parsed.fechaCorte, limite: parsed.fechaLimite, total: parsed.saldoTotal, pago: parsed.pagoNoIntereses, minimo: parsed.pagoMinimo ?? "", limiteCredito: parsed.limiteCredito ?? "" });
      if (!card) setNc({ banco: parsed.banco ?? "", nombre: parsed.nombreTarjeta ?? "", terminacion: "" });
      const mine = card ? db.msi.filter((m) => m.cardId === card.id) : [];
      setRows(
        parsed.msi.map((m, i) => {
          const ex = mine.find((x) => x.fechaOperacion === m.fechaOperacion && close(x.montoOriginal, m.montoOriginal));
          return {
            key: String(i),
            incluir: !ex,
            descripcion: m.descripcion,
            fechaOperacion: m.fechaOperacion,
            montoOriginal: m.montoOriginal,
            pagoMensual: m.pagoRequerido,
            pagoActual: m.pagoActual,
            totalPagos: m.totalPagos,
            terminacion: m.terminacionTarjeta ?? "",
            existenteId: ex?.id ?? null,
          };
        }),
      );
      setFase("revisar");
    } catch (e) {
      setErr((e as Error).message);
      setFase("elegir");
    }
  }

  const upd = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function guardar() {
    if (!p || f.total === "" || f.pago === "" || !f.corte || !f.limite) return;
    setGuardando(true);
    setErr(null);
    const statement = { fechaCorte: f.corte, fechaLimite: f.limite, saldoTotal: Number(f.total), pagoNoIntereses: Number(f.pago), pagoMinimo: f.minimo === "" ? undefined : Number(f.minimo) };
    if (!card && (!nc.banco.trim() || !nc.nombre.trim())) {
      setErr("Escribe el banco y el nombre de la tarjeta.");
      setGuardando(false);
      return;
    }
    const cardId = card?.id ?? uid();
    const nuevaCard: Card = card
      ? {
          ...card,
          limite: f.limiteCredito === "" ? card.limite : Number(f.limiteCredito),
          statements: [...card.statements.filter((s) => s.fechaCorte !== f.corte), statement],
        }
      : {
          id: cardId,
          banco: nc.banco.trim(),
          nombre: nc.nombre.trim(),
          terminacion: nc.terminacion.trim() || undefined,
          limite: f.limiteCredito === "" ? undefined : Number(f.limiteCredito),
          diaCorte: Number(f.corte.slice(8, 10)),
          statements: [statement],
        };
    let msi = [...db.msi];
    for (const r of rows.filter((x) => x.incluir)) {
      if (r.montoOriginal === "" || r.pagoMensual === "" || r.pagoActual === "" || r.totalPagos === "") continue;
      const m: Omit<Msi, "id"> = {
        cardId,
        descripcion: r.descripcion.trim() || "Cargo a meses",
        fechaOperacion: r.fechaOperacion,
        montoOriginal: Number(r.montoOriginal),
        pagoMensual: Number(r.pagoMensual),
        totalPagos: Number(r.totalPagos),
        primerCorte: addMonths(f.corte, -(Number(r.pagoActual) - 1)),
        terminacionTarjeta: r.terminacion || undefined,
      };
      if (r.existenteId) msi = msi.map((x) => (x.id === r.existenteId ? { ...m, id: x.id } : x));
      else msi.push({ ...m, id: uid() });
    }
    // tarjeta (con el nuevo estado de cuenta) y MSI se guardan juntos
    const ok = await commit([
      { key: "cards", value: card ? db.cards.map((c) => (c.id === card.id ? nuevaCard : c)) : [...db.cards, nuevaCard] },
      { key: "msi", value: msi },
    ]);
    setGuardando(false);
    if (ok) {
      cerrar();
      if (!card) onCreated?.(cardId);
    }
    else setErr("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
  }

  const nuevos = rows.filter((r) => r.incluir && !r.existenteId).length;
  const actualiza = rows.filter((r) => r.incluir && r.existenteId).length;

  return (
    <Modal open={open} onClose={cerrar} title={card ? "Subir estado de cuenta (PDF)" : "Crear tarjeta desde estado de cuenta (PDF)"}>
      {fase === "elegir" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Sube el PDF y la app leerá fechas, pagos y cargos a meses. Antes de guardar podrás revisar y corregir todo.
          </p>
          <p className="rounded-xl bg-accent-soft p-3 text-xs text-accent-text">
            El PDF se lee en tu propio dispositivo: no se envía a ningún servidor ni servicio externo. Tarda alrededor de un minuto y está pensado para estados de cuenta de Santander.
          </p>
          <input ref={input} type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && void leer(e.target.files[0])} className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-fg" />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
      )}

      {fase === "leyendo" && <p role="status" className="py-8 text-center text-sm text-muted">{estado}</p>}

      {fase === "revisar" && p && (
        <div className="space-y-5">
          {p.advertencias.length > 0 && (
            <ul className="list-disc space-y-1 rounded-xl bg-warn-soft p-3 pl-7 text-xs text-warn">
              {p.advertencias.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
          {!card && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Datos de la tarjeta nueva</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Banco"><Input value={nc.banco} onChange={(e) => setNc({ ...nc, banco: e.target.value })} maxLength={40} placeholder="Santander" /></Field>
                <Field label="Nombre"><Input value={nc.nombre} onChange={(e) => setNc({ ...nc, nombre: e.target.value })} maxLength={40} placeholder="Unique" /></Field>
                <Field label="Últimos 4 dígitos (opcional)"><Input value={nc.terminacion} onChange={(e) => setNc({ ...nc, terminacion: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" /></Field>
                <Field label="Día de corte"><Input value={f.corte ? String(Number(f.corte.slice(8, 10))) : ""} readOnly /></Field>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-semibold">Estado de cuenta</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de corte"><Input type="date" value={f.corte} onChange={(e) => setF({ ...f, corte: e.target.value })} /></Field>
              <Field label="Fecha límite"><Input type="date" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value })} /></Field>
              <Field label="Saldo deudor total"><NumInput value={f.total} onChange={(n) => setF({ ...f, total: n })} /></Field>
              <Field label="Pago para no generar intereses"><NumInput value={f.pago} onChange={(n) => setF({ ...f, pago: n })} /></Field>
              <Field label="Pago mínimo"><NumInput value={f.minimo} onChange={(n) => setF({ ...f, minimo: n })} /></Field>
              <Field label="Límite de crédito"><NumInput value={f.limiteCredito} onChange={(n) => setF({ ...f, limiteCredito: n })} /></Field>
            </div>
            {card?.statements.some((s) => s.fechaCorte === f.corte) && <p className="mt-2 text-xs text-warn">Ya existe un estado con ese corte; se reemplazará.</p>}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Cargos a meses sin intereses ({rows.length})</h4>
            {!rows.length ? <p className="text-sm text-muted">No se detectaron cargos a meses.</p> : (
              <TableWrap>
                <thead><tr><th className={th}></th><th className={th}>Descripción</th><th className={th}>Compra</th><th className={th}>Monto</th><th className={th}>Mensual</th><th className={th}>Pago</th><th className={th}>de</th><th className={th}>Estado</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.incluir ? "" : "opacity-60"}>
                      <td className={td}><input type="checkbox" checked={r.incluir} onChange={(e) => upd(r.key, { incluir: e.target.checked })} aria-label={`Incluir ${r.descripcion}`} /></td>
                      <td className={td}><Input value={r.descripcion} onChange={(e) => upd(r.key, { descripcion: e.target.value })} className="min-w-44 py-1" /></td>
                      <td className={td}>{fdate(r.fechaOperacion)}</td>
                      <td className={td}><NumInput value={r.montoOriginal} onChange={(n) => upd(r.key, { montoOriginal: n })} className="w-28 py-1" /></td>
                      <td className={td}><NumInput value={r.pagoMensual} onChange={(n) => upd(r.key, { pagoMensual: n })} className="w-24 py-1" /></td>
                      <td className={td}><NumInput value={r.pagoActual} onChange={(n) => upd(r.key, { pagoActual: n })} className="w-16 py-1" /></td>
                      <td className={td}><NumInput value={r.totalPagos} onChange={(n) => upd(r.key, { totalPagos: n })} className="w-16 py-1" /></td>
                      <td className={td}>{r.existenteId ? <Badge tone="muted">ya registrado</Badge> : <Badge tone="accent">nuevo</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            <p className="mt-2 text-xs text-muted">Los «ya registrados» vienen sin marcar. Márcalos solo si quieres actualizar sus datos con los del PDF.</p>
          </div>

          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2">
            <Btn onClick={reset} className="flex-1">Elegir otro PDF</Btn>
            <Btn variant="primary" onClick={guardar} disabled={guardando || f.total === "" || f.pago === ""} className="flex-1">
              {guardando ? "Guardando…" : `${card ? "Guardar" : "Crear tarjeta"} (${nuevos} nuevos${actualiza ? `, ${actualiza} a actualizar` : ""})`}
            </Btn>
          </div>
          <p className="text-center text-xs text-muted">Resumen: {mxn(Number(f.pago) || 0)} para no generar intereses.</p>
        </div>
      )}
    </Modal>
  );
}
