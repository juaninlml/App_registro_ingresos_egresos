"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/components/DataProvider";
import { Btn, Card, Field, Input, PageHeader, Section } from "@/components/ui";

export default function Ajustes() {
  const { db, save, reload } = useData();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nueva, setNueva] = useState({ gasto: "", ingreso: "" });

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

  const cats = [
    { k: "categoriasGasto" as const, titulo: "Categorías de gasto", nuevo: nueva.gasto, set: (v: string) => setNueva({ ...nueva, gasto: v }) },
    { k: "categoriasIngreso" as const, titulo: "Categorías de ingreso", nuevo: nueva.ingreso, set: (v: string) => setNueva({ ...nueva, ingreso: v }) },
  ];

  return (
    <>
      <PageHeader title="Ajustes" />

      <Section title="Respaldo">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Descarga un respaldo completo en JSON, o importa uno (por ejemplo <code className="rounded bg-surface-2 px-1">datos-iniciales.json</code> con los datos de tu Excel).</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" download><Btn>Descargar respaldo</Btn></a>
            <Btn variant="primary" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Importando…" : "Importar respaldo"}</Btn>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
          </div>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.t}</p>}
        </Card>
      </Section>

      {cats.map((c) => (
        <Section key={c.k} title={c.titulo}>
          <Card>
            <div className="mb-3 flex flex-wrap gap-2">
              {db.settings[c.k].map((x) => (
                <span key={x} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                  {x}
                  <button aria-label={`Quitar ${x}`} className="rounded-full px-2 text-muted hover:bg-border" onClick={() => db.settings[c.k].length > 1 && save("settings", { ...db.settings, [c.k]: db.settings[c.k].filter((y) => y !== x) })}>✕</button>
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

      <Section title="Sesión">
        <Card className="space-y-2">
          <Btn onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); }}>Cerrar sesión</Btn>
          <p className="text-xs text-muted">Para cerrar todas las sesiones abiertas, cambia la variable SESSION_SECRET en Vercel y vuelve a desplegar.</p>
        </Card>
      </Section>
    </>
  );
}
