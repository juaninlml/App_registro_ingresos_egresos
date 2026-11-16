import { connection } from "next/server";
import { K, redis } from "@/lib/redis";

export async function GET() {
  await connection(); // siempre en tiempo de petición, nunca en el build
  try {
    const configured = Boolean(await redis().get<string>(K.totp));
    return Response.json({ configured, setupAvailable: !configured && Boolean(process.env.SETUP_KEY) });
  } catch (e) {
    console.error("auth/status", e);
    return Response.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
