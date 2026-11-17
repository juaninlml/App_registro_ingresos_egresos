import Image from "next/image";
import { cx } from "./ui";

/** Ícono de Kakeibo (la libreta sobre azul Discord). */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return <Image src="/icon.svg" alt="" width={size} height={size} unoptimized priority className={cx("shrink-0", className)} />;
}

/**
 * Logo completo: ícono + «kakeibo» + sello 家計簿 + «FINANCE SYNC».
 * `animado` hace la entrada de la pantalla de acceso: la libreta aparece y después el nombre.
 */
export function Logo({ size = "md", animado, className }: { size?: "sm" | "md" | "lg"; animado?: boolean; className?: string }) {
  const s = {
    sm: { mark: 32, word: "text-xl", sub: "text-[9px]", badge: "px-1 text-[10px]", gap: "gap-2.5" },
    md: { mark: 48, word: "text-3xl", sub: "text-[11px]", badge: "px-1.5 text-xs", gap: "gap-3" },
    lg: { mark: 72, word: "text-[2.75rem]", sub: "text-sm", badge: "px-2 text-sm", gap: "gap-4" },
  }[size];
  return (
    <div className={cx("flex items-center", s.gap, className)} aria-label="Kakeibo · Finance Sync" role="img">
      <span className={cx("block rounded-[22%] shadow-[0_8px_24px_-8px_rgb(88_101_242/0.55)]", animado && "logo-mark-in")}>
        <LogoMark size={s.mark} />
      </span>
      <span className={cx("flex min-w-0 flex-col", animado && "logo-word-in")}>
        <span className={cx("font-[family-name:var(--font-brand)] font-extrabold leading-none tracking-[-0.03em] text-fg", s.word)}>kakeibo</span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <span lang="ja" className={cx("rounded-[4px] bg-danger font-semibold leading-snug text-white", s.badge)}>家計簿</span>
          <span className={cx("font-[family-name:var(--font-brand)] font-semibold uppercase leading-none tracking-[0.08em] text-brand-mint/80", s.sub)}>Finance Sync</span>
        </span>
      </span>
    </div>
  );
}
