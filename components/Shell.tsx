"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useData } from "./DataProvider";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Resumen", icon: "◧" },
  { href: "/tarjetas", label: "Tarjetas", icon: "▭" },
  { href: "/plan", label: "Plan", icon: "☰" },
  { href: "/movimientos", label: "Movimientos", icon: "±" },
  { href: "/prestamos", label: "Créditos", icon: "◎" },
  { href: "/ajustes", label: "Ajustes", icon: "⚙" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { error, ready, reload } = useData();
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold tracking-tight">Mis Finanzas</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", active(n.href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2")}
            >
              <span aria-hidden className="w-5 text-center">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={salir} className="rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface-2">Cerrar sesión</button>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-5xl">
          {error && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{error}</span>
              <button className="font-semibold underline" onClick={() => void reload()}>Reintentar</button>
            </div>
          )}
          {ready ? children : !error && <p className="py-20 text-center text-sm text-muted">Cargando…</p>}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", active(n.href) ? "text-accent" : "text-muted")}>
            <span aria-hidden className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
