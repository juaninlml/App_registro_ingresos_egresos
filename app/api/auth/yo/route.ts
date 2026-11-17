import { requireUser } from "@/lib/api-auth";

/** Quién tiene la sesión abierta (para mostrar la administración solo a quien administra). */
export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return Response.json({ id: u.id, email: u.email, nombre: u.nombre ?? null, admin: Boolean(u.admin) }, { headers: { "Cache-Control": "no-store" } });
}
