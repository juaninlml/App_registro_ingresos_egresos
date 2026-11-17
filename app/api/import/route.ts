import { requireUser } from "@/lib/api-auth";
import { writeMany, type DataKey } from "@/lib/db";
import { DB_KEYS } from "@/lib/types";
import { TX_KEY, validateValue } from "@/lib/validate";

const MAX_BYTES = 4_000_000;

/** Reemplaza las secciones presentes en el respaldo (todas juntas); las que no vengan se dejan como están. */
export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "El archivo es demasiado grande" }, { status: 413 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return Response.json({ error: "El archivo no es un JSON válido" }, { status: 400 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return Response.json({ error: "Formato de respaldo no reconocido" }, { status: 400 });
  }

  const writes: { key: DataKey; value: unknown }[] = [];
  for (const key of DB_KEYS) {
    if (!(key in data)) continue;
    if (!validateValue(key, data[key])) {
      return Response.json({ error: `La sección "${key}" no tiene el formato esperado` }, { status: 422 });
    }
    writes.push({ key, value: data[key] });
  }
  const tx = data.tx;
  if (tx !== undefined) {
    if (!tx || typeof tx !== "object" || Array.isArray(tx)) return Response.json({ error: "La sección \"tx\" no es válida" }, { status: 422 });
    for (const [month, list] of Object.entries(tx as Record<string, unknown>)) {
      const key = `tx:${month}`;
      if (!TX_KEY.test(key) || !validateValue(key as `tx:${string}`, list)) {
        return Response.json({ error: `Los movimientos de ${month} no tienen el formato esperado` }, { status: 422 });
      }
      writes.push({ key: key as DataKey, value: list });
    }
  }
  if (!writes.length) return Response.json({ error: "El respaldo no contiene datos" }, { status: 400 });

  try {
    // todo el respaldo en una sola transacción: si algo falla no queda a medias
    const res = await writeMany(u.id, writes);
    if (!("ok" in res) || !res.ok) throw new Error("No se pudo escribir el respaldo");
    return Response.json({ ok: true, secciones: writes.map((w) => w.key) });
  } catch (e) {
    console.error("import", e);
    return Response.json({ error: "No se pudo guardar el respaldo" }, { status: 500 });
  }
}
