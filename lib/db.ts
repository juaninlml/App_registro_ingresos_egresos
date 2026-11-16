import { K, redis } from "./redis";
import { DB_KEYS, DEFAULT_SETTINGS, type DB, type DBKey, type Transaction } from "./types";

export async function readAll(): Promise<DB> {
  const vals = await redis().mget<unknown[]>(...DB_KEYS.map((k) => K.data(k)));
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
  const v = await redis().get(K.data(key));
  if (v !== null) return v;
  if (key === "settings") return DEFAULT_SETTINGS;
  if (key === "plan") return null;
  return [];
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  await redis().set(K.data(key), value);
}

export async function allTxMonths(): Promise<Record<string, Transaction[]>> {
  const r = redis();
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, { match: K.data("tx:*"), count: 200 });
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0");
  if (!keys.length) return {};
  const vals = await r.mget<Transaction[][]>(...keys);
  const out: Record<string, Transaction[]> = {};
  keys.forEach((k, i) => {
    out[k.replace(K.data("tx:"), "")] = vals[i] ?? [];
  });
  return out;
}
