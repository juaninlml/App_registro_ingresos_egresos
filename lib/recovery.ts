import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import * as store from "./store";
import { K } from "./store";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

// Sin letras ni números que se confundan (0/O, 1/I/L)
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CANTIDAD = 8;

interface Guardado {
  salt: string; // base64
  hashes: string[]; // base64, uno por código aún sin usar
  creado: string; // ISO
}

/** «abcde fghij» → «ABCDE-FGHIJ»; null si no tiene la forma de un código. */
export function normalizar(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const limpio = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpio.length !== 10 || [...limpio].some((c) => !ALFABETO.includes(c))) return null;
  return `${limpio.slice(0, 5)}-${limpio.slice(5)}`;
}

const hash = async (codigo: string, salt: Buffer) => (await scrypt(codigo, salt, 32)).toString("base64");

/** Crea códigos nuevos (reemplaza los anteriores) y los devuelve en claro una sola vez. */
export async function generarCodigos(): Promise<string[]> {
  const codigos = Array.from({ length: CANTIDAD }, () => {
    const c = Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
  const salt = randomBytes(16);
  const hashes = await Promise.all(codigos.map((c) => hash(c, salt)));
  const guardado: Guardado = { salt: salt.toString("base64"), hashes, creado: new Date().toISOString() };
  await store.set(K.recovery, guardado);
  return codigos;
}

export async function estadoCodigos(): Promise<{ restantes: number; creado: string | null }> {
  const g = await store.get<Guardado>(K.recovery);
  return { restantes: g?.hashes.length ?? 0, creado: g?.creado ?? null };
}

/** Si el código es válido lo gasta (no se puede volver a usar) y devuelve true. */
export async function usarCodigo(raw: unknown): Promise<boolean> {
  const codigo = normalizar(raw);
  const g = await store.get<Guardado>(K.recovery);
  if (!codigo || !g?.hashes.length) return false;
  const h = Buffer.from(await hash(codigo, Buffer.from(g.salt, "base64")), "base64");
  // se comparan todos en tiempo constante para no revelar cuál coincidió
  let encontrado = -1;
  g.hashes.forEach((x, i) => {
    const b = Buffer.from(x, "base64");
    if (b.length === h.length && timingSafeEqual(b, h)) encontrado = i;
  });
  if (encontrado < 0) return false;
  await store.set(K.recovery, { ...g, hashes: g.hashes.filter((_, i) => i !== encontrado) });
  return true;
}
