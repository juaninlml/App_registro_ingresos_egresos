const mxnFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const mxn = (n: number) => mxnFmt.format(Number.isFinite(n) ? n : 0);

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function uid(): string {
  return crypto.randomUUID();
}
