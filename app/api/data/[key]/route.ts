import { requireAuth } from "@/lib/api-auth";
import { readKey, writeKey } from "@/lib/db";
import { DB_KEYS, type DBKey } from "@/lib/types";
import { TX_KEY, validateValue } from "@/lib/validate";

const MAX_BYTES = 900_000;

function allowed(key: string): key is DBKey | `tx:${string}` {
  return (DB_KEYS as readonly string[]).includes(key) || TX_KEY.test(key);
}

export async function GET(_req: Request, ctx: RouteContext<"/api/data/[key]">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { key } = await ctx.params;
  if (!allowed(key)) return Response.json({ error: "Clave no válida" }, { status: 400 });
  try {
    return Response.json(await readKey(key), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("data/[key] GET", e);
    return Response.json({ error: "No se pudo leer la base de datos" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: RouteContext<"/api/data/[key]">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { key } = await ctx.params;
  if (!allowed(key)) return Response.json({ error: "Clave no válida" }, { status: 400 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "Los datos son demasiado grandes" }, { status: 413 });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON no válido" }, { status: 400 });
  }
  if (!validateValue(key, value)) return Response.json({ error: "Los datos no tienen el formato esperado" }, { status: 422 });

  try {
    await writeKey(key, value);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("data/[key] PUT", e);
    return Response.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
