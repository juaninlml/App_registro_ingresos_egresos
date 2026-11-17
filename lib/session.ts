import { jwtVerify, SignJWT } from "jose";

export const COOKIE = "fin_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 días

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET debe existir y tener al menos 32 caracteres.");
  }
  return new TextEncoder().encode(s);
}

/** Sesión firmada con el id del usuario en `sub`. */
export async function createSessionToken(uid: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());
}

/** Devuelve el id del usuario de la sesión, o null si no es válida (las sesiones de antes de los usuarios no traen id). */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};
