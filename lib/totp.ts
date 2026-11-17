import * as OTPAuth from "otpauth";

const ISSUER = "Kakeibo";

export function newSecretBase32(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function build(secretBase32: string, label = "Kakeibo"): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** Enlace del QR; la etiqueta (el correo) distingue varias cuentas en el mismo teléfono. */
export function otpauthUrl(secretBase32: string, label?: string): string {
  return build(secretBase32, label || undefined).toString();
}

/** Devuelve el paso de 30 s en que coincide el código (para bloquear reutilización) o null si es inválido. */
export function verifyCode(secretBase32: string, rawCode: unknown): number | null {
  if (typeof rawCode !== "string") return null;
  const code = rawCode.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const delta = build(secretBase32).validate({ token: code, window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / 30) + delta;
}
