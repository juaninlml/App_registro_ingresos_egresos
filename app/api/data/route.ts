import { requireUser } from "@/lib/api-auth";
import { readAll, writeMany, type DataWrite } from "@/lib/db";

const MAX_BYTES = 4_000_000;
const MAX_WRITES = 40;

export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  try {
    return Response.json(await readAll(u.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("data GET", e);
    return Response.json({ error: "No se pudo leer la base de datos" }, { status: 500 });
  }
}

/**
 * Guarda una o varias secciones en una sola transacción: { writes: [{ key, value, rev }] }.
 * `rev` es la versión que leyó el cliente; si otra pestaña o dispositivo guardó después, responde 409 y no escribe nada.
 */
export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "Los datos son demasiado grandes" }, { status: 413 });
  let body: { writes?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON no válido" }, { status: 400 });
  }
  const writes = body?.writes;
  if (!Array.isArray(writes) || !writes.length || writes.length > MAX_WRITES) {
    return Response.json({ error: "Escrituras no válidas" }, { status: 400 });
  }
  for (const w of writes as Record<string, unknown>[]) {
    if (!w || typeof w !== "object" || !Number.isInteger(w.rev) || (w.rev as number) < 0) {
      return Response.json({ error: "Escrituras no válidas" }, { status: 400 });
    }
  }

  try {
    const res = await writeMany(u.id, writes as DataWrite[]);
    if ("invalid" in res) {
      return Response.json({ error: `Los datos de "${res.invalid}" no tienen el formato esperado` }, { status: 422 });
    }
    if (!res.ok) {
      return Response.json(
        { error: "Los datos cambiaron en otra pestaña o dispositivo", conflicts: res.conflicts },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, revs: res.revs });
  } catch (e) {
    console.error("data POST", e);
    return Response.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
