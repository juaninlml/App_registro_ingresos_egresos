import { createHash, timingSafeEqual } from "node:crypto";
import { K, redis } from "./redis";

const IP_LIMIT = 5; // intentos fallidos por IP
const IP_WINDOW = 15 * 60; // segundos
const ALL_LIMIT = 20; // intentos fallidos totales
const ALL_WINDOW = 60 * 60;

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  const ip = xf?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "desconocida";
  return ip.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45) || "desconocida";
}

/** Segundos que faltan para poder reintentar; 0 si no hay bloqueo. */
export async function lockedFor(ip: string): Promise<number> {
  const r = redis();
  const [a, b] = await Promise.all([r.get<number>(K.failIp(ip)), r.get<number>(K.failAll)]);
  if (Number(a ?? 0) >= IP_LIMIT) return Math.max(await r.ttl(K.failIp(ip)), 1);
  if (Number(b ?? 0) >= ALL_LIMIT) return Math.max(await r.ttl(K.failAll), 1);
  return 0;
}

export async function registerFailure(ip: string): Promise<void> {
  const r = redis();
  const [a, b] = await Promise.all([r.incr(K.failIp(ip)), r.incr(K.failAll)]);
  if (a === 1) await r.expire(K.failIp(ip), IP_WINDOW);
  if (b === 1) await r.expire(K.failAll, ALL_WINDOW);
}

export async function clearFailures(ip: string): Promise<void> {
  await redis().del(K.failIp(ip));
}

/** Comparación en tiempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
