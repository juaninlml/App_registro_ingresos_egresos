"use client";
import { useState } from "react";
import { Field, Input, Select, cx } from "@/components/ui";
import type { Card } from "@/lib/types";

/** Colores disponibles para las tarjetas (degradado oscuro para que el texto blanco se lea bien). */
export const COLORES = {
  rojo: { nombre: "Rojo", from: "#d0122f", to: "#7a0a1c" },
  naranja: { nombre: "Naranja", from: "#d4500f", to: "#7c2d12" },
  dorado: { nombre: "Dorado", from: "#b07a0c", to: "#5c3a05" },
  verde: { nombre: "Verde", from: "#05845f", to: "#023d2c" },
  turquesa: { nombre: "Turquesa", from: "#0f8079", to: "#073b37" },
  azul: { nombre: "Azul", from: "#1450b8", to: "#061f4a" },
  marino: { nombre: "Marino", from: "#24466f", to: "#0d1b2a" },
  morado: { nombre: "Morado", from: "#7a35e0", to: "#3b0f80" },
  rosa: { nombre: "Rosa", from: "#c81f66", to: "#6b0d35" },
  plata: { nombre: "Plata", from: "#76859a", to: "#334155" },
  grafito: { nombre: "Grafito", from: "#4b5563", to: "#111827" },
  negro: { nombre: "Negro", from: "#27303d", to: "#030712" },
} as const;
export type ColorId = keyof typeof COLORES;
export const isColorId = (c: unknown): c is ColorId => typeof c === "string" && c in COLORES;

/** Bancos frecuentes, con un color sugerido. «Otro» permite escribir cualquier nombre. */
export const BANCOS: { nombre: string; color: ColorId }[] = [
  { nombre: "Santander", color: "rojo" },
  { nombre: "BBVA", color: "azul" },
  { nombre: "Banamex", color: "marino" },
  { nombre: "Banorte", color: "rojo" },
  { nombre: "HSBC", color: "grafito" },
  { nombre: "Scotiabank", color: "rojo" },
  { nombre: "Nu", color: "morado" },
  { nombre: "Hey Banco", color: "negro" },
  { nombre: "American Express", color: "plata" },
  { nombre: "Inbursa", color: "marino" },
  { nombre: "Banregio", color: "naranja" },
  { nombre: "Banco Azteca", color: "verde" },
  { nombre: "Liverpool", color: "rosa" },
];

const bancoConocido = (banco: string) => BANCOS.find((b) => b.nombre.toLowerCase() === banco.trim().toLowerCase());

/** Color de la tarjeta: el elegido, o el sugerido por su banco. */
export function colorDe(card: Pick<Card, "banco" | "color">): ColorId {
  if (isColorId(card.color)) return card.color;
  return bancoConocido(card.banco)?.color ?? "grafito";
}

/** Dibujo de la tarjeta con su color, banco, nombre y terminación. */
export function CardVisual({ card, compact, className }: { card: Pick<Card, "banco" | "nombre" | "terminacion" | "color">; compact?: boolean; className?: string }) {
  const c = COLORES[colorDe(card)];
  if (compact) {
    // miniatura: solo color, chip y terminación
    return (
      <div className={cx("relative flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-lg p-1.5 text-white", className)} style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
        <div aria-hidden className="h-2.5 w-3.5 rounded-[2px] bg-gradient-to-br from-yellow-200/90 to-yellow-500/80" />
        <div className="num text-right text-[10px] leading-none opacity-90">{card.terminacion ? `•${card.terminacion}` : ""}</div>
      </div>
    );
  }
  return (
    <div
      className={cx("relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-xl p-3 text-white shadow-sm", className)}
      style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <div className="relative truncate text-[11px] font-semibold uppercase tracking-wider opacity-90">{card.banco || "Banco"}</div>
      <div aria-hidden className="relative h-4 w-6 rounded-[3px] bg-gradient-to-br from-yellow-200/90 to-yellow-500/80" />
      <div className="relative flex items-end justify-between gap-2">
        <div className="truncate text-sm font-semibold">{card.nombre || "Nombre"}</div>
        {card.terminacion && <div className="num shrink-0 text-xs opacity-90">•••• {card.terminacion}</div>}
      </div>
    </div>
  );
}

export interface BancoColor {
  banco: string;
  color: ColorId | "";
}

/** Campos de banco (lista o «Otro») y color, con vista previa de la tarjeta. */
export function BancoColorFields({ value, onChange, nombre, terminacion }: { value: BancoColor; onChange: (v: BancoColor) => void; nombre: string; terminacion: string }) {
  const conocido = bancoConocido(value.banco);
  const [otro, setOtro] = useState(!conocido && value.banco !== "");
  const elegido = otro ? "__otro" : conocido?.nombre ?? "";
  const colorActual = value.color || colorDe({ banco: value.banco });

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_10rem] sm:items-start">
      <div className="space-y-3">
        <Field label="Banco">
          <Select
            value={elegido}
            required
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__otro") {
                setOtro(true);
                onChange({ ...value, banco: "" });
                return;
              }
              setOtro(false);
              const b = bancoConocido(v);
              // si aún no eliges color a mano, toma el del banco
              onChange({ banco: v, color: value.color && value.color !== bancoConocido(value.banco)?.color ? value.color : (b?.color ?? value.color) });
            }}
          >
            <option value="" disabled>Elige el banco</option>
            {BANCOS.map((b) => <option key={b.nombre} value={b.nombre}>{b.nombre}</option>)}
            <option value="__otro">Otro…</option>
          </Select>
        </Field>
        {otro && (
          <Field label="Nombre del banco">
            <Input value={value.banco} onChange={(e) => onChange({ ...value, banco: e.target.value })} required maxLength={40} placeholder="Ej. Banco del Bajío" autoFocus />
          </Field>
        )}
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-muted">Color</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de la tarjeta">
            {(Object.keys(COLORES) as ColorId[]).map((id) => {
              const c = COLORES[id];
              const on = colorActual === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c.nombre}
                  title={c.nombre}
                  onClick={() => onChange({ ...value, color: id })}
                  className={cx("h-8 w-8 rounded-full border-2 transition", on ? "border-fg ring-2 ring-accent/40" : "border-transparent hover:scale-110")}
                  style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                />
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="max-w-[10rem]" aria-hidden>
        <span className="mb-1 block text-xs font-medium text-muted">Vista previa</span>
        <CardVisual card={{ banco: value.banco, nombre, terminacion, color: colorActual }} />
      </div>
    </div>
  );
}
