import { NextResponse } from "next/server";
import { clearFailures, clientIp, lockedFor, registerFailure } from "@/lib/guard";
import { usarCodigo } from "@/lib/recovery";
import * as store from "@/lib/store";
import { COOKIE, cookieOptions, createSessionToken } from "@/lib/session";
import { verifyCode } from "@/lib/totp";
import { crear, EMAIL, hayCuentaSinMigrar, llaveAuth, normalizarEmail, OWNER_ID, porEmail } from "@/lib/usuarios";

const FALLO = "Correo o código incorrecto (o el código ya se usó).";

/**
 * Entrar con correo + código de Google Authenticator, o correo + código de recuperación.
 * Si aún no hay usuarios pero existe la cuenta de antes, el primer acceso correcto la registra con ese
 * correo como administradora (sus datos se quedan donde estaban).
 */
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

    const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown; recovery?: unknown } | null;
    const email = normalizarEmail(body?.email);
    if (!EMAIL.test(email)) return NextResponse.json({ error: "Escribe tu correo." }, { status: 400 });

    const usuario = await porEmail(email);
    const migracion = !usuario && (await hayCuentaSinMigrar());
    const uid = usuario?.id ?? (migracion ? OWNER_ID : null);
    // mismo mensaje exista o no el correo: no se revela quién tiene cuenta
    if (!uid) {
      await registerFailure(ip);
      return NextResponse.json({ error: FALLO }, { status: 401 });
    }

    let recuperacion = false;
    if (body?.recovery !== undefined) {
      if (!(await usarCodigo(uid, body.recovery))) {
        await registerFailure(ip);
        return NextResponse.json({ error: FALLO }, { status: 401 });
      }
      recuperacion = true;
    } else {
      const secret = await store.get<string>(llaveAuth(uid, "totp"));
      const step = secret ? verifyCode(secret, body?.code) : null;
      const last = Number((await store.get<number>(llaveAuth(uid, "laststep"))) ?? 0);
      if (step === null || step <= last) {
        await registerFailure(ip);
        return NextResponse.json({ error: FALLO }, { status: 401 });
      }
      await store.set(llaveAuth(uid, "laststep"), step, { ex: 120 });
    }

    if (migracion) await crear({ id: OWNER_ID, email, admin: true });
    await clearFailures(ip);
    const res = NextResponse.json({ ok: true, recuperacion, migrado: migracion });
    res.cookies.set(COOKIE, await createSessionToken(uid), cookieOptions);
    return res;
  } catch (e) {
    console.error("auth/login", e);
    return NextResponse.json({ error: "Error de configuración del servidor" }, { status: 500 });
  }
}
