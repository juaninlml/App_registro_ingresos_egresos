import { requireUser } from "@/lib/api-auth";
import { isDataKey, readKey } from "@/lib/db";

/** Lee una sección; la versión va en la cabecera `X-Rev`. Para guardar se usa POST /api/data. */
export async function GET(_req: Request, ctx: RouteContext<"/api/data/[key]">) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { key } = await ctx.params;
  if (!isDataKey(key)) return Response.json({ error: "Clave no válida" }, { status: 400 });
  try {
    const { value, rev } = await readKey(u.id, key);
    return Response.json(value, { headers: { "Cache-Control": "no-store", "X-Rev": String(rev) } });
  } catch (e) {
    console.error("data/[key] GET", e);
    return Response.json({ error: "No se pudo leer la base de datos" }, { status: 500 });
  }
}
