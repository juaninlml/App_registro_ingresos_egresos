import * as store from "./store";
import { llaveDato, prefijoDatos } from "./usuarios";
import { DB_KEYS, DEFAULT_SETTINGS, type DB, type DBKey, type Transaction } from "./types";
import { TX_KEY, validateValue } from "./validate";

/** Llave de datos que el cliente puede leer y escribir. */
export type DataKey = DBKey | `tx:${string}`;

export function isDataKey(key: unknown): key is DataKey {
  return typeof key === "string" && ((DB_KEYS as readonly string[]).includes(key) || TX_KEY.test(key));
}

function withDefault(key: string, v: unknown): unknown {
  if (v !== null) return v;
  if (key === "settings") return DEFAULT_SETTINGS;
  if (key === "plan" || key === "perfil") return null;
  return [];
}

/** Toda la información principal del usuario, con la versión de cada sección. */
export async function readAll(uid: string): Promise<{ db: DB; revs: Record<string, number> }> {
  const vals = await store.mgetWithRev(DB_KEYS.map((k) => llaveDato(uid, k)));
  const db = Object.fromEntries(DB_KEYS.map((k, i) => [k, withDefault(k, vals[i].value)])) as unknown as DB;
  const revs = Object.fromEntries(DB_KEYS.map((k, i) => [k, vals[i].rev]));
  return { db, revs };
}

export async function readKey(uid: string, key: DataKey): Promise<{ value: unknown; rev: number }> {
  const [v] = await store.mgetWithRev([llaveDato(uid, key)]);
  return { value: withDefault(key, v.value), rev: v.rev };
}

export interface DataWrite {
  key: DataKey;
  value: unknown;
  rev?: number;
}

/** Valida y guarda varias secciones juntas (todas o ninguna). Devuelve el error de validación si lo hay. */
export async function writeMany(uid: string, writes: DataWrite[]): Promise<store.CommitResult | { invalid: string }> {
  for (const w of writes) {
    if (!isDataKey(w.key)) return { invalid: w.key };
    if (!validateValue(w.key, w.value)) return { invalid: w.key };
  }
  const res = await store.commit(writes.map((w) => ({ key: llaveDato(uid, w.key), value: w.value, rev: w.rev })));
  const strip = (k: string) => k.slice(prefijoDatos(uid).length);
  return res.ok
    ? { ok: true, revs: Object.fromEntries(Object.entries(res.revs).map(([k, v]) => [strip(k), v])) }
    : { ok: false, conflicts: res.conflicts.map(strip) };
}

export async function allTxMonths(uid: string): Promise<Record<string, Transaction[]>> {
  const prefix = llaveDato(uid, "tx:");
  const rows = await store.listByPrefix<Transaction[]>(prefix);
  const out: Record<string, Transaction[]> = {};
  for (const { key, value } of rows) out[key.slice(prefix.length)] = value ?? [];
  return out;
}
