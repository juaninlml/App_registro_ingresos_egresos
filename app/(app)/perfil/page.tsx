"use client";
import { useRef, useState } from "react";
import { Avatar, prepararFoto } from "@/components/Avatar";
import { useData } from "@/components/DataProvider";
import { useToast } from "@/components/motion";
import { Btn, Card, Field, Input, PageHeader, Section } from "@/components/ui";
import { CORREO } from "@/lib/validate";

export default function PerfilPage() {
  const { db, save } = useData();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const perfil = db.perfil;
  const [f, setF] = useState({ nombre: perfil?.nombre ?? "", correo: perfil?.correo ?? "" });
  const [foto, setFoto] = useState<string | undefined>(perfil?.foto);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const correoMal = f.correo.trim() !== "" && !CORREO.test(f.correo.trim());
  const cambios = f.nombre.trim() !== (perfil?.nombre ?? "") || f.correo.trim() !== (perfil?.correo ?? "") || foto !== perfil?.foto;
  const vista = { nombre: f.nombre, foto };

  async function elegirFoto(archivo: File) {
    setProcesando(true);
    try {
      setFoto(await prepararFoto(archivo));
    } catch (e) {
      toast({ tone: "danger", title: "No se pudo usar esa imagen", detail: (e as Error).message });
    } finally {
      setProcesando(false);
      if (file.current) file.current.value = "";
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (correoMal) return;
    setGuardando(true);
    const nuevo = {
      ...(f.nombre.trim() ? { nombre: f.nombre.trim() } : {}),
      ...(f.correo.trim() ? { correo: f.correo.trim().toLowerCase() } : {}),
      ...(foto ? { foto } : {}),
    };
    const ok = await save("perfil", Object.keys(nuevo).length ? nuevo : null);
    setGuardando(false);
    if (ok) toast({ tone: "accent", title: "Perfil guardado", detail: nuevo.nombre ? `Hola, ${nuevo.nombre.split(" ")[0]}` : undefined });
  }

  return (
    <>
      <PageHeader title="Perfil" sub="Tus datos en esta copia de Kakeibo" />
      <form onSubmit={guardar}>
        <Section title="Foto">
          <Card className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="press group relative rounded-full focus-visible:outline-offset-4"
              aria-label="Cambiar foto de perfil"
            >
              <Avatar perfil={vista} size={96} className={procesando ? "opacity-50" : ""} />
              <span aria-hidden className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-xs font-semibold text-white opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100">Cambiar</span>
            </button>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-muted">Se recorta al centro y se reduce en tu teléfono antes de guardarse; no se sube a ningún otro servicio.</p>
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => file.current?.click()} disabled={procesando}>{procesando ? "Procesando…" : foto ? "Cambiar foto" : "Elegir foto"}</Btn>
                {foto && <Btn variant="ghost" onClick={() => setFoto(undefined)}>Quitar foto</Btn>}
              </div>
            </div>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void elegirFoto(e.target.files[0])} />
          </Card>
        </Section>

        <Section title="Datos">
          <Card className="space-y-3">
            <Field label="Nombre">
              <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={60} placeholder="¿Cómo te llamas?" autoComplete="name" />
            </Field>
            <Field
              label="Correo de recuperación"
              hint={correoMal ? undefined : "Por ahora solo se guarda; más adelante servirá para recuperar el acceso si pierdes tu teléfono y tus códigos."}
            >
              <Input
                type="email"
                value={f.correo}
                onChange={(e) => setF({ ...f, correo: e.target.value })}
                maxLength={120}
                placeholder="tu@correo.com"
                autoComplete="email"
                aria-invalid={correoMal}
                className={correoMal ? "border-danger focus:border-danger focus:ring-danger/25" : ""}
              />
            </Field>
            {correoMal && <p role="alert" className="-mt-1 text-xs text-danger">Revisa el correo: debe tener la forma nombre@dominio.com</p>}
          </Card>
        </Section>

        <Btn variant="primary" type="submit" disabled={!cambios || correoMal || guardando || procesando} className="w-full sm:w-auto">
          {guardando ? "Guardando…" : cambios ? "Guardar perfil" : "Sin cambios"}
        </Btn>
      </form>
    </>
  );
}
