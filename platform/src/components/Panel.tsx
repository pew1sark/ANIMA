import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { useTenant } from '@/core/tenant/TenantContext';
import { MODULES } from '@/core/modules/registry';
import { platformService, type ModuloEstado, type CampoPersonalizado,
         type Flujo, type FeatureTenant, type Suscripcion } from '@/services/platform.service';
import type { ModuleSlug } from '@/types/core';

const clp = (n: number) => n === 0 ? 'a convenir' : '$' + n.toLocaleString('es-CL');

function Marca() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-[10px] grid place-items-center border border-line bg-sunk text-accent-deep">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3l7 4v10l-7 4-7-4V7zM12 8l3.5 2v4L12 16l-3.5-2v-4z" />
        </svg>
      </span>
      <span className="leading-tight">
        <b className="block text-[15px] font-extrabold tracking-tight">ANIMA</b>
        <span className="text-[10px] uppercase tracking-[.12em] font-extrabold text-accent-deep">Plataforma</span>
      </span>
    </span>
  );
}

function Seccion({ titulo, nota, children }:
  { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-[10px] uppercase tracking-wider font-extrabold text-muted">{titulo}</h2>
        {nota && <p className="text-[12px] text-faint mt-1 max-w-[62ch]">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

export function Panel() {
  const { user, isPlatformAdmin, signOut } = useAuth();
  const { memberships, current, select } = useTenant();
  const cid = current?.company.id;

  const [mods, setMods] = useState<ModuloEstado[]>([]);
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [flujos, setFlujos] = useState<Flujo[]>([]);
  const [feats, setFeats] = useState<FeatureTenant[]>([]);
  const [sub, setSub] = useState<Suscripcion | null>(null);
  const [lev, setLev] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cid) return;
    setCargando(true);
    Promise.all([
      platformService.modulos(cid), platformService.campos(cid),
      platformService.flujos(cid), platformService.features(cid),
      platformService.suscripcion(cid), platformService.levantamiento(cid)
    ]).then(([m, c, f, ft, s, l]) => {
      setMods(m); setCampos(c); setFlujos(f); setFeats(ft); setSub(s); setLev(l);
    }).catch(() => {}).finally(() => setCargando(false));
  }, [cid]);

  const disponibles = mods.filter(m => m.disponible).length;

  return (
    <div className="min-h-full">
      <header className="flex items-center gap-4 px-6 py-3 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20">
        <Marca />
        <span className="ml-auto text-[13px] text-muted hidden sm:block">{user?.email}</span>
        {isPlatformAdmin && (
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-accent/15 text-accent-deep">
            Super Admin
          </span>
        )}
        <button onClick={signOut}
          className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
      </header>

      <main className="p-6 max-w-5xl mx-auto grid gap-8">

        <Seccion titulo={`Tus empresas · ${memberships.length}`}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {memberships.map(m => {
              const activa = cid === m.company.id;
              return (
                <button key={m.company.id} onClick={() => select(m.company.id)}
                  className={`text-left p-4 rounded-2xl border transition ${
                    activa ? 'border-accent bg-accent/8' : 'border-line bg-surface hover:border-faint'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-[15px] font-extrabold tracking-tight">{m.company.name}</b>
                    {activa && <span className="text-[10px] uppercase tracking-wider font-extrabold text-accent-deep">activa</span>}
                  </div>
                  <p className="text-[12px] text-muted mt-0.5">
                    {m.role.name} · nivel {m.role.level} · {m.company.currency} · /{m.company.slug}
                  </p>
                </button>
              );
            })}
          </div>
        </Seccion>

        {cargando && <p className="text-[13px] text-muted">Cargando configuración…</p>}

        {!cargando && current && (
          <>
            {sub && (
              <Seccion titulo="Producto y plan">
                <div className="rounded-2xl border border-line bg-surface p-5 flex flex-wrap gap-x-10 gap-y-4">
                  <Dato l="Línea de producto" v={sub.linea ?? '—'} />
                  <Dato l="Plan" v={sub.plan} />
                  <Dato l="Estado" v={sub.estado} />
                  <Dato l="Mensual" v={clp(sub.precio)} />
                  <Dato l="Módulos disponibles" v={`${disponibles} de ${mods.length}`} />
                </div>
              </Seccion>
            )}

            <Seccion titulo="Módulos"
              nota="Un módulo se usa si la empresa lo encendió y además su plan lo incluye. Encenderlo no basta.">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mods.map(m => {
                  const nombre = MODULES[m.modulo as ModuleSlug]?.name ?? m.modulo;
                  return (
                    <div key={m.modulo}
                      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13px] ${
                        m.disponible ? 'border-line bg-surface' : 'border-line/60 text-faint'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        m.disponible ? 'bg-ok' : m.encendido ? 'bg-danger' : 'bg-faint/40'}`} />
                      <span className={m.disponible ? 'font-bold' : ''}>{nombre}</span>
                      {!m.disponible && m.encendido && (
                        <span className="ml-auto text-[10px] uppercase tracking-wider font-extrabold text-danger">
                          fuera del plan
                        </span>
                      )}
                      {!m.disponible && !m.encendido && (
                        <span className="ml-auto text-[10px] uppercase tracking-wider font-extrabold">off</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Seccion>

            {feats.length > 0 && (
              <Seccion titulo="Funcionalidades a medida"
                nota="Construidas para esta empresa. Ninguna otra las ve, ni siquiera en el catálogo.">
                <div className="grid gap-2">
                  {feats.map(f => (
                    <div key={f.slug} className="rounded-xl border border-line bg-surface p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <b className="text-[14px] font-bold">{f.name}</b>
                        <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-accent/15 text-accent-deep">
                          {f.stage}
                        </span>
                      </div>
                      {f.description && <p className="text-[12.5px] text-muted mt-1">{f.description}</p>}
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {flujos.map(f => (
              <Seccion key={f.id} titulo={`Flujo · ${f.entity}`}
                nota={`${f.name}. Definido por esta empresa; otra puede tener uno completamente distinto.`}>
                <div className="rounded-2xl border border-line bg-surface p-5 flex flex-wrap items-center gap-2">
                  {f.estados.filter(e => !e.is_cancel).map((e, i, arr) => (
                    <span key={e.key} className="flex items-center gap-2">
                      <span className="px-3 py-1.5 rounded-full text-[12.5px] font-bold border"
                        style={{ borderColor: e.color ?? 'var(--color-line)', color: e.color ?? 'inherit' }}>
                        {e.label}
                      </span>
                      {i < arr.length - 1 && <span className="text-faint">→</span>}
                    </span>
                  ))}
                  {f.estados.filter(e => e.is_cancel).map(e => (
                    <span key={e.key} className="ml-2 px-3 py-1.5 rounded-full text-[12.5px] font-bold border border-danger/30 text-danger">
                      {e.label}
                    </span>
                  ))}
                </div>
              </Seccion>
            ))}

            {campos.length > 0 && (
              <Seccion titulo={`Campos propios · producto`}
                nota="Nacidos del levantamiento del cliente. No existen columnas nuevas en la base: viven en JSONB con índice.">
                <div className="rounded-2xl border border-line bg-surface overflow-hidden">
                  {campos.map((c, i) => (
                    <div key={c.key}
                      className={`px-5 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 ${i > 0 ? 'border-t border-line' : ''}`}>
                      <b className="text-[13.5px] font-bold">{c.label}</b>
                      <span className="text-[11px] uppercase tracking-wider font-extrabold text-accent-deep">{c.field_type}</span>
                      {c.required && <span className="text-[11px] uppercase tracking-wider font-extrabold text-danger">obligatorio</span>}
                      {c.help && <span className="text-[12px] text-muted basis-full">{c.help}</span>}
                      {c.options?.length > 0 && (
                        <span className="text-[12px] text-faint basis-full">{c.options.join(' · ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {lev && (
              <Seccion titulo="Levantamiento">
                <div className="rounded-2xl border border-line bg-surface p-5 flex flex-wrap gap-x-10 gap-y-4">
                  <Dato l="Cuestionario" v={lev.template?.name ?? '—'} />
                  <Dato l="Negocio" v={lev.business_name ?? lev.client_name} />
                  <Dato l="Enviado" v={lev.submitted_at ? new Date(lev.submitted_at).toLocaleDateString('es-CL') : 'pendiente'} />
                  <Dato l="Aplicado a la configuración"
                        v={lev.applied_at ? new Date(lev.applied_at).toLocaleDateString('es-CL') : 'no'} />
                </div>
              </Seccion>
            )}
          </>
        )}

        <p className="text-[11px] text-faint leading-relaxed border-t border-line pt-5">
          Nada de esta pantalla lo filtra el navegador. La base solo devuelve lo que corresponde
          a las empresas de las que eres miembro; otro usuario, con esta misma pantalla, vería lo suyo.
        </p>
      </main>
    </div>
  );
}

const Dato = ({ l, v }: { l: string; v: string }) => (
  <span className="grid gap-0.5">
    <span className="text-[10px] uppercase tracking-wider font-extrabold text-muted">{l}</span>
    <b className="text-[15px] font-extrabold tracking-tight">{v}</b>
  </span>
);
