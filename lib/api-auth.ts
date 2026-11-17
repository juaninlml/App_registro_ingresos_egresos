import { cookies } from "next/headers";
import { COOKIE, verifySessionToken } from "./session";
import { porId, OWNER_ID, type Usuario } from "./usuarios";

const noAutorizado = () => Response.json({ error: "No autorizado" }, { status: 401 });

/**
 * Defensa en profundidad: cada ruta de datos revisa la sesión (no solo el proxy) y obtiene de ella el
 * usuario. Si la cuenta fue borrada, la sesión deja de servir aunque la cookie siga firmada.
 */
export async function requireUser(): Promise<Usuario | Response> {
  const uid = await verifySessionToken((await cookies()).get(COOKIE)?.value);
  if (!uid) return noAutorizado();
  const u = await porId(uid);
  if (u) return u;
  // la cuenta original antes de registrarse con correo todavía no está en la lista
  if (uid === OWNER_ID) return { id: OWNER_ID, email: "", admin: true, creado: "" };
  return noAutorizado();
}

/** Igual que requireUser, pero solo para quien administra la app. */
export async function requireAdmin(): Promise<Usuario | Response> {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return u.admin ? u : Response.json({ error: "Solo quien administra la app puede hacer esto" }, { status: 403 });
}
