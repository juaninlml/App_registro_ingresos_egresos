"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Field, Input } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const [setupKey, setSetupKey] = useState("");
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(body: object) {
    const r = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Error");
    return j;
  }

  async function generar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setQr(await post({ action: "start", setupKey }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await post({ action: "confirm", setupKey, code });
      router.replace("/");
      router.refresh();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Configurar acceso</h1>
        {!qr ? (
          <form onSubmit={generar} className="mt-3 space-y-4">
            <p className="text-sm text-muted">
              Escribe la variable <code className="rounded bg-surface-2 px-1">SETUP_KEY</code> que definiste en Vercel. Solo se puede usar mientras no exista un Authenticator configurado.
            </p>
            <Field label="Clave de configuración">
              <Input type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} autoComplete="off" required />
            </Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Btn variant="primary" type="submit" disabled={busy || !setupKey} className="w-full">Generar código QR</Btn>
          </form>
        ) : (
          <form onSubmit={confirmar} className="mt-3 space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Abre Google Authenticator y toca «+» → «Escanear código QR».</li>
              <li>Escanea este código (o captura la clave manualmente).</li>
              <li>Escribe el código de 6 dígitos que aparezca.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="Código QR para Google Authenticator" width={220} height={220} className="mx-auto rounded-xl bg-white p-2" />
            <p className="break-all text-center text-xs text-muted">Clave manual: <span className="num select-all font-mono">{qr.secret}</span></p>
            <Field label="Código de 6 dígitos">
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="num text-center text-xl tracking-[0.3em]" required />
            </Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Btn variant="primary" type="submit" disabled={busy || code.length !== 6} className="w-full">Confirmar y entrar</Btn>
          </form>
        )}
      </div>
    </main>
  );
}
