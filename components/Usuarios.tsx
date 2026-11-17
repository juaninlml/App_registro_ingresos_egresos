"use client";
import { useCallback, useEffect, useState } from "react";
import { IconBorrar, IconMas } from "@/components/icons";
import { useToast } from "@/components/motion";
import { Badge, Btn, Card, Field, IconBtn, Input, Modal, Section } from "@/components/ui";
import { fdate } from "@/lib/dates";

interface UsuarioVista { id: string; email: string; nombre: string | null; admin: boolean; creado: string; tu: boolean }
interface InvitacionVista { id: string; creado: string; expira: string; nota: string | null }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j as T;
}

/** ¿Quien tiene la sesión administra la app? (null mientras se averigua) */
export function useEsAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ admin: boolean }>("/api/auth/yo").then((j) => setAdmin(j.admin)).catch(() => setAdmin(false));
  }, []);
  return admin;
}

/**
 * Cuentas de la app (solo quien administra): invitar con un enlace de un solo uso, ver invitaciones
 * pendientes y quitar cuentas. Nadie, ni quien administra, puede ver los datos de otra cuenta.
 */
export function Usuarios() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioVista[] | null>(null);
  const [invs, setInvs] = useState<InvitacionVista[]>([]);
  const [nota, setNota] = useState("");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [u, i] = await Promise.all([api<{ usuarios: UsuarioVista[] }>("/api/admin/usuarios"), api<{ invitaciones: InvitacionVista[] }>("/api/admin/invitaciones")]);
      setUsuarios(u.usuarios);
      setInvs(i.invitaciones);
    } catch (e) {
      toast({ tone: "danger", title: "No se pudo cargar la lista de cuentas", detail: (e as Error).message });
    }
  }, [toast]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void cargar();
  }, [cargar]);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      const j = await api<{ enlace: string }>("/api/admin/invitaciones", { method: "POST", body: JSON.stringify({ nota }) });
      setEnlace(j.enlace);
      setNota("");
      void cargar();
    } catch (x) {
      toast({ tone: "danger", title: "No se creó la invitación", detail: (x as Error).message });
    } finally {
      setCreando(false);
    }
  }

  async function quitar(u: UsuarioVista) {
    if (!confirm(`¿Quitar la cuenta de ${u.nombre ?? u.email}? Se BORRARÁN todos sus datos y no se puede deshacer.`)) return;
    try {
      await api(`/api/admin/usuarios?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
      toast({ tone: "muted", title: "Cuenta quitada", detail: u.email });
      void cargar();
    } catch (x) {
      toast({ tone: "danger", title: "No se pudo quitar", detail: (x as Error).message });
    }
  }

  async function cancelar(i: InvitacionVista) {
    await api(`/api/admin/invitaciones?id=${encodeURIComponent(i.id)}`, { method: "DELETE" }).catch(() => {});
    toast({ tone: "muted", title: "Invitación cancelada", detail: i.nota ?? undefined });
    void cargar();
  }

  return (
    <Section title="Cuentas">
      <Card className="space-y-4">
        <p className="text-sm text-muted">Cada cuenta tiene sus propios datos, separados de los demás. Tú administras quién entra, pero no puedes ver las finanzas de nadie.</p>

        <ul className="divide-y divide-border/60 rounded-xl border border-border">
          {(usuarios ?? []).map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold">{u.nombre ?? u.email}{u.tu && <Badge tone="accent">Tú</Badge>}{u.admin && !u.tu && <Badge>Admin</Badge>}</span>
                <span className="block truncate text-xs text-muted">{u.email}{u.creado ? ` · desde ${fdate(u.creado.slice(0, 10))}` : ""}</span>
              </span>
              {!u.admin && <IconBtn small label={`Quitar la cuenta de ${u.email}`} onClick={() => void quitar(u)} className="hover:!text-danger"><IconBorrar size={17} /></IconBtn>}
            </li>
          ))}
          {usuarios === null && <li className="px-3 py-2.5 text-sm text-muted">Cargando…</li>}
        </ul>

        {invs.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Invitaciones pendientes</div>
            <ul className="space-y-1">
              {invs.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{i.nota ?? "Sin nota"} <span className="text-xs text-muted">· vence {fdate(i.expira.slice(0, 10))}</span></span>
                  <Btn small variant="ghost" onClick={() => void cancelar(i)}>Cancelar</Btn>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={invitar} className="flex items-end gap-2">
          <Field label="Invitar a alguien" hint="Se crea un enlace de un solo uso que vence en 7 días.">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={60} placeholder="Para quién es (opcional)" />
          </Field>
          <Btn type="submit" variant="primary" disabled={creando} className="mb-6 shrink-0"><IconMas size={18} />Invitar</Btn>
        </form>
      </Card>

      <Modal open={!!enlace} onClose={() => setEnlace(null)} title="Enlace de invitación">
        {enlace && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Mándalo solo a la persona invitada (por WhatsApp, por ejemplo). Sirve <b className="text-fg">una vez</b> y vence en 7 días. Por seguridad no se vuelve a mostrar.</p>
            <p className="break-all rounded-xl bg-surface-2 p-3 font-mono text-xs select-all">{enlace}</p>
            <Btn
              variant="primary"
              className="w-full"
              onClick={() => void navigator.clipboard?.writeText(enlace).then(() => toast({ tone: "accent", title: "Enlace copiado" }))}
            >
              Copiar enlace
            </Btn>
          </div>
        )}
      </Modal>
    </Section>
  );
}
