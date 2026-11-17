"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Btn, Field, Input } from "@/components/ui";

async function post<T>(body: object): Promise<T> {
  const r = await fetch("/api/auth/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Error");
  return j as T;
}

/** Registro con el enlace de invitación: datos → escanear QR → confirmar código. */
function Registro() {
  const invite = useSearchParams().get("i") ?? "";
  const [valida, setValida] = useState<boolean | null>(null);
  const [f, setF] = useState({ nombre: "", email: "" });
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invite) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValida(false);
      return;
    }
    post({ action: "check", invite }).then(() => setValida(true)).catch((e: Error) => {
      setValida(false);
      setErr(e.message);
    });
  }, [invite]);

  async function empezar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setQr(await post<{ qr: string; secret: string }>({ action: "start", invite, ...f }));
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
      await post({ action: "confirm", invite, ...f, code });
      try {
        localStorage.setItem("kakeibo:email", f.email.trim().toLowerCase());
      } catch {}
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito: limpia la memoria de la cuenta anterior
      window.location.assign("/ajustes?bienvenida=1");
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="rise-in w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)]">
      <h1 className="text-xl font-semibold">Crear tu cuenta</h1>
      {valida === null ? (
        <p className="mt-3 text-sm text-muted">Revisando la invitación…</p>
      ) : !valida ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-danger">{err ?? "Este enlace no trae una invitación."}</p>
          <p className="text-muted">Pide a quien administra Kakeibo que te mande un enlace nuevo. Si ya tienes cuenta, <Link href="/login" className="font-medium text-accent-text underline">entra aquí</Link>.</p>
        </div>
      ) : !qr ? (
        <form onSubmit={empezar} className="mt-3 space-y-4">
          <p className="text-sm text-muted">Te invitaron a Kakeibo. Tu cuenta y tus datos serán solo tuyos: nadie más (ni quien te invitó) puede verlos.</p>
          <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={60} autoComplete="name" required autoFocus /></Field>
          <Field label="Correo" hint="Con él entrarás a la app."><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} autoComplete="email" required /></Field>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Btn variant="primary" type="submit" disabled={busy} className="w-full">{busy ? "…" : "Continuar"}</Btn>
        </form>
      ) : (
        <form onSubmit={confirmar} className="mt-3 space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Instala <b className="text-fg">Google Authenticator</b> en tu teléfono.</li>
            <li>Toca «+» → «Escanear código QR» y escanea este código.</li>
            <li>Escribe el código de 6 dígitos que aparezca.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.qr} alt="Código QR para Google Authenticator" width={220} height={220} className="mx-auto rounded-xl bg-white p-2" />
          <p className="break-all text-center text-xs text-muted">Clave manual: <span className="num select-all font-mono">{qr.secret}</span></p>
          <Field label="Código de 6 dígitos">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="num text-center text-xl tracking-[0.3em]" required autoFocus />
          </Field>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Btn variant="primary" type="submit" disabled={busy || code.length !== 6} className="w-full">{busy ? "Creando tu cuenta…" : "Crear cuenta y entrar"}</Btn>
        </form>
      )}
    </div>
  );
}

export default function RegistroPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <Logo size="lg" animado />
      <Suspense fallback={null}>
        <Registro />
      </Suspense>
    </main>
  );
}
