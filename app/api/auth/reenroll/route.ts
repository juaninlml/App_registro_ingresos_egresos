import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireUser } from "@/lib/api-auth";
import { clientIp, lockedFor, registerFailure } from "@/lib/guard";
import * as store from "@/lib/store";
import { newSecretBase32, otpauthUrl, verifyCode } from "@/lib/totp";
import { llaveAuth } from "@/lib/usuarios";

/**
 * Cambiar el teléfono de Google Authenticator (requiere sesión, por ejemplo después de entrar con un
 * código de recuperación):
 *  1) { action: "start" }           -> secreto nuevo y QR (pendiente 10 min; el actual sigue valiendo)
 *  2) { action: "confirm", code }   -> si el código del teléfono nuevo es correcto, reemplaza al anterior
 */
export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  try {
    const ip = clientIp(req);
    const wait = await lockedFor(ip);
    if (wait > 0) {
      return NextResponse.json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(wait / 60)} min.` }, { status: 429, headers: { "Retry-After": String(wait) } });
    }
    const body = (await req.json().catch(() => null)) as { action?: string; code?: unknown } | null;

    if (body?.action === "start") {
      const secret = newSecretBase32();
      await store.set(llaveAuth(u.id, "pending:reenroll"), secret, { ex: 600 });
      const qr = await QRCode.toDataURL(otpauthUrl(secret, u.email), { width: 280, margin: 1, errorCorrectionLevel: "M" });
      return NextResponse.json({ qr, secret });
    }

    if (body?.action === "confirm") {
      const pending = await store.get<string>(llaveAuth(u.id, "pending:reenroll"));
      if (!pending) return NextResponse.json({ error: "El código QR expiró. Genera uno nuevo." }, { status: 410 });
      const step = verifyCode(pending, body.code);
      if (step === null) {
        await registerFailure(ip);
        return NextResponse.json({ error: "El código no coincide. Revisa que la hora de tu teléfono sea automática." }, { status: 401 });
      }
      await store.set(llaveAuth(u.id, "totp"), pending);
      await store.del(llaveAuth(u.id, "pending:reenroll"));
      await store.set(llaveAuth(u.id, "laststep"), step, { ex: 120 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (e) {
    console.error("auth/reenroll", e);
    return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
