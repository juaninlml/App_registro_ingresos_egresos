"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DB_KEYS, EMPTY_DB, type DB, type DBKey, type Transaction } from "@/lib/types";

/** Llave de datos: una sección de la base o los movimientos de un mes ("tx:YYYY-MM"). */
export type DataKey = DBKey | `tx:${string}`;
export interface Write {
  key: DataKey;
  value: unknown;
}

interface Ctx {
  db: DB;
  ready: boolean;
  error: string | null;
  today: string;
  /** Cambia cada vez que se recargan los datos tras un conflicto: los movimientos se vuelven a leer. */
  epoch: number;
  save: <K extends DBKey>(key: K, value: DB[K]) => Promise<boolean>;
  /** Guarda varias secciones juntas: o se guardan todas o ninguna. */
  commit: (writes: Write[]) => Promise<boolean>;
  reload: () => Promise<void>;
}
const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData fuera de DataProvider");
  return c;
}

class ConflictError extends Error {}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, cache: "no-store" });
  if (r.status === 401) {
    window.location.assign("/login");
    throw new Error("Sesión expirada");
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const msg = j.error ?? `Error ${r.status}`;
    throw r.status === 409 ? new ConflictError(msg) : new Error(msg);
  }
  return r;
}

// Versión de cada llave tal como la leyó este navegador. Se envía al guardar para que el servidor
// rechace la escritura si otra pestaña o dispositivo guardó después.
const revs = new Map<string, number>();
const noteRev = (key: string, rev: number) => {
  if (Number.isFinite(rev)) revs.set(key, Math.max(rev, revs.get(key) ?? 0));
};

/** Lee los movimientos de un mes y recuerda su versión. */
export async function readTxMonth(month: string): Promise<Transaction[]> {
  const r = await api(`/api/data/tx:${month}`);
  noteRev(`tx:${month}`, Number(r.headers.get("X-Rev")));
  return (await r.json()) as Transaction[];
}

// Las escrituras salen de una en una, para que cada una lleve la versión que dejó la anterior.
let queue: Promise<unknown> = Promise.resolve();
function sendWrites(writes: Write[]): Promise<void> {
  const run = async () => {
    const body = JSON.stringify({ writes: writes.map((w) => ({ ...w, rev: revs.get(w.key) ?? 0 })) });
    const r = await api("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const j = (await r.json()) as { revs: Record<string, number> };
    for (const [k, v] of Object.entries(j.revs)) revs.set(k, v);
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

const CONFLICTO = "Los datos cambiaron en otra pestaña o dispositivo. Se recargó la información; revisa y vuelve a intentarlo.";

/** Fecha de hoy en la zona horaria del navegador (YYYY-MM-DD). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const isDBKey = (k: string): k is DBKey => (DB_KEYS as readonly string[]).includes(k);

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(localToday);
  const [epoch, setEpoch] = useState(0);
  const saving = useRef(0);

  const reload = useCallback(async () => {
    try {
      const r = await api("/api/data");
      const j = (await r.json()) as { db: DB; revs: Record<string, number> };
      for (const [k, v] of Object.entries(j.revs)) revs.set(k, v);
      setDb(j.db);
      setError(null);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setToday(localToday());
        if (!saving.current) void reload();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  const commit = useCallback(async (writes: Write[]) => {
    // cambio optimista solo de las secciones de la base; los movimientos los maneja su propio hook
    const patch: Partial<Record<DBKey, unknown>> = {};
    for (const w of writes) if (isDBKey(w.key)) patch[w.key] = w.value;
    const keys = Object.keys(patch) as DBKey[];
    let prev: Partial<Record<DBKey, unknown>> = {};
    if (keys.length) {
      setDb((d) => {
        prev = Object.fromEntries(keys.map((k) => [k, d[k]]));
        return { ...d, ...patch } as DB;
      });
    }
    saving.current++;
    try {
      await sendWrites(writes);
      setError(null);
      return true;
    } catch (e) {
      // deshace solo lo que cambió esta escritura (y solo si nadie lo cambió después)
      if (keys.length) {
        setDb((d) => {
          const back = { ...d } as Record<DBKey, unknown>;
          for (const k of keys) if (d[k] === patch[k]) back[k] = prev[k];
          return back as unknown as DB;
        });
      }
      if (e instanceof ConflictError) {
        await reload();
        setEpoch((n) => n + 1);
        setError(CONFLICTO);
      } else {
        setError(`No se guardó: ${(e as Error).message}`);
      }
      return false;
    } finally {
      saving.current--;
    }
  }, [reload]);

  const save: Ctx["save"] = useCallback((key, value) => commit([{ key, value }]), [commit]);

  const value = useMemo(() => ({ db, ready, error, today, epoch, save, commit, reload }), [db, ready, error, today, epoch, save, commit, reload]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Lee los movimientos de varios meses (para el resumen). */
export function useTxMonths(months: string[]) {
  const { epoch } = useData();
  const key = months.join(",");
  const [data, setData] = useState<{ key: string; map: Record<string, Transaction[]> } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(months.map(readTxMonth))
      .then((lists) => alive && setData({ key, map: Object.fromEntries(months.map((m, i) => [m, lists[i]])) }))
      .catch(() => alive && setData({ key, map: {} }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, epoch]);
  return data?.key === key ? data.map : null;
}

/** Movimientos de varios meses, con alta y baja que escriben en el mes que corresponde. */
export function useTxRange(months: string[]) {
  const { commit, epoch } = useData();
  const key = months.join(",");
  const [state, setState] = useState<{ key: string; map: Record<string, Transaction[]> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cache = useRef<Record<string, Transaction[]>>({});
  const lastEpoch = useRef(epoch);

  useEffect(() => {
    let alive = true;
    if (lastEpoch.current !== epoch) {
      cache.current = {}; // tras un conflicto nada de lo guardado en memoria es confiable
      lastEpoch.current = epoch;
    }
    Promise.all(months.map(readTxMonth))
      .then((lists) => {
        if (!alive) return;
        const map = Object.fromEntries(months.map((m, i) => [m, lists[i]]));
        cache.current = { ...cache.current, ...map };
        setState({ key, map });
        setErr(null);
      })
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, epoch]);

  const map = state?.key === key ? state.map : null;

  /** Guarda la lista de un mes junto con otras secciones (todo o nada). */
  const put = useCallback(async (month: string, next: Transaction[], extra: Write[]) => {
    const prev = cache.current[month] ?? [];
    const apply = (list: Transaction[]) => {
      cache.current = { ...cache.current, [month]: list };
      setState((s) => (s && month in s.map ? { ...s, map: { ...s.map, [month]: list } } : s));
    };
    apply(next);
    const ok = await commit([{ key: `tx:${month}`, value: next }, ...extra]);
    if (ok) setErr(null);
    else if (cache.current[month] === next) apply(prev);
    return ok;
  }, [commit]);

  const lista = useCallback(async (month: string) => {
    if (!cache.current[month]) cache.current[month] = await readTxMonth(month);
    return cache.current[month];
  }, []);

  const add = useCallback(async (t: Transaction, extra: Write[] = []) => {
    const m = t.fecha.slice(0, 7);
    try {
      return await put(m, [...(await lista(m)), t], extra);
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [put, lista]);

  const remove = useCallback(async (t: Transaction, extra: Write[] = []) => {
    const m = t.fecha.slice(0, 7);
    try {
      return await put(m, (await lista(m)).filter((x) => x.id !== t.id), extra);
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [put, lista]);

  return { map, err, add, remove };
}
