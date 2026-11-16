"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useData } from "./DataProvider";
import { IconAjustes, IconCredito, IconMovimientos, IconPlan, IconResumen, IconSalir, IconTarjeta } from "./icons";
import { ToastProvider } from "./motion";
import { Skeleton, cx } from "./ui";

const NAV = [
  { href: "/", label: "Resumen", Icon: IconResumen },
  { href: "/tarjetas", label: "Tarjetas", Icon: IconTarjeta },
  { href: "/plan", label: "Plan", Icon: IconPlan },
  { href: "/movimientos", label: "Movimientos", Icon: IconMovimientos },
  { href: "/prestamos", label: "Créditos", Icon: IconCredito },
  { href: "/ajustes", label: "Ajustes", Icon: IconAjustes },
];

/** Esqueleto de una página mientras llegan los datos. */
function Cargando() {
  return (
    <div role="status" aria-label="Cargando tus datos">
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="mb-6 h-4 w-28" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

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
    <ToastProvider>
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold tracking-tight">Mis Finanzas</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={cx("press flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", active(n.href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              <n.Icon size={18} />
              {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={salir} className="press flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"><IconSalir size={18} />Cerrar sesión</button>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-5xl">
          {error && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{error}</span>
              <button className="font-semibold underline" onClick={() => void reload()}>Reintentar</button>
            </div>
          )}
          {ready ? children : !error && <Cargando />}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => {
          const on = active(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cx("press flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium", on ? "text-accent" : "text-muted")}>
              {/* la píldora del activo crece desde el centro */}
              <span className={cx("grid h-7 w-12 place-items-center rounded-full transition-[background-color,transform] duration-[var(--dur)] ease-[var(--ease-out)]", on ? "scale-100 bg-accent-soft" : "scale-90")}>
                <n.Icon size={20} />
              </span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
    </ToastProvider>
  );
}
