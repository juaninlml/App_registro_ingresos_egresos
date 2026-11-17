import { requireAdmin } from "@/lib/api-auth";
import { readKey } from "@/lib/db";
import type { Perfil } from "@/lib/types";
import { eliminar, listar } from "@/lib/usuarios";

/** Lista de cuentas (sin secretos). Solo administración. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  try {
    // solo el nombre del perfil (para reconocer la cuenta); nada de sus finanzas
    const usuarios = await Promise.all(
      (await listar()).map(async (u) => {
        const perfil = (await readKey(u.id, "perfil")).value as Perfil | null;
        return { id: u.id, email: u.email, nombre: perfil?.nombre ?? u.nombre ?? null, admin: Boolean(u.admin), creado: u.creado, tu: u.id === a.id };
      }),
    );
    return Response.json({ usuarios }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin/usuarios GET", e);
    return Response.json({ error: "No se pudo leer la lista" }, { status: 500 });
  }
}

/** Quita una cuenta y BORRA todos sus datos. No se puede quitar a sí mismo ni a otra cuenta administradora. */
export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const u = (await listar()).find((x) => x.id === id);
    if (!u) return Response.json({ error: "Esa cuenta no existe" }, { status: 404 });
    if (u.id === a.id || u.admin) return Response.json({ error: "No puedes quitar una cuenta administradora" }, { status: 400 });
    await eliminar(u.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("admin/usuarios DELETE", e);
    return Response.json({ error: "No se pudo quitar la cuenta" }, { status: 500 });
  }
}
