import { connection } from "next/server";
import * as store from "@/lib/store";
import { listar, llaveAuth, OWNER_ID } from "@/lib/usuarios";

export async function GET() {
  await connection(); // siempre en tiempo de petición, nunca en el build
  try {
    const hayUsuarios = (await listar()).length > 0;
    const cuentaVieja = Boolean(await store.get<string>(llaveAuth(OWNER_ID, "totp")));
    const configured = hayUsuarios || cuentaVieja;
    return Response.json({
      configured,
      setupAvailable: !configured && Boolean(process.env.SETUP_KEY),
      // la cuenta de antes todavía no se registra con correo (su primer acceso la convierte en administradora)
      migracion: !hayUsuarios && cuentaVieja,
    });
  } catch (e) {
    console.error("auth/status", e);
    return Response.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
