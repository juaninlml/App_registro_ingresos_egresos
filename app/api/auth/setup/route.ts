import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { clearFailures, clientIp, lockedFor, registerFailure, safeEqual } from "@/lib/guard";
import { K, redis } from "@/lib/redis";
import { COOKIE, cookieOptions, createSessionToken } from "@/lib/session";
import { newSecretBase32, otpauthUrl, verifyCode } from "@/lib/totp";

/**
 * Configuración única de Google Authenticator.
 *  1) { action: "start", setupKey }            -> genera el secreto y el QR (queda pendiente 10 min)
 *  2) { action: "confirm", setupKey, code }    -> comprueba el primer código y lo guarda
 * Solo funciona mientras no exista un secreto guardado y exige la clave SETUP_KEY de Vercel.
 */
export async function POST(req: Request) {
  try {
    const expected = process.env.SETUP_KEY;
    if (!expected || expected.length < 12) {
      return NextResponse.json(
        { error: "Define la variable SETUP_KEY (mínimo 12 caracteres) en Vercel para poder configurar el acceso." },
        { status: 503 },
      );
    }
    const r = redis();
    if (await r.get<string>(K.totp)) {
      return NextResponse.json({ error: "El acceso ya está configurado." }, { status: 403 });
    }

    const ip = clientIp(req);
    const wait = await lockedFor(ip);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(wait / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }

    const body = (await req.json().catch(() => null)) as { action?: string; setupKey?: unknown; code?: unknown } | null;
    if (typeof body?.setupKey !== "string" || !safeEqual(body.setupKey, expected)) {
      await registerFailure(ip);
      return NextResponse.json({ error: "Clave de configuración incorrecta." }, { status: 401 });
    }

    if (body.action === "start") {
      const secret = newSecretBase32();
      await r.set(K.pending, secret, { ex: 600 });
      const url = otpauthUrl(secret);
      const qr = await QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: "M" });
      return NextResponse.json({ qr, secret });
    }

    if (body.action === "confirm") {
      const pending = await r.get<string>(K.pending);
      if (!pending) {
        return NextResponse.json({ error: "El código QR expiró. Genera uno nuevo." }, { status: 410 });
      }
      const step = verifyCode(pending, body.code);
      if (step === null) {
        await registerFailure(ip);
        return NextResponse.json({ error: "El código no coincide. Revisa que la hora de tu teléfono sea automática." }, { status: 401 });
      }
      const saved = await r.set(K.totp, pending, { nx: true });
      if (!saved) return NextResponse.json({ error: "El acceso ya está configurado." }, { status: 403 });
      await r.del(K.pending);
      await r.set(K.lastStep, step, { ex: 120 });
      await clearFailures(ip);
      const res = NextResponse.json({ ok: true });
      res.cookies.set(COOKIE, await createSessionToken(), cookieOptions);
      return res;
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (e) {
    console.error("auth/setup", e);
    return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
