"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlerta, IconCerrar, IconCheck, IconDeshacer } from "./icons";
import { cx } from "./ui";
import { mxn } from "@/lib/money";

export type Tone = "ok" | "danger" | "accent" | "warn" | "muted";
const TONE_VAR: Record<Tone, string> = { ok: "var(--ok)", danger: "var(--danger)", accent: "var(--accent)", warn: "var(--warn)", muted: "var(--muted)" };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Número que, al cambiar, cuenta hasta su nuevo valor y destella con el color del movimiento.
 * Con «menos movimiento» salta directo al valor pero conserva el destello de color.
 */
export function AnimatedNumber({ value, format = mxn, tone, className }: {
  value: number;
  format?: (n: number) => string;
  /** Color del destello; con `{ up, down }` depende de si el valor sube o baja (p. ej. deuda: baja = verde). */
  tone?: Tone | { up: Tone; down: Tone };
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el || from === value) return;
    cancelAnimationFrame(frame.current);
    const t = typeof tone === "object" ? (value > from ? tone.up : tone.down) : tone;
    if (t) {
      el.style.setProperty("--tone", TONE_VAR[t]);
      el.classList.remove("value-flash");
      void el.offsetWidth; // reinicia la animación si llega otro cambio seguido
      el.classList.add("value-flash");
    }
    if (reducedMotion()) {
      el.textContent = format(value);
      return;
    }
    const start = performance.now();
    const dur = 650;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(2, -10 * t); // desaceleración exponencial
      el.textContent = format(t >= 1 ? value : from + (value - from) * e);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    el.textContent = format(from);
    frame.current = requestAnimationFrame(tick);
  }, [value, format, tone]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return <span ref={ref} className={cx("num inline-block", className)}>{format(value)}</span>;
}

/* ---------------------------------- Avisos ---------------------------------- */

export interface ToastInput {
  tone?: Tone;
  title: string;
  detail?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
  leaving: boolean;
  ms: number;
}

const ToastCtx = createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast fuera de ToastProvider");
  return c;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 170);
  }, []);

  const toast = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    const ms = t.action ? 6000 : 3800;
    setItems((l) => [...l.slice(-2), { ...t, id, leaving: false, ms }]);
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:items-end">
        {items.map((t) => {
          const tone = t.tone ?? "muted";
          const color = TONE_VAR[tone];
          return (
            <div
              key={t.id}
              role="status"
              className={cx(
                "pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface py-3 pl-3 pr-2 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)]",
                t.leaving ? "toast-out" : "toast-in",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
                {t.icon ?? (tone === "danger" || tone === "warn" ? <IconAlerta size={18} /> : <IconCheck size={18} />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.title}</span>
                {t.detail && <span className="line-clamp-2 block text-xs text-muted">{t.detail}</span>}
              </span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="press inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-accent-soft"
                >
                  <IconDeshacer size={16} />{t.action.label}
                </button>
              )}
              <button type="button" aria-label="Cerrar aviso" onClick={() => dismiss(t.id)} className="press grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
                <IconCerrar size={16} />
              </button>
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left" style={{ background: color, opacity: 0.6, animation: `toast-timer ${t.ms}ms linear forwards` }} />
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ Control segmentado ------------------------------ */

/** Botones de opción con un indicador que se desliza a la opción elegida. */
export function Segmented<T extends string>({ options, value, onChange, label, tones }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; tones?: Partial<Record<T, Tone>> }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const tone = tones?.[value];
  const style = useMemo(() => ({
    width: `calc((100% - 0.5rem) / ${options.length})`,
    transform: `translateX(${i * 100}%)`,
    ...(tone ? { background: `color-mix(in oklab, ${TONE_VAR[tone]} 18%, var(--surface))` } : {}),
  }), [i, options.length, tone]);
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-grid rounded-xl bg-surface-2 p-1 text-sm" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute bottom-1 left-1 top-1 rounded-lg bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-[transform,background-color] duration-[var(--dur)] ease-[var(--ease-out)]" style={style} />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx("relative z-10 min-h-9 rounded-lg px-4 font-medium transition-colors duration-[var(--dur-fast)]", on ? (tone ? "" : "text-fg") : "text-muted hover:text-fg")}
            style={on && tone ? { color: TONE_VAR[tone] } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
