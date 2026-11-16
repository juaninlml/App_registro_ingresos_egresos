import * as store from "./store";
import { K } from "./store";
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
  if (key === "plan") return null;
  return [];
}

/** Toda la información principal, con la versión de cada sección. */
export async function readAll(): Promise<{ db: DB; revs: Record<string, number> }> {
  const vals = await store.mgetWithRev(DB_KEYS.map((k) => K.data(k)));
  const db = Object.fromEntries(DB_KEYS.map((k, i) => [k, withDefault(k, vals[i].value)])) as unknown as DB;
  const revs = Object.fromEntries(DB_KEYS.map((k, i) => [k, vals[i].rev]));
  return { db, revs };
}

export async function readKey(key: DataKey): Promise<{ value: unknown; rev: number }> {
  const [v] = await store.mgetWithRev([K.data(key)]);
  return { value: withDefault(key, v.value), rev: v.rev };
}

export interface DataWrite {
  key: DataKey;
  value: unknown;
  rev?: number;
}

/** Valida y guarda varias secciones juntas (todas o ninguna). Devuelve el error de validación si lo hay. */
export async function writeMany(writes: DataWrite[]): Promise<store.CommitResult | { invalid: string }> {
  for (const w of writes) {
    if (!isDataKey(w.key)) return { invalid: w.key };
    if (!validateValue(w.key, w.value)) return { invalid: w.key };
  }
  const res = await store.commit(writes.map((w) => ({ key: K.data(w.key), value: w.value, rev: w.rev })));
  const strip = (k: string) => k.slice(K.data("").length);
  return res.ok
    ? { ok: true, revs: Object.fromEntries(Object.entries(res.revs).map(([k, v]) => [strip(k), v])) }
    : { ok: false, conflicts: res.conflicts.map(strip) };
}

export async function allTxMonths(): Promise<Record<string, Transaction[]>> {
  const prefix = K.data("tx:");
  const rows = await store.listByPrefix<Transaction[]>(prefix);
  const out: Record<string, Transaction[]> = {};
  for (const { key, value } of rows) out[key.slice(prefix.length)] = value ?? [];
  return out;
}
