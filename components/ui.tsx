"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { IconCerrar } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-border bg-surface p-4 sm:p-5", className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions, lead }: { title: string; sub?: string; actions?: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {lead}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; small?: boolean };
export function Btn({ variant = "soft", small, className, ...p }: BtnProps) {
  const v = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    soft: "bg-surface-2 text-fg hover:bg-border",
    ghost: "text-muted hover:bg-surface-2",
    danger: "bg-danger-soft text-danger hover:opacity-80",
  }[variant];
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "press inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium disabled:cursor-not-allowed disabled:opacity-50",
        small ? "min-h-8 px-3 py-1.5 text-xs" : "min-h-10 px-4 py-2 text-sm",
        v,
        className,
      )}
    />
  );
}

/** Botón solo con icono: área táctil de 40 px (36 px en `small`) y nombre accesible obligatorio. */
export function IconBtn({ label, small, className, children, ...p }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; small?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cx("press grid shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50", small ? "size-9" : "size-10", className)}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:text-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/25 focus-visible:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, p.className)} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, p.className)} />;
}

export function NumInput({ value, onChange, ...p }: { value: number | ""; onChange: (n: number | "") => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Input
      {...p}
      type="number"
      inputMode="decimal"
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
    />
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // el contenido sigue montado mientras dura la animación de salida
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) {
      const t = setTimeout(() => setShown(false), 160);
      return () => clearTimeout(t);
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface p-0 text-fg shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]"
    >
      {shown && (
        <div className="max-h-[85dvh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{title}</h3>
            <IconBtn label="Cerrar" small onClick={onClose} className="-mr-2"><IconCerrar size={18} /></IconBtn>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "danger" | "accent" }) {
  const t = {
    muted: "bg-surface-2 text-muted",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    accent: "bg-accent-soft text-accent-text",
  }[tone];
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "danger" | "warn" }) {
  const c = tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "";
  return (
    <Card>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx("num mt-1 text-xl font-semibold sm:text-2xl", c)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Progress({ value, max, tone = "accent", label }: { value: number; max: number; tone?: "accent" | "danger" | "ok"; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("bar-fill h-full rounded-full", tone === "danger" ? "bg-danger" : tone === "ok" ? "bg-ok" : "bg-accent")} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

/** Bloque gris mientras carga un dato. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("skeleton block", className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{children}</div>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-surface"><table className="num w-full min-w-max text-sm">{children}</table></div>;
}
export const th = "whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-muted";
export const td = "whitespace-nowrap border-b border-border/60 px-3 py-2";
