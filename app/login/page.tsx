"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Btn } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  // «recuperacion»: entrar con uno de los códigos de recuperación si perdiste el teléfono
  const [modo, setModo] = useState<"totp" | "recuperacion">("totp");
  const [rec, setRec] = useState("");
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

  async function enviar(body: { code: string } | { recovery: string }) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        // tras entrar con un código de recuperación, lo siguiente es vincular el teléfono nuevo
        router.replace(j.recuperacion ? "/ajustes?recuperacion=1" : "/");
        router.refresh();
        return;
      }
      if (j.needsSetup) setSetup(true);
      setErr(j.error ?? "No se pudo iniciar sesión");
      setCode("");
      setRec("");
      input.current?.focus();
    } catch {
      setErr("Sin conexión con el servidor");
    } finally {
      setBusy(false);
    }
  }

  const cambiar = (m: typeof modo) => {
    setModo(m);
    setErr(null);
    setTimeout(() => input.current?.focus(), 0);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <Logo size="lg" animado />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (modo === "totp" && code.length === 6) void enviar({ code });
          if (modo === "recuperacion" && rec.replace(/[^0-9A-Za-z]/g, "").length === 10) void enviar({ recovery: rec });
        }}
        className="rise-in w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)]"
      >
        <h1 className="text-lg font-semibold">{modo === "totp" ? "Entrar" : "Entrar con código de recuperación"}</h1>
        <p className="mt-1 text-sm text-muted">
          {modo === "totp" ? "Escribe el código de 6 dígitos de Google Authenticator." : "Escribe uno de los códigos que guardaste (por ejemplo ABCDE-23456). Cada código sirve una sola vez."}
        </p>
        {modo === "totp" ? (
          <input
            ref={input}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void enviar({ code: v });
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            aria-label="Código de verificación"
            className="num mt-5 w-full rounded-xl border border-border bg-bg px-3 py-3 text-center text-3xl tracking-[0.4em] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        ) : (
          <input
            ref={input}
            value={rec}
            onChange={(e) => setRec(e.target.value.toUpperCase().slice(0, 11))}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXXX-XXXXX"
            aria-label="Código de recuperación"
            className="mt-5 w-full rounded-xl border border-border bg-bg px-3 py-3 text-center font-mono text-2xl tracking-[0.15em] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        )}
        {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
        <Btn variant="primary" type="submit" disabled={busy || (modo === "totp" ? code.length !== 6 : rec.replace(/[^0-9A-Za-z]/g, "").length !== 10)} className="mt-4 w-full">
          {busy ? "Verificando…" : "Entrar"}
        </Btn>
        <p className="mt-4 text-center text-sm">
          {modo === "totp" ? (
            <button type="button" onClick={() => cambiar("recuperacion")} className="font-medium text-accent-text underline">¿Perdiste tu teléfono? Usa un código de recuperación</button>
          ) : (
            <button type="button" onClick={() => cambiar("totp")} className="font-medium text-accent-text underline">Volver al código de Google Authenticator</button>
          )}
        </p>
        {setup && (
          <p className="mt-2 text-center text-sm text-muted">
            Primera vez: <Link href="/setup" className="font-medium text-accent-text underline">configurar Google Authenticator</Link>
          </p>
        )}
      </form>
    </main>
  );
}
