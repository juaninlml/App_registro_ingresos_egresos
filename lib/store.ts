import { neon } from "@neondatabase/serverless";

type Row = Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Lo mínimo que usamos de la conexión: consultas sueltas y transacciones de varias consultas. */
interface Sql {
  query(text: string, params?: unknown[]): Promise<Row[]>;
  transaction(queries: Promise<Row[]>[]): Promise<Row[][]>;
}

let sql: Sql | Promise<Sql> | null = null;
let ready: Promise<void> | null = null;

/**
 * Solo para desarrollo local: `DATABASE_URL=pglite:` usa un Postgres en memoria (o `pglite:./.data/pg`
 * para guardarlo en disco). En Vercel siempre es Neon.
 */
async function pglite(dir: string): Promise<Sql> {
  const g = globalThis as unknown as { __kakeiboPg?: Promise<Sql> };
  g.__kakeiboPg ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(dir || undefined);
    // consultas «perezosas» como las de Neon: se ejecutan al esperarlas o dentro de transaction()
    type Perezosa = Promise<Row[]> & { text: string; params?: unknown[] };
    const query = (text: string, params?: unknown[]) => {
      const lazy = { text, params } as Perezosa;
      lazy.then = ((ok, ko) => pg.query<Row>(text, params).then((r) => r.rows).then(ok, ko)) as Perezosa["then"];
      return lazy;
    };
    return {
      query,
      transaction: (qs) =>
        pg.transaction(async (tx) => {
          const out: Row[][] = [];
          for (const q of qs as Perezosa[]) out.push((await tx.query<Row>(q.text, q.params)).rows);
          return out;
        }),
    };
  })();
  return g.__kakeiboPg;
}

async function conn(): Promise<Sql> {
  if (sql) return sql;
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.STORAGE_DATABASE_URL ?? // Neon con prefijo "STORAGE" en Vercel
    process.env.STORAGE_POSTGRES_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL (cadena de conexión de Neon).");
  if (url.startsWith("pglite:")) {
    if (process.env.NODE_ENV === "production") throw new Error("pglite: es solo para desarrollo local.");
    sql = pglite(url.slice("pglite:".length));
    return sql;
  }
  sql = neon(url) as unknown as Sql;
  return sql;
}

/** Tabla única clave → valor JSON, con expiración opcional (sesiones TOTP, contadores de intentos). */
async function db() {
  const q = await conn();
  ready ??= q
    .query(`CREATE TABLE IF NOT EXISTS kv (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      expires_at timestamptz
    )`)
    // `rev` = versión de cada llave, para detectar escrituras desde otro dispositivo
    .then(() => q.query(`ALTER TABLE kv ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0`))
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

/** Valores y versiones de varias llaves (versión 0 = la llave aún no existe). */
export async function mgetWithRev<T = unknown>(keys: string[]): Promise<{ value: T | null; rev: number }[]> {
  if (!keys.length) return [];
  const q = await db();
  const rows = await q.query(`SELECT key, value, rev FROM kv WHERE key = ANY($1) AND ${LIVE}`, [keys]);
  const m = new Map(rows.map((r) => [r.key as string, { value: r.value as T, rev: Number(r.rev) }]));
  return keys.map((k) => m.get(k) ?? { value: null, rev: 0 });
}

export interface Write {
  key: string;
  value: unknown;
  /** Versión que tenía el cliente al leer; si no coincide con la actual no se escribe nada. Sin `rev` se sobrescribe. */
  rev?: number;
}

export type CommitResult = { ok: true; revs: Record<string, number> } | { ok: false; conflicts: string[] };

const WRITE_LOCK = 7_316_001; // candado de transacción: las escrituras de datos van de una en una

/**
 * Escribe varias llaves en una sola transacción: o se guardan todas o ninguna.
 * Si alguna `rev` no coincide con la guardada (otro dispositivo la cambió), no escribe nada y avisa.
 */
export async function commit(writes: Write[]): Promise<CommitResult> {
  const byKey = new Map(writes.map((w) => [w.key, w])); // la última escritura de cada llave gana
  const input = [...byKey.values()].map((w) => ({ key: w.key, value: JSON.stringify(w.value ?? null), rev: w.rev ?? null }));
  if (!input.length) return { ok: true, revs: {} };
  const q = await db();
  const [, rows] = await q.transaction([
    q.query(`SELECT pg_advisory_xact_lock(${WRITE_LOCK})`),
    q.query(
      `WITH input AS (
         SELECT key, value::jsonb AS value, rev FROM jsonb_to_recordset($1::jsonb) AS t(key text, value text, rev bigint)
       ),
       conflicts AS (
         SELECT i.key FROM input i LEFT JOIN kv ON kv.key = i.key
         WHERE i.rev IS NOT NULL AND COALESCE(kv.rev, 0) <> i.rev
       ),
       up AS (
         INSERT INTO kv (key, value, expires_at, rev)
         SELECT key, value, NULL, 1 FROM input WHERE NOT EXISTS (SELECT 1 FROM conflicts)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = NULL, rev = kv.rev + 1
         RETURNING key, rev
       )
       SELECT COALESCE((SELECT jsonb_agg(key) FROM conflicts), '[]'::jsonb) AS conflicts,
              COALESCE((SELECT jsonb_object_agg(key, rev) FROM up), '{}'::jsonb) AS revs`,
      [JSON.stringify(input)],
    ),
  ]);
  const r = rows[0] as { conflicts: string[]; revs: Record<string, number | string> };
  if (r.conflicts.length) return { ok: false, conflicts: r.conflicts };
  return { ok: true, revs: Object.fromEntries(Object.entries(r.revs).map(([k, v]) => [k, Number(v)])) };
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

/** Borra todas las llaves que empiezan con el prefijo (al quitar un usuario). */
export async function delByPrefix(prefix: string): Promise<void> {
  if (prefix.length < 6) throw new Error("Prefijo demasiado corto");
  const q = await db();
  await q.query(`DELETE FROM kv WHERE starts_with(key, $1)`, [prefix]);
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

/** Llaves globales. Las de cada usuario (datos y accesos) están en lib/usuarios.ts. */
export const K = {
  pending: "fin:auth:pending", // QR pendiente de la configuración inicial (/setup)
  pendingInvite: (invId: string) => `fin:auth:pending:inv:${invId}`, // QR pendiente de un registro por invitación
  failIp: (ip: string) => `fin:auth:fail:ip:${ip}`,
  failAll: "fin:auth:fail:all",
} as const;
