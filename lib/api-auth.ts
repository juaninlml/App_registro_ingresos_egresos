import { cookies } from "next/headers";
import { COOKIE, verifySessionToken } from "./session";

/** Defensa en profundidad: cada ruta de datos revisa la sesión, no solo el proxy. */
export async function requireAuth(): Promise<Response | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (await verifySessionToken(token)) return null;
  return Response.json({ error: "No autorizado" }, { status: 401 });
}
