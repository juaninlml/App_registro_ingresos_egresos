import { NextResponse } from "next/server";
import { clearFailures, clientIp, lockedFor, registerFailure } from "@/lib/guard";
import * as store from "@/lib/store";
import { K } from "@/lib/store";
import { COOKIE, cookieOptions, createSessionToken } from "@/lib/session";
import { usarCodigo } from "@/lib/recovery";
import { verifyCode } from "@/lib/totp";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const wait = await lockedFor(ip);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(wait / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }

    const body = (await req.json().catch(() => null)) as { code?: unknown; recovery?: unknown } | null;

    // Entrada con un código de recuperación (si perdiste el teléfono): mismo límite de intentos
    if (body?.recovery !== undefined) {
      if (!(await usarCodigo(body.recovery))) {
        await registerFailure(ip);
        return NextResponse.json({ error: "Código de recuperación incorrecto o ya usado." }, { status: 401 });
      }
      await clearFailures(ip);
      const res = NextResponse.json({ ok: true, recuperacion: true });
      res.cookies.set(COOKIE, await createSessionToken(), cookieOptions);
      return res;
    }

    const secret = await store.get<string>(K.totp);
    if (!secret) {
      return NextResponse.json({ error: "Aún no configuras Google Authenticator.", needsSetup: true }, { status: 409 });
    }

    const step = verifyCode(secret, body?.code);
    const last = Number((await store.get<number>(K.lastStep)) ?? 0);
    if (step === null || step <= last) {
      await registerFailure(ip);
      return NextResponse.json({ error: "Código incorrecto o ya usado. Espera al siguiente código." }, { status: 401 });
    }

    await store.set(K.lastStep, step, { ex: 120 });
    await clearFailures(ip);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, await createSessionToken(), cookieOptions);
    return res;
  } catch (e) {
    console.error("auth/login", e);
    return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
