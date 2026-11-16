import { requireAuth } from "@/lib/api-auth";
import { allTxMonths, readAll } from "@/lib/db";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const [{ db }, tx] = await Promise.all([readAll(), allTxMonths()]);
    const stamp = new Date().toISOString().slice(0, 10);
    const body = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...db, tx }, null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="respaldo-finanzas-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("export", e);
    return Response.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
