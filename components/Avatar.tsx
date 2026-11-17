"use client";
import { cx } from "./ui";
import type { Perfil } from "@/lib/types";

/** Iniciales del nombre («Juan Carlos Lázaro» → «JC»). */
export function iniciales(nombre?: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return partes.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("");
}

/** Foto de perfil redonda; sin foto muestra las iniciales sobre blurple. */
export function Avatar({ perfil, size = 40, className }: { perfil: Perfil | null; size?: number; className?: string }) {
  const ini = iniciales(perfil?.nombre);
  return (
    <span
      className={cx("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-semibold text-accent-fg ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {perfil?.foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL local, no pasa por el optimizador de imágenes
        <img src={perfil.foto} alt="" width={size} height={size} className="size-full object-cover" />
      ) : ini ? (
        ini
      ) : (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" /></svg>
      )}
    </span>
  );
}

/**
 * Recorta la imagen al centro en un cuadrado de 256 px y la comprime (WebP, o JPEG si el navegador no
 * sabe generar WebP). Así la foto pesa unos pocos KB y cabe en la base sin servicios externos.
 */
export async function prepararFoto(file: File, lado = 256): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Elige un archivo de imagen");
  if (file.size > 15 * 1024 * 1024) throw new Error("La imagen pesa más de 15 MB");
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error("No se pudo leer la imagen");
  });
  const corte = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede procesar la imagen");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - corte) / 2, (bmp.height - corte) / 2, corte, corte, 0, 0, lado, lado);
  bmp.close();
  let url = canvas.toDataURL("image/webp", 0.85);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.85);
  return url;
}
