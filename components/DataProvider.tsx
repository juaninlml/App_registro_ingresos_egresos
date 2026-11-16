"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EMPTY_DB, type DB, type DBKey, type Transaction } from "@/lib/types";

interface Ctx {
  db: DB;
  ready: boolean;
  error: string | null;
  today: string;
  save: <K extends DBKey>(key: K, value: DB[K]) => Promise<boolean>;
  reload: () => Promise<void>;
}
const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData fuera de DataProvider");
  return c;
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, cache: "no-store" });
  if (r.status === 401) {
    window.location.assign("/login");
    throw new Error("Sesión expirada");
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `Error ${r.status}`);
  }
  return r;
}

/** Fecha de hoy en la zona horaria del navegador (YYYY-MM-DD). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(localToday);
  const saving = useRef(0);

  const reload = useCallback(async () => {
    try {
      const r = await api("/api/data");
      setDb(await r.json());
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

  const save: Ctx["save"] = useCallback(async (key, value) => {
    let prev: DB | null = null;
    setDb((d) => {
      prev = d;
      return { ...d, [key]: value };
    });
    saving.current++;
    try {
      await api(`/api/data/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      setError(null);
      return true;
    } catch (e) {
      if (prev) setDb(prev);
      setError(`No se guardó: ${(e as Error).message}`);
      return false;
    } finally {
      saving.current--;
    }
  }, []);

  const value = useMemo(() => ({ db, ready, error, today, save, reload }), [db, ready, error, today, save, reload]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Movimientos de un mes (YYYY-MM). */
export function useMonthTx(month: string) {
  const [state, setState] = useState<{ month: string; list: Transaction[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api(`/api/data/tx:${month}`)
      .then((r) => r.json())
      .then((list: Transaction[]) => alive && setState({ month, list }))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [month]);

  const list = state?.month === month ? state.list : null;

  const write = useCallback(
    async (next: Transaction[]) => {
      const prev = state;
      setState({ month, list: next });
      try {
        await api(`/api/data/tx:${month}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        setErr(null);
        return true;
      } catch (e) {
        setState(prev);
        setErr(`No se guardó: ${(e as Error).message}`);
        return false;
      }
    },
    [month, state],
  );

  return { list, err, write };
}

/** Lee los movimientos de varios meses (para el resumen). */
export function useTxMonths(months: string[]) {
  const key = months.join(",");
  const [data, setData] = useState<{ key: string; map: Record<string, Transaction[]> } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(months.map((m) => api(`/api/data/tx:${m}`).then((r) => r.json() as Promise<Transaction[]>)))
      .then((lists) => alive && setData({ key, map: Object.fromEntries(months.map((m, i) => [m, lists[i]])) }))
      .catch(() => alive && setData({ key, map: {} }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return data?.key === key ? data.map : null;
}

/** Borra un movimiento de su mes (lee la lista, quita el movimiento y la vuelve a guardar). */
export async function removeTransaction(fecha: string, id: string): Promise<void> {
  const month = fecha.slice(0, 7);
  const list = (await (await api(`/api/data/tx:${month}`)).json()) as Transaction[];
  await api(`/api/data/tx:${month}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list.filter((t) => t.id !== id)) });
}
