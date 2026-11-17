"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Btn } from "@/components/ui";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  // «recuperacion»: entrar con uno de los códigos de recuperación si perdiste el teléfono
  const [modo, setModo] = useState<"totp" | "recuperacion">("totp");
  const [rec, setRec] = useState("");
  // el correo se recuerda en este dispositivo para no escribirlo cada vez
  const [email, setEmail] = useState("");
  const [migracion, setMigracion] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  useEffect(() => {
    try {
      const guardado = localStorage.getItem("kakeibo:email");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado) setEmail(guardado);
    } catch {}
    input.current?.focus();
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.configured === false) setSetup(true);
        if (j.migracion) setMigracion(true);
        if (j.error) setErr(j.error);
      })
      .catch(() => {});
  }, []);

  async function enviar(datos: { code: string } | { recovery: string }) {
    if (busy) return;
    if (!emailOk) {
      setErr("Escribe tu correo.");
      return;
    }
    const body = { ...datos, email: email.trim() };
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        try {
          localStorage.setItem("kakeibo:email", email.trim().toLowerCase());
        } catch {}
        // recarga completa: nada de la sesión anterior (otra cuenta) se queda en memoria.
        // Tras entrar con un código de recuperación, lo siguiente es vincular el teléfono nuevo.
         
        window.location.assign(j.recuperacion ? "/ajustes?recuperacion=1" : "/");
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
          {modo === "totp" ? "Tu correo y el código de 6 dígitos de Google Authenticator." : "Tu correo y uno de los códigos que guardaste (por ejemplo ABCDE-23456). Cada código sirve una sola vez."}
        </p>
        {migracion && (
          <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-text">
            Ahora la app tiene cuentas. Escribe tu correo y tu código de siempre: tu cuenta quedará registrada con ese correo como administradora, con todos tus datos.
          </p>
        )}
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-muted">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="tu@correo.com"
            className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </label>
        {modo === "totp" ? (
          <input
            ref={input}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6 && emailOk) void enviar({ code: v });
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            aria-label="Código de verificación"
            className="num mt-3 w-full rounded-xl border border-border bg-bg px-3 py-3 text-center text-3xl tracking-[0.4em] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
            className="mt-3 w-full rounded-xl border border-border bg-bg px-3 py-3 text-center font-mono text-2xl tracking-[0.15em] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        )}
        {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
        <Btn variant="primary" type="submit" disabled={busy || !emailOk || (modo === "totp" ? code.length !== 6 : rec.replace(/[^0-9A-Za-z]/g, "").length !== 10)} className="mt-4 w-full">
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
