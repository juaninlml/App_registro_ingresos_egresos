import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as store from "./store";

/**
 * Varios usuarios en la misma app, cada quien con sus datos aparte.
 *
 * Todo vive en la tabla `kv`, separado por prefijo. La cuenta que ya existía antes de haber usuarios
 * («owner») conserva sus llaves de siempre (`fin:…`) para no mover sus datos; las cuentas nuevas usan
 * `fin:u:<id>:…`. El id siempre sale de la sesión del servidor, nunca de lo que mande el navegador.
 */

export const OWNER_ID = "owner";

export interface Usuario {
  id: string;
  email: string;
  nombre?: string;
  admin?: boolean;
  creado: string; // ISO
}

export interface Invitacion {
  id: string;
  hash: string; // sha256 del token: el token en claro solo existe en el enlace
  creado: string;
  expira: string;
  nota?: string;
}

const USERS = "fin:auth:users";
const INVITES = "fin:auth:invites";

/** Prefijo de las llaves de datos de un usuario. */
export const prefijoDatos = (uid: string) => (uid === OWNER_ID ? "fin:" : `fin:u:${uid}:`);
/** Llave de un dato del usuario (cards, msi, tx:2026-11…). */
export const llaveDato = (uid: string, key: string) => prefijoDatos(uid) + key;

type Auth = "totp" | "laststep" | "recovery" | "pending:reenroll";
/** Llaves de acceso de un usuario (secreto del Authenticator, códigos de recuperación…). */
export const llaveAuth = (uid: string, k: Auth) => (uid === OWNER_ID ? `fin:auth:${k}` : `fin:auth:u:${uid}:${k}`);

export const normalizarEmail = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function listar(): Promise<Usuario[]> {
  return (await store.get<Usuario[]>(USERS)) ?? [];
}

export async function porEmail(email: string): Promise<Usuario | null> {
  const e = normalizarEmail(email);
  return (await listar()).find((u) => u.email === e) ?? null;
}

export async function porId(id: string): Promise<Usuario | null> {
  return (await listar()).find((u) => u.id === id) ?? null;
}

/** ¿Hay una cuenta de antes (un solo usuario) que aún no se registra con correo? */
export async function hayCuentaSinMigrar(): Promise<boolean> {
  return (await listar()).length === 0 && Boolean(await store.get<string>(llaveAuth(OWNER_ID, "totp")));
}

export async function crear(datos: { id?: string; email: string; nombre?: string; admin?: boolean }): Promise<Usuario> {
  const lista = await listar();
  const email = normalizarEmail(datos.email);
  if (lista.some((u) => u.email === email)) throw new Error("Ya existe una cuenta con ese correo");
  const u: Usuario = { id: datos.id ?? randomUUID(), email, nombre: datos.nombre?.trim() || undefined, admin: datos.admin || undefined, creado: new Date().toISOString() };
  await store.set(USERS, [...lista, u]);
  return u;
}

/** Quita la cuenta y borra todos sus datos y accesos. La cuenta original no se puede borrar. */
export async function eliminar(uid: string): Promise<void> {
  if (uid === OWNER_ID) throw new Error("La cuenta principal no se puede borrar");
  await store.set(USERS, (await listar()).filter((u) => u.id !== uid));
  await store.delByPrefix(prefijoDatos(uid));
  await store.delByPrefix(`fin:auth:u:${uid}:`);
}

/* ------------------------------------ Invitaciones ------------------------------------ */

const hashToken = (t: string) => createHash("sha256").update(t).digest("base64url");
const DIA = 86_400_000;

export async function invitaciones(): Promise<Invitacion[]> {
  const ahora = new Date().toISOString();
  return ((await store.get<Invitacion[]>(INVITES)) ?? []).filter((i) => i.expira > ahora);
}

/** Crea una invitación de un solo uso; devuelve el token en claro (solo esta vez). */
export async function invitar(nota?: string, dias = 7): Promise<{ token: string; invitacion: Invitacion }> {
  const token = randomBytes(24).toString("base64url");
  const ahora = Date.now();
  const invitacion: Invitacion = { id: randomUUID(), hash: hashToken(token), creado: new Date(ahora).toISOString(), expira: new Date(ahora + dias * DIA).toISOString(), nota: nota?.trim().slice(0, 60) || undefined };
  await store.set(INVITES, [...(await invitaciones()), invitacion]);
  return { token, invitacion };
}

export async function invitacionPorToken(token: unknown): Promise<Invitacion | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const h = hashToken(token);
  return (await invitaciones()).find((i) => i.hash === h) ?? null;
}

export async function revocarInvitacion(id: string): Promise<void> {
  await store.set(INVITES, (await invitaciones()).filter((i) => i.id !== id));
}
