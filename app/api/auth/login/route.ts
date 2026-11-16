import { NextResponse } from "next/server";
import { clearFailures, clientIp, lockedFor, registerFailure } from "@/lib/guard";
import { K, redis } from "@/lib/redis";
import { COOKIE, cookieOptions, createSessionToken } from "@/lib/session";
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

    const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
    const r = redis();
    const secret = await r.get<string>(K.totp);
    if (!secret) {
      return NextResponse.json({ error: "Aún no configuras Google Authenticator.", needsSetup: true }, { status: 409 });
    }

    const step = verifyCode(secret, body?.code);
    const last = Number((await r.get<number>(K.lastStep)) ?? 0);
    if (step === null || step <= last) {
      await registerFailure(ip);
      return NextResponse.json({ error: "Código incorrecto o ya usado. Espera al siguiente código." }, { status: 401 });
    }

    await r.set(K.lastStep, step, { ex: 120 });
    await clearFailures(ip);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, await createSessionToken(), cookieOptions);
    return res;
  } catch (e) {
    console.error("auth/login", e);
    return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
