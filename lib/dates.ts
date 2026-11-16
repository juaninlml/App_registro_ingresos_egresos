import type { ISODate } from "./types";

const DAY = 86_400_000;

export function parse(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fmt(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isISO(d: unknown): d is ISODate {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parse(d).getTime());
}

/** Fecha de hoy en la zona horaria local del dispositivo. */
export function todayISO(): ISODate {
  const n = new Date();
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const dd = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${mm}-${dd}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fmt(new Date(parse(d).getTime() + n * DAY));
}

/** Igual que EDATE de Excel: mismo día del mes, ajustado al último día si no existe. */
export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(ny, nm, Math.min(day, last))));
}

/** Meses completos de calendario entre dos fechas (b − a), ignorando el día. */
export function monthsDiff(a: ISODate, b: ISODate): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
}

export function weekday(d: ISODate): number {
  return parse(d).getUTCDay(); // 0 domingo … 6 sábado
}

/** Siguiente día hábil (lunes a viernes) estrictamente posterior a `d`. Sin días festivos. */
export function nextBusinessDay(d: ISODate): ISODate {
  let x = addDays(d, 1);
  while (weekday(x) === 0 || weekday(x) === 6) x = addDays(x, 1);
  return x;
}

/** Primer lunes en o después de `d`. */
export function mondayOnOrAfter(d: ISODate): ISODate {
  const w = weekday(d);
  return addDays(d, (8 - w) % 7);
}

export function ymd(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function addMonthKey(key: string, n: number): string {
  return addMonths(`${key}-01`, n).slice(0, 7);
}

const fDate = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fShort = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", timeZone: "UTC" });
const fMonth = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

export const fdate = (d: ISODate) => fDate.format(parse(d)).replace(/\./g, "");
export const fshort = (d: ISODate) => fShort.format(parse(d)).replace(/\./g, "");
export const fmonth = (key: string) => fMonth.format(parse(`${key}-01`));

/** Lunes de la semana (lunes a domingo) que contiene `d`. */
export function lunesDe(d: ISODate): ISODate {
  return addDays(d, -((weekday(d) + 6) % 7));
}

/** "15:07" → "3:07 p. m." */
export function fhora(h?: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h ?? "");
  if (!m) return "";
  const H = Number(m[1]);
  return `${H % 12 || 12}:${m[2]} ${H >= 12 ? "p. m." : "a. m."}`;
}

/** Hora local actual "HH:MM". */
export function ahoraHM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
