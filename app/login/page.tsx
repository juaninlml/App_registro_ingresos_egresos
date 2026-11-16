"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Btn } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.configured === false) setSetup(true);
        if (j.error) setErr(j.error);
      })
      .catch(() => {});
  }, []);

  async function enviar(c: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (j.needsSetup) setSetup(true);
      setErr(j.error ?? "No se pudo iniciar sesión");
      setCode("");
      input.current?.focus();
    } catch {
      setErr("Sin conexión con el servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) void enviar(code);
        }}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Mis Finanzas</h1>
        <p className="mt-1 text-sm text-muted">Escribe el código de 6 dígitos de Google Authenticator.</p>
        <input
          ref={input}
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) void enviar(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-label="Código de verificación"
          className="num mt-5 w-full rounded-xl border border-border bg-bg px-3 py-3 text-center text-3xl tracking-[0.4em] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
        <Btn variant="primary" type="submit" disabled={busy || code.length !== 6} className="mt-4 w-full">
          {busy ? "Verificando…" : "Entrar"}
        </Btn>
        {setup && (
          <p className="mt-4 text-center text-sm text-muted">
            Primera vez: <Link href="/setup" className="font-medium text-accent underline">configurar Google Authenticator</Link>
          </p>
        )}
      </form>
    </main>
  );
}
