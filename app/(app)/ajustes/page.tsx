"use client";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readTxMonth, useData, type Write } from "@/components/DataProvider";
import { IconCerrar } from "@/components/icons";
import { useToast } from "@/components/motion";
import { PresupuestoEditor } from "@/components/Presupuesto";
import { Seguridad } from "@/components/Seguridad";
import { Btn, Card, Field, Input, Modal, PageHeader, Section } from "@/components/ui";
import { movimientosCSV } from "@/lib/csv";
import { PAGO_TARJETA, type Transaction } from "@/lib/types";

type Lista = "categoriasGasto" | "categoriasIngreso";

/** Lee el respaldo completo (todas las secciones y todos los meses de movimientos). */
async function leerTodo(): Promise<{ tx: Record<string, Transaction[]> }> {
  const r = await fetch("/api/export", { cache: "no-store" });
  if (!r.ok) throw new Error("No se pudieron leer tus movimientos");
  return r.json();
}

export default function Ajustes() {
  const { db, save, commit, reload, today } = useData();
  const router = useRouter();
  const toast = useToast();
  const recuperacion = useSearchParams().get("recuperacion") === "1";
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState(false);
  const [nueva, setNueva] = useState({ gasto: "", ingreso: "" });
  const [renombrar, setRenombrar] = useState<{ lista: Lista; actual: string; nuevo: string } | null>(null);
  const [renombrando, setRenombrando] = useState(false);

  async function importar(f: File) {
    if (!confirm("Importar reemplaza las secciones incluidas en el archivo (tarjetas, MSI, plan, movimientos…). ¿Continuar?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/import", { method: "POST", body: await f.text() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se pudo importar");
      await reload();
      setMsg({ ok: true, t: `Importado: ${(j.secciones as string[]).join(", ")}` });
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  /** Descarga todos los movimientos en un CSV que se abre en Excel. */
  async function descargarCSV() {
    setCsv(true);
    try {
      const { tx } = await leerTodo();
      const todos = Object.values(tx).flat();
      const url = URL.createObjectURL(new Blob([movimientosCSV(todos, db.cards)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `kakeibo-movimientos-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ tone: "accent", title: "CSV descargado", detail: `${todos.length} movimientos` });
    } catch (e) {
      toast({ tone: "danger", title: "No se pudo exportar", detail: (e as Error).message });
    } finally {
      setCsv(false);
    }
  }

  /**
   * Renombra una categoría en todas partes, en una sola escritura: la lista de categorías, el presupuesto,
   * los gastos/ingresos fijos y cada movimiento que la usa.
   */
  async function aplicarRenombre(e: React.FormEvent) {
    e.preventDefault();
    if (!renombrar) return;
    const { lista, actual } = renombrar;
    const nuevo = renombrar.nuevo.trim();
    if (!nuevo || nuevo === actual) return setRenombrar(null);
    if (db.settings[lista].includes(nuevo)) {
      toast({ tone: "warn", title: "Esa categoría ya existe", detail: `Elige otro nombre para «${actual}»` });
      return;
    }
    setRenombrando(true);
    try {
      const tipo = lista === "categoriasGasto" ? "gasto" : "ingreso";
      const { tx } = await leerTodo();
      const meses = Object.entries(tx).filter(([, l]) => l.some((t) => t.tipo === tipo && t.categoria === actual)).map(([m]) => m);
      if (meses.length > 36) throw new Error("Hay demasiados meses con esa categoría para cambiarlos de una vez");
      // se vuelve a leer cada mes para tener su versión actual (evita pisar cambios de otro dispositivo)
      const frescos = await Promise.all(meses.map(readTxMonth));
      const presupuestos = { ...(db.settings.presupuestos ?? {}) };
      if (lista === "categoriasGasto" && actual in presupuestos) {
        presupuestos[nuevo] = presupuestos[actual];
        delete presupuestos[actual];
      }
      const writes: Write[] = [
        { key: "settings", value: { ...db.settings, [lista]: db.settings[lista].map((c) => (c === actual ? nuevo : c)), presupuestos } },
        { key: "fijos", value: db.fijos.map((f) => ((f.tipo === "ingreso" ? "ingreso" : "gasto") === tipo && f.categoria === actual ? { ...f, categoria: nuevo } : f)) },
        ...meses.map((m, i) => ({ key: `tx:${m}` as const, value: frescos[i].map((t) => (t.tipo === tipo && t.categoria === actual ? { ...t, categoria: nuevo } : t)) })),
      ];
      const n = meses.reduce((s, _, i) => s + frescos[i].filter((t) => t.tipo === tipo && t.categoria === actual).length, 0);
      setRenombrar(null);
      if (await commit(writes)) toast({ tone: "accent", title: `«${actual}» ahora es «${nuevo}»`, detail: `${n} movimiento${n === 1 ? "" : "s"} actualizado${n === 1 ? "" : "s"}` });
    } catch (err) {
      toast({ tone: "danger", title: "No se pudo renombrar", detail: (err as Error).message });
    } finally {
      setRenombrando(false);
    }
  }

  const cats = [
    { k: "categoriasGasto" as const, titulo: "Categorías de gasto", nuevo: nueva.gasto, set: (v: string) => setNueva({ ...nueva, gasto: v }) },
    { k: "categoriasIngreso" as const, titulo: "Categorías de ingreso", nuevo: nueva.ingreso, set: (v: string) => setNueva({ ...nueva, ingreso: v }) },
  ];

  return (
    <>
      <PageHeader title="Ajustes" />
      {recuperacion && (
        <p role="alert" className="mb-5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          Entraste con un código de recuperación (ya no se puede volver a usar). En <b>Seguridad → Cambiar teléfono</b> vincula Google Authenticator en tu teléfono nuevo y genera códigos nuevos.
        </p>
      )}

      <Section title="Respaldo y exportación">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Descarga un respaldo completo en JSON (para restaurar), o tus movimientos en CSV para abrirlos en Excel.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" download><Btn>Descargar respaldo</Btn></a>
            <Btn disabled={csv} onClick={() => void descargarCSV()}>{csv ? "Preparando…" : "Movimientos en CSV"}</Btn>
            <Btn variant="primary" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Importando…" : "Importar respaldo"}</Btn>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
          </div>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.t}</p>}
        </Card>
      </Section>

      <div id="presupuesto" className="scroll-mt-6">
        <Section title="Presupuesto y meta de ahorro">
          {/* se vuelve a montar si las categorías o el presupuesto cambian por otro lado (p. ej. al renombrar) */}
          <PresupuestoEditor key={`${db.settings.categoriasGasto.join("|")}#${JSON.stringify(db.settings.presupuestos ?? {})}#${db.settings.metaAhorro ?? ""}`} />
        </Section>
      </div>

      {cats.map((c) => (
        <Section key={c.k} title={c.titulo}>
          <Card>
            <p className="mb-2 text-xs text-muted">Toca una categoría para cambiarle el nombre (se actualiza en todos tus movimientos).</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {db.settings[c.k].map((x) => (
                <span key={x} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-1 pr-1 text-sm">
                  {x === PAGO_TARJETA ? (
                    <span className="px-2 py-1" title="Categoría especial: no se puede renombrar">{x}</span>
                  ) : (
                    <button type="button" className="press rounded-full px-2 py-1 hover:bg-border" onClick={() => setRenombrar({ lista: c.k, actual: x, nuevo: x })} aria-label={`Renombrar ${x}`}>{x}</button>
                  )}
                  <button type="button" aria-label={`Quitar ${x}`} className="press grid size-7 place-items-center rounded-full text-muted hover:bg-border hover:text-fg" onClick={() => db.settings[c.k].length > 1 && save("settings", { ...db.settings, [c.k]: db.settings[c.k].filter((y) => y !== x) })}><IconCerrar size={14} /></button>
                </span>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const v = c.nuevo.trim();
              if (v && !db.settings[c.k].includes(v)) void save("settings", { ...db.settings, [c.k]: [...db.settings[c.k], v] });
              c.set("");
            }}>
              <Field label="Nueva categoría"><Input value={c.nuevo} onChange={(e) => c.set(e.target.value)} maxLength={40} /></Field>
              <div className="flex items-end"><Btn type="submit" variant="primary">Agregar</Btn></div>
            </form>
          </Card>
        </Section>
      ))}

      <Section title="Seguridad">
        <Seguridad />
      </Section>

      <Section title="Sesión">
        <Card className="space-y-2">
          <Btn onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); }}>Cerrar sesión</Btn>
          <p className="text-xs text-muted">Para cerrar todas las sesiones abiertas, cambia la variable SESSION_SECRET en Vercel y vuelve a desplegar.</p>
        </Card>
      </Section>

      <Modal open={!!renombrar} onClose={() => setRenombrar(null)} title="Renombrar categoría">
        {renombrar && (
          <form onSubmit={aplicarRenombre} className="space-y-3">
            <Field label={`Nuevo nombre para «${renombrar.actual}»`} hint="Se cambia también en tus movimientos, gastos fijos y presupuesto.">
              <Input value={renombrar.nuevo} onChange={(e) => setRenombrar({ ...renombrar, nuevo: e.target.value })} maxLength={40} required autoFocus />
            </Field>
            <Btn variant="primary" type="submit" disabled={renombrando} className="w-full">{renombrando ? "Renombrando…" : "Renombrar"}</Btn>
          </form>
        )}
      </Modal>
    </>
  );
}
