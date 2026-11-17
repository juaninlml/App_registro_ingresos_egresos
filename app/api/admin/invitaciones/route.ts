import { requireAdmin } from "@/lib/api-auth";
import { invitaciones, invitar, listar, revocarInvitacion } from "@/lib/usuarios";

const MAX_CUENTAS = 10; // la app está pensada para pocas personas

/** Invitaciones vigentes (sin el token). Solo administración. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const lista = (await invitaciones()).map(({ id, creado, expira, nota }) => ({ id, creado, expira, nota: nota ?? null }));
  return Response.json({ invitaciones: lista }, { headers: { "Cache-Control": "no-store" } });
}

/** Crea una invitación de un solo uso (7 días) y devuelve el enlace una sola vez. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  try {
    if ((await listar()).length + (await invitaciones()).length >= MAX_CUENTAS) {
      return Response.json({ error: `Límite de ${MAX_CUENTAS} cuentas (incluidas las invitaciones pendientes).` }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { nota?: unknown };
    const { token, invitacion } = await invitar(typeof body.nota === "string" ? body.nota : undefined);
    const enlace = `${new URL(req.url).origin}/registro?i=${token}`;
    return Response.json({ enlace, invitacion: { id: invitacion.id, creado: invitacion.creado, expira: invitacion.expira, nota: invitacion.nota ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin/invitaciones POST", e);
    return Response.json({ error: "No se pudo crear la invitación" }, { status: 500 });
  }
}

/** Cancela una invitación pendiente. */
export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  await revocarInvitacion(new URL(req.url).searchParams.get("id") ?? "");
  return Response.json({ ok: true });
}
