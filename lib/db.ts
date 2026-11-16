import * as store from "./store";
import { K } from "./store";
import { DB_KEYS, DEFAULT_SETTINGS, type DB, type DBKey, type Transaction } from "./types";

export async function readAll(): Promise<DB> {
  const vals = await store.mget(DB_KEYS.map((k) => K.data(k)));
  const byKey = Object.fromEntries(DB_KEYS.map((k, i) => [k, vals[i]])) as Record<DBKey, unknown>;
  return {
    cards: (byKey.cards as DB["cards"]) ?? [],
    msi: (byKey.msi as DB["msi"]) ?? [],
    loans: (byKey.loans as DB["loans"]) ?? [],
    payments: (byKey.payments as DB["payments"]) ?? [],
    plan: (byKey.plan as DB["plan"]) ?? null,
    settings: (byKey.settings as DB["settings"]) ?? DEFAULT_SETTINGS,
  };
}

export async function readKey(key: string): Promise<unknown> {
  const v = await store.get(K.data(key));
  if (v !== null) return v;
  if (key === "settings") return DEFAULT_SETTINGS;
  if (key === "plan") return null;
  return [];
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  await store.set(K.data(key), value);
}

export async function allTxMonths(): Promise<Record<string, Transaction[]>> {
  const prefix = K.data("tx:");
  const rows = await store.listByPrefix<Transaction[]>(prefix);
  const out: Record<string, Transaction[]> = {};
  for (const { key, value } of rows) out[key.slice(prefix.length)] = value ?? [];
  return out;
}
