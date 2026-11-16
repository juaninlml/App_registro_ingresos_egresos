import { Redis } from "@upstash/redis";

let client: Redis | null = null;

/**
 * Cliente de Upstash Redis. Acepta las variables que crea la integración de Upstash en Vercel
 * (KV_REST_API_URL / KV_REST_API_TOKEN) o los nombres nativos de Upstash.
 */
export function redis(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Faltan las variables de Upstash (UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN).");
  }
  client = new Redis({ url, token });
  return client;
}

export const K = {
  data: (key: string) => `fin:${key}`,
  totp: "fin:auth:totp",
  pending: "fin:auth:pending",
  lastStep: "fin:auth:laststep",
  failIp: (ip: string) => `fin:auth:fail:ip:${ip}`,
  failAll: "fin:auth:fail:all",
} as const;
