import { requireAuth } from "@/lib/api-auth";
import { readAll } from "@/lib/db";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    return Response.json(await readAll(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("data GET", e);
    return Response.json({ error: "No se pudo leer la base de datos" }, { status: 500 });
  }
}
