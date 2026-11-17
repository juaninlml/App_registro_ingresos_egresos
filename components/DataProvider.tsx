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
  /** Cambia cada vez que se guardan movimientos: las vistas de resumen vuelven a leerlos. */
  txRev: number;
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
  const [txRev, setTxRev] = useState(0);
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
      if (writes.some((w) => w.key.startsWith("tx:"))) setTxRev((n) => n + 1);
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

  const value = useMemo(() => ({ db, ready, error, today, epoch, txRev, save, commit, reload }), [db, ready, error, today, epoch, txRev, save, commit, reload]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Lee los movimientos de varios meses (para el resumen). */
export function useTxMonths(months: string[]) {
  const { epoch, txRev } = useData();
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
  }, [key, epoch, txRev]);
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

  /** Guarda las listas de uno o varios meses junto con otras secciones (todo o nada). */
  const put = useCallback(async (cambios: Record<string, Transaction[]>, extra: Write[]) => {
    const meses = Object.keys(cambios);
    const prev = Object.fromEntries(meses.map((m) => [m, cache.current[m] ?? []]));
    const apply = (listas: Record<string, Transaction[]>) => {
      cache.current = { ...cache.current, ...listas };
      setState((s) => {
        if (!s) return s;
        const visibles = Object.fromEntries(Object.entries(listas).filter(([m]) => m in s.map));
        return Object.keys(visibles).length ? { ...s, map: { ...s.map, ...visibles } } : s;
      });
    };
    apply(cambios);
    const ok = await commit([...meses.map((m) => ({ key: `tx:${m}` as const, value: cambios[m] })), ...extra]);
    if (ok) setErr(null);
    else apply(Object.fromEntries(meses.filter((m) => cache.current[m] === cambios[m]).map((m) => [m, prev[m]])));
    return ok;
  }, [commit]);

  const lista = useCallback(async (month: string) => {
    if (!cache.current[month]) cache.current[month] = await readTxMonth(month);
    return cache.current[month];
  }, []);

  const add = useCallback(async (t: Transaction, extra: Write[] = []) => {
    const m = t.fecha.slice(0, 7);
    try {
      return await put({ [m]: [...(await lista(m)), t] }, extra);
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [put, lista]);

  const remove = useCallback(async (t: Transaction, extra: Write[] = []) => {
    const m = t.fecha.slice(0, 7);
    try {
      return await put({ [m]: (await lista(m)).filter((x) => x.id !== t.id) }, extra);
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [put, lista]);

  /** Reemplaza un movimiento; si cambió de mes, lo saca de uno y lo pone en el otro en la misma escritura. */
  const update = useCallback(async (antes: Transaction, despues: Transaction, extra: Write[] = []) => {
    const m1 = antes.fecha.slice(0, 7);
    const m2 = despues.fecha.slice(0, 7);
    try {
      if (m1 === m2) return await put({ [m1]: (await lista(m1)).map((x) => (x.id === antes.id ? despues : x)) }, extra);
      const [l1, l2] = await Promise.all([lista(m1), lista(m2)]);
      return await put({ [m1]: l1.filter((x) => x.id !== antes.id), [m2]: [...l2, despues] }, extra);
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [put, lista]);

  return { map, err, add, remove, update };
}
