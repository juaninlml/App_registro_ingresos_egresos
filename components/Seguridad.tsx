"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useToast } from "@/components/motion";
import { Btn, Card, Field, Input, Modal } from "@/components/ui";
import { fdate } from "@/lib/dates";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j as T;
}

/** Códigos de recuperación y cambio de teléfono del Authenticator. */
export function Seguridad() {
  const toast = useToast();
  const [estado, setEstado] = useState<{ restantes: number; creado: string | null } | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [generando, setGenerando] = useState(false);
  const [cambio, setCambio] = useState<{ qr: string; secret: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const cargar = () => api<{ restantes: number; creado: string | null }>("/api/auth/recovery").then(setEstado).catch(() => setEstado(null));
  useEffect(() => {
    void cargar();
  }, []);

  async function generar() {
    if (estado?.restantes && !confirm("Los códigos anteriores dejarán de funcionar. ¿Generar nuevos?")) return;
    setGenerando(true);
    try {
      const { codigos } = await api<{ codigos: string[] }>("/api/auth/recovery", { method: "POST" });
      setCodigos(codigos);
      void cargar();
    } catch (e) {
      toast({ tone: "danger", title: "No se generaron los códigos", detail: (e as Error).message });
    } finally {
      setGenerando(false);
    }
  }

  function descargar() {
    if (!codigos) return;
    const txt = `Kakeibo · códigos de recuperación\nGenerados el ${fdate(new Date().toISOString().slice(0, 10))}\nCada código sirve una sola vez para entrar si pierdes tu teléfono.\n\n${codigos.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kakeibo-codigos-recuperacion.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function empezarCambio() {
    setErr(null);
    setCodigo("");
    try {
      setCambio(await api<{ qr: string; secret: string }>("/api/auth/reenroll", { method: "POST", body: JSON.stringify({ action: "start" }) }));
    } catch (e) {
      toast({ tone: "danger", title: "No se pudo iniciar el cambio", detail: (e as Error).message });
    }
  }

  async function confirmarCambio(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/auth/reenroll", { method: "POST", body: JSON.stringify({ action: "confirm", code: codigo }) });
      setCambio(null);
      toast({ tone: "ok", title: "Authenticator actualizado", detail: "Desde ahora entras con el código de tu teléfono nuevo" });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Códigos de recuperación</h3>
        <p className="mt-0.5 text-sm text-muted">
          Si pierdes el teléfono con Google Authenticator, entras con uno de estos códigos (cada uno sirve una vez) y después vinculas tu teléfono nuevo.
        </p>
        <p className="mt-2 text-sm">
          {estado === null ? "…" : estado.restantes ? <>Tienes <b>{estado.restantes}</b> código{estado.restantes === 1 ? "" : "s"} sin usar{estado.creado ? ` · generados el ${fdate(estado.creado.slice(0, 10))}` : ""}.</> : <span className="text-warn">Aún no tienes códigos de recuperación.</span>}
        </p>
        <Btn className="mt-2" variant={estado?.restantes ? "soft" : "primary"} disabled={generando} onClick={() => void generar()}>{generando ? "Generando…" : estado?.restantes ? "Generar códigos nuevos" : "Generar códigos"}</Btn>
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Cambiar de teléfono</h3>
        <p className="mt-0.5 text-sm text-muted">Vincula Google Authenticator en otro teléfono. El actual sigue funcionando hasta que confirmes el nuevo.</p>
        <Btn className="mt-2" onClick={() => void empezarCambio()}>Cambiar teléfono</Btn>
      </div>

      <Modal open={!!codigos} onClose={() => setCodigos(null)} title="Guarda tus códigos">
        {codigos && (
          <div className="space-y-3">
            <p className="text-sm text-warn">Solo se muestran esta vez. Guárdalos fuera de tu teléfono (impresos o en tu gestor de contraseñas).</p>
            <ol className="num grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 font-mono text-sm tracking-wider">
              {codigos.map((c) => <li key={c} className="select-all text-center">{c}</li>)}
            </ol>
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={() => void navigator.clipboard?.writeText(codigos.join("\n")).then(() => toast({ tone: "accent", title: "Códigos copiados" }))}>Copiar</Btn>
              <Btn className="flex-1" onClick={descargar}>Descargar .txt</Btn>
            </div>
            <Btn variant="primary" className="w-full" onClick={() => setCodigos(null)}>Ya los guardé</Btn>
          </div>
        )}
      </Modal>

      <Modal open={!!cambio} onClose={() => setCambio(null)} title="Vincular teléfono nuevo">
        {cambio && (
          <form onSubmit={confirmarCambio} className="space-y-3">
            <p className="text-sm text-muted">1. En el teléfono nuevo, abre Google Authenticator y escanea este código.</p>
            <div className="flex justify-center rounded-xl bg-white p-3"><Image src={cambio.qr} alt="Código QR para Google Authenticator" width={220} height={220} unoptimized /></div>
            <p className="break-all text-center font-mono text-xs text-muted">{cambio.secret}</p>
            <Field label="2. Escribe el código de 6 dígitos que aparece">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="num text-center text-xl tracking-[0.3em]" required autoFocus />
            </Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Btn variant="primary" type="submit" disabled={codigo.length !== 6} className="w-full">Confirmar</Btn>
          </form>
        )}
      </Modal>
    </Card>
  );
}
