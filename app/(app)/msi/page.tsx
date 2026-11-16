"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Badge, Card, Empty, Field, NumInput, PageHeader, Select, TableWrap, td, th } from "@/components/ui";
import { fdate, fshort } from "@/lib/dates";
import { creditos } from "@/lib/cuentas";
import { projectCuts } from "@/lib/finance";
import { mxn } from "@/lib/money";

export default function Proyeccion() {
  const { db } = useData();
  const [sel, setSel] = useState("");
  const [compras, setCompras] = useState<number | "">(db.plan?.comprasEstimadas ?? 0);
  const credito = creditos(db.cards);
  const card = credito.find((c) => c.id === sel) ?? credito[0];
  if (!card) return <><PageHeader title="Proyección por corte" /><Empty>Primero agrega una tarjeta de crédito.</Empty></>;
  const rows = projectCuts(card, db.msi, Number(compras) || 0);
  const msis = db.msi.filter((m) => m.cardId === card.id);
  const nombre = (id: string) => msis.find((m) => m.id === id)?.descripcion ?? "?";

  return (
    <>
      <PageHeader title="Proyección por corte" sub="Cuánto pagar antes de cada fecha límite" />
      <Card className="mb-5 grid gap-3 sm:grid-cols-2">
        <Field label="Tarjeta">
          <Select value={card.id} onChange={(e) => setSel(e.target.value)}>
            {credito.map((c) => <option key={c.id} value={c.id}>{c.banco} {c.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Compras estimadas por corte" hint="Compras regulares futuras (0 si ya no usarás la tarjeta)">
          <NumInput value={compras} onChange={setCompras} min={0} />
        </Field>
      </Card>
      {!rows.length ? (
        <Empty>Registra un estado de cuenta para ver la proyección.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr><th className={th}>#</th><th className={th}>Corte</th><th className={th}>Fecha límite</th><th className={th}>Pago MSI</th><th className={th}>Compras</th><th className={th}>Total a pagar</th><th className={th}>Detalle</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.i}>
                <td className={td}>{r.i + 1}</td>
                <td className={td}>{fdate(r.corte)}</td>
                <td className={td}>{fshort(r.limite)}</td>
                <td className={td}>{mxn(r.msiTotal)}</td>
                <td className={td}>{mxn(r.compras)}</td>
                <td className={`${td} font-semibold`}>{mxn(r.total)} {r.real ? <Badge tone="accent">real</Badge> : <Badge>proy.</Badge>}</td>
                <td className={`${td} text-xs text-muted`}>
                  {r.detalle.map((d) => `${nombre(d.msiId)} ${d.k}/${d.totalPagos}`).join(" · ")}
                  {r.terminan > 0 && <> · <Badge tone="ok">termina{r.terminan > 1 ? `n ${r.terminan}` : ""}</Badge></>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
