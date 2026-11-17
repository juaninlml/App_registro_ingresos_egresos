import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { writeMany } from "@/lib/db";
import { clearFailures, clientIp, lockedFor, registerFailure } from "@/lib/guard";
import * as store from "@/lib/store";
import { K } from "@/lib/store";
import { COOKIE, cookieOptions, createSessionToken } from "@/lib/session";
import { newSecretBase32, otpauthUrl, verifyCode } from "@/lib/totp";
import { crear, EMAIL, invitacionPorToken, llaveAuth, normalizarEmail, porEmail, revocarInvitacion } from "@/lib/usuarios";

/**
 * Registro con una invitación (enlace de un solo uso que genera quien administra la app):
 *  1) { action: "start", invite, email, nombre }          -> valida y devuelve el QR para Google Authenticator
 *  2) { action: "confirm", invite, email, nombre, code }  -> crea la cuenta, gasta la invitación y entra
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const wait = await lockedFor(ip);
    if (wait > 0) {
      return NextResponse.json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(wait / 60)} min.` }, { status: 429, headers: { "Retry-After": String(wait) } });
    }

    const body = (await req.json().catch(() => null)) as { action?: string; invite?: unknown; email?: unknown; nombre?: unknown; code?: unknown } | null;
    const inv = await invitacionPorToken(body?.invite);
    if (!inv) {
      await registerFailure(ip);
      return NextResponse.json({ error: "La invitación no es válida, ya se usó o expiró. Pide una nueva." }, { status: 410 });
    }
    if (body?.action === "check") return NextResponse.json({ ok: true, expira: inv.expira });

    const email = normalizarEmail(body?.email);
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim().slice(0, 60) : "";
    if (!EMAIL.test(email)) return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
    if (!nombre) return NextResponse.json({ error: "Escribe tu nombre." }, { status: 400 });
    if (await porEmail(email)) return NextResponse.json({ error: "Ya existe una cuenta con ese correo. Entra desde el inicio de sesión." }, { status: 409 });

    if (body?.action === "start") {
      const secret = newSecretBase32();
      await store.set(K.pendingInvite(inv.id), { secret, email }, { ex: 600 });
      const qr = await QRCode.toDataURL(otpauthUrl(secret, email), { width: 280, margin: 1, errorCorrectionLevel: "M" });
      return NextResponse.json({ qr, secret });
    }

    if (body?.action === "confirm") {
      const pending = await store.get<{ secret: string; email: string }>(K.pendingInvite(inv.id));
      if (!pending || pending.email !== email) return NextResponse.json({ error: "El código QR expiró. Vuelve a empezar." }, { status: 410 });
      const step = verifyCode(pending.secret, body?.code);
      if (step === null) {
        await registerFailure(ip);
        return NextResponse.json({ error: "El código no coincide. Revisa que la hora de tu teléfono sea automática." }, { status: 401 });
      }
      // la invitación se gasta primero: si dos personas usan el mismo enlace a la vez, solo una entra
      await revocarInvitacion(inv.id);
      const u = await crear({ email, nombre });
      await store.set(llaveAuth(u.id, "totp"), pending.secret);
      await store.set(llaveAuth(u.id, "laststep"), step, { ex: 120 });
      await store.del(K.pendingInvite(inv.id));
      await writeMany(u.id, [{ key: "perfil", value: { nombre, correo: email } }]);
      await clearFailures(ip);
      const res = NextResponse.json({ ok: true });
      res.cookies.set(COOKIE, await createSessionToken(u.id), cookieOptions);
      return res;
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (e) {
    console.error("auth/registro", e);
    return NextResponse.json({ error: (e as Error).message.startsWith("Ya existe") ? (e as Error).message : "Error de configuración del servidor" }, { status: 500 });
  }
}
