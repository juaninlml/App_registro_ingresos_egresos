import { requireUser } from "@/lib/api-auth";
import { estadoCodigos, generarCodigos } from "@/lib/recovery";

/** Cuántos códigos de recuperación quedan sin usar (requiere sesión). */
export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  try {
    return Response.json(await estadoCodigos(u.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("auth/recovery GET", e);
    return Response.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }
}

/** Genera códigos nuevos (invalida los anteriores) y los devuelve una sola vez (requiere sesión). */
export async function POST() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  try {
    return Response.json({ codigos: await generarCodigos(u.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("auth/recovery POST", e);
    return Response.json({ error: "No se pudieron generar los códigos" }, { status: 500 });
  }
}
