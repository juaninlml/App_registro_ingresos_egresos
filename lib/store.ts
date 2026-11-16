import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

function conn() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL (cadena de conexión de Neon).");
  sql = neon(url);
  return sql;
}

/** Tabla única clave → valor JSON, con expiración opcional (sesiones TOTP, contadores de intentos). */
async function db() {
  const q = conn();
  ready ??= q
    .query(`CREATE TABLE IF NOT EXISTS kv (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      expires_at timestamptz
    )`)
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q;
}

const LIVE = "(expires_at IS NULL OR expires_at > now())";

export async function get<T = unknown>(key: string): Promise<T | null> {
  const q = await db();
  const rows = await q.query(`SELECT value FROM kv WHERE key = $1 AND ${LIVE}`, [key]);
  return rows.length ? (rows[0].value as T) : null;
}

export async function mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
  if (!keys.length) return [];
  const q = await db();
  const rows = await q.query(`SELECT key, value FROM kv WHERE key = ANY($1) AND ${LIVE}`, [keys]);
  const m = new Map(rows.map((r) => [r.key as string, r.value as T]));
  return keys.map((k) => m.get(k) ?? null);
}

export async function listByPrefix<T = unknown>(prefix: string): Promise<{ key: string; value: T }[]> {
  const q = await db();
  const rows = await q.query(`SELECT key, value FROM kv WHERE starts_with(key, $1) AND ${LIVE} ORDER BY key`, [prefix]);
  return rows.map((r) => ({ key: r.key as string, value: r.value as T }));
}

/** Guarda un valor. Con `nx` solo escribe si no existe (o ya expiró) y devuelve si lo guardó. */
export async function set(key: string, value: unknown, opts: { ex?: number; nx?: boolean } = {}): Promise<boolean> {
  const q = await db();
  const exp = opts.ex ? `now() + make_interval(secs => ${Math.floor(opts.ex)})` : "NULL";
  const conflict = opts.nx
    ? `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at WHERE kv.expires_at IS NOT NULL AND kv.expires_at <= now()`
    : `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
  const rows = await q.query(
    `INSERT INTO kv (key, value, expires_at) VALUES ($1, $2::jsonb, ${exp}) ${conflict} RETURNING key`,
    [key, JSON.stringify(value)],
  );
  return rows.length > 0;
}

export async function del(key: string): Promise<void> {
  const q = await db();
  await q.query(`DELETE FROM kv WHERE key = $1`, [key]);
}

/** Contador atómico con ventana: la primera vez fija la expiración; al expirar vuelve a 1. */
export async function incr(key: string, windowSec: number): Promise<number> {
  const q = await db();
  const rows = await q.query(
    `INSERT INTO kv (key, value, expires_at) VALUES ($1, '1'::jsonb, now() + make_interval(secs => ${Math.floor(windowSec)}))
     ON CONFLICT (key) DO UPDATE SET
       value = CASE WHEN kv.expires_at <= now() THEN '1'::jsonb ELSE to_jsonb((kv.value)::text::int + 1) END,
       expires_at = CASE WHEN kv.expires_at <= now() THEN EXCLUDED.expires_at ELSE kv.expires_at END
     RETURNING value`,
    [key],
  );
  return Number(rows[0].value);
}

/** Segundos que faltan para que expire la llave (0 si no existe o no expira). */
export async function ttl(key: string): Promise<number> {
  const q = await db();
  const rows = await q.query(`SELECT GREATEST(CEIL(EXTRACT(EPOCH FROM (expires_at - now()))), 0) AS s FROM kv WHERE key = $1 AND expires_at IS NOT NULL`, [key]);
  return rows.length ? Number(rows[0].s) : 0;
}

export async function purgeExpired(): Promise<void> {
  const q = await db();
  await q.query(`DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= now()`);
}

export const K = {
  data: (key: string) => `fin:${key}`,
  totp: "fin:auth:totp",
  pending: "fin:auth:pending",
  lastStep: "fin:auth:laststep",
  failIp: (ip: string) => `fin:auth:fail:ip:${ip}`,
  failAll: "fin:auth:fail:all",
} as const;
