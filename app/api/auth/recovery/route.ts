import { requireAuth } from "@/lib/api-auth";
import { estadoCodigos, generarCodigos } from "@/lib/recovery";

/** Cuántos códigos de recuperación quedan sin usar (requiere sesión). */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    return Response.json(await estadoCodigos(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("auth/recovery GET", e);
    return Response.json({ error: "No se pudo leer el estado" }, { status: 500 });
  }
}

/** Genera códigos nuevos (invalida los anteriores) y los devuelve una sola vez (requiere sesión). */
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    return Response.json({ codigos: await generarCodigos() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("auth/recovery POST", e);
    return Response.json({ error: "No se pudieron generar los códigos" }, { status: 500 });
  }
}
