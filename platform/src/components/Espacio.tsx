import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { useTenant } from '@/core/tenant/TenantContext';
import { MODULES, MOSTRAR_TODOS_LOS_MODULOS, ZONAS } from '@/core/modules/registry';
import { cargarEspacio, type Espacio as EspacioData } from '@/core/tenant/Espacio';
import { Marca, MarcaCliente, PieAnima } from '@/components/Marca';
import { MarcaDeLaEmpresa } from '@/components/company/MarcaEmpresa';
import { CamposPropios } from '@/components/company/CamposPropios';
import { PuestaEnMarcha } from '@/components/company/PuestaEnMarcha';
import { Equipo } from '@/components/company/Equipo';
import { Informes } from '@/components/company/Informes';
import { Inicio } from '@/components/company/Inicio';
import { ResumenModulo } from '@/components/company/ResumenModulo';
import { Novedades } from '@/components/company/Novedades';
import { pestanasDe } from '@/core/modules/pestanas';
import { Vista } from '@/components/datos/Vista';
import type { ModuleSlug } from '@/types/core';

/* El espacio de trabajo del cliente. La navegación NO está escrita a mano:
   sale de los módulos que su plan le permite. Dos empresas distintas ven
   menús distintos con el mismo código. */
export function Espacio({ volver }: { volver?: () => void }) {
  const { user, isPlatformAdmin, signOut } = useAuth();
  const { memberships, current, select } = useTenant();
  const cid = current?.company.id;
  const marca = current?.company.branding ?? null;

  const [esp, setEsp] = useState<EspacioData | null>(null);
  const [vista, setVista] = useState<string>('inicio');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cid) return;
    setCargando(true); setVista('inicio');
    cargarEspacio(cid)
      .then(setEsp)
      .catch(() => {}).finally(() => setCargando(false));
  }, [cid]);

  /* Con el interruptor puesto se listan todos; si no, solo los del plan. */
  const disponibles = (esp?.modulos ?? []).filter(m =>
    m.slug !== 'core' && (MOSTRAR_TODOS_LOS_MODULOS || m.disponible));
  const bloqueados  = (esp?.modulos ?? []).filter(m => m.encendido && !m.disponible);
  const esAdmin = (esp?.mi_rol?.nivel ?? 0) >= 80;

  /* El menú por zonas. Un grupo sin módulos no se dibuja: encabezar una lista
     vacía es peor que no encabezar nada. */
  const zonas = useMemo(() => ZONAS.map(z => ({
    ...z,
    modulos: disponibles.filter(m => MODULES[m.slug as ModuleSlug]?.zona === z.id)
  })).filter(z => z.modulos.length > 0), [esp]);

  /* Cómo se llama lo que se está mirando. La cabecera lo dice, para que al
     volver de otra pestaña del navegador no haya que deducirlo del contenido. */
  const titulo = vista === 'inicio' ? 'Inicio'
               : vista === 'informes' ? 'Informes'
               : vista === 'config' ? 'Configuración'
               : MODULES[vista as ModuleSlug]?.name ?? vista;

  return (
    <div className="min-h-full grid grid-cols-1 md:grid-cols-[248px_1fr]">
      {/* ---------- lateral ---------- */}
      <aside className="border-b md:border-b-0 md:border-r border-line bg-surface/70 backdrop-blur
                        md:sticky md:top-0 md:h-screen p-4 flex md:flex-col gap-4 overflow-x-auto">
        {/* Arriba manda la marca de quien trabaja aquí. ANIMA firma al pie. */}
        {esp && (
          <div className="hidden md:block px-1 pt-1">
            <MarcaCliente nombre={esp.empresa.nombre} logo={marca?.logo_url}
                          sub={esp.plan?.nombre ?? 'sin plan'} />
          </div>
        )}
        <div className="md:hidden"><Marca sub={esp?.empresa.linea?.replace('ANIMA ','') ?? 'TSC'} /></div>

        {/* En pantalla ancha la navegación va agrupada; en móvil se convierte
            en una sola tira que se desliza, donde los encabezados de grupo
            solo estorbarían. */}
        <nav className="flex md:flex-col gap-1 md:gap-4 flex-1">
          <div className="flex md:flex-col gap-1">
            <Item activo={vista==='inicio'} onClick={() => setVista('inicio')} label="Inicio" />
            <Item activo={vista==='informes'} onClick={() => setVista('informes')} label="Informes" />
          </div>

          {zonas.map(z => (
            <div key={z.id} className="flex md:flex-col gap-1">
              <div className="grupo-nav hidden md:block">{z.nombre}</div>
              {z.modulos.map(m => (
                <Item key={m.slug} activo={vista===m.slug} onClick={() => setVista(m.slug)}
                      label={MODULES[m.slug as ModuleSlug]?.name ?? m.slug}
                      fueraDelPlan={!m.disponible} />
              ))}
            </div>
          ))}

          {esAdmin && (
            <div className="flex md:flex-col gap-1">
              <Item activo={vista==='config'} onClick={() => setVista('config')} label="Configuración" />
            </div>
          )}
        </nav>

        <div className="hidden md:grid gap-1.5">
          {memberships.length > 1 && (
            <button onClick={() => select('')} className="text-[12px] text-muted hover:text-ink transition text-left px-3">
              Cambiar de organización
            </button>
          )}
          {volver && (
            <button onClick={volver} className="text-[12px] text-muted hover:text-ink transition text-left px-3">
              Cambiar de puerta
            </button>
          )}
          <PieAnima className="px-3 pt-3 mt-1 border-t border-line" />
        </div>
      </aside>

      {/* ---------- contenido ---------- */}
      <div className="min-w-0">
        <header className="flex items-center gap-3 px-6 py-3 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20">
          <span className="md:hidden"><Marca /></span>
          <span className="hidden md:flex items-baseline gap-2 min-w-0">
            <b className="text-[13.5px] font-bold truncate">{titulo}</b>
            <span className="text-[12.5px] text-faint truncate">
              {esp?.empresa.nombre} · {esp?.empresa.linea}
            </span>
          </span>
          <span className="ml-auto text-[13px] text-muted hidden lg:block truncate max-w-[220px]">{user?.email}</span>
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

        {/* El ancho: las tablas y los gráficos del panel no caben en 4xl, y
            forzarlos ahí obliga a desplazar en horizontal lo que se lee en
            vertical. El límite existe igual —una tabla a 2000px tampoco se
            lee— pero está donde entra una fila de datos entera. */}
        <main className="p-6 max-w-[1180px] grid gap-8">
          {cargando && <p className="text-[13px] text-muted">Cargando tu espacio…</p>}

          {!cargando && esp && cid && vista === 'inicio' && (
            <>
              <Inicio companyId={cid} moneda={esp.empresa.moneda}
                      empresa={esp.empresa.nombre} linea={esp.empresa.linea} />

              {esp.features.length > 0 && (
                <section className="grid gap-3">
                  <h2 className="rotulo">Hecho para ustedes</h2>
                  <div className="grid gap-2">
                    {esp.features.map(f => (
                      <div key={f.slug} className="rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <b className="text-[14px] font-bold">{f.nombre}</b>
                          <span className="marca marca-acento">{f.etapa}</span>
                        </div>
                        {f.descripcion && <p className="text-[12.5px] text-muted mt-1">{f.descripcion}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Todos los módulos los dibuja el motor de datos a partir de los
              esquemas declarados sobre las tablas de Bilagay. */}
          {!cargando && esp && cid && vista === 'informes' && <Informes companyId={cid} />}

          {!cargando && esp && cid && vista !== 'inicio' && vista !== 'config' && vista !== 'informes' && (
            <Modulo slug={vista as ModuleSlug} companyId={cid}
                    nivel={esp.mi_rol?.nivel ?? 0} moneda={esp.empresa.moneda} />
          )}

          {!cargando && esp && cid && vista === 'config' && (
            <Configuracion esp={esp} bloqueados={bloqueados}
                           companyId={cid} puedeEditarMarca={esAdmin} />
          )}
        </main>
      </div>
    </div>
  );
}

/* Exportado para poder mirarlo aislado: es la pieza con más ramas de la app
   —pestañas, resumen, entidades— y montarla sola ahorra tener que entrar con
   sesión para ver si una pestaña dibuja.

   Un módulo del plan, con sus sub-pestañas. La primera casi siempre es el
   resumen —la respuesta— y detrás vienen las entidades, que son donde se
   carga. Qué pestañas tiene lo declara `pestanasDe()`; aquí solo se dibujan.

   Un módulo sin nada declarado dice con honestidad qué falta. */
export function Modulo({ slug, companyId, nivel, moneda }:
  { slug: ModuleSlug; companyId: string; nivel: number; moneda: string }) {
  const pestanas = useMemo(() => pestanasDe(slug), [slug]);
  const [cual, setCual] = useState(0);

  useEffect(() => { setCual(0); }, [slug]);

  if (pestanas.length === 0) return <PorConstruir slug={slug} />;
  const activa = pestanas[Math.min(cual, pestanas.length - 1)]!;
  const def = MODULES[slug];

  return (
    <div className="grid gap-4">
      <div className="aparece">
        <div className="rotulo">{def?.name ?? slug}</div>
        {def?.cubre && <p className="subtitulo mt-1.5">{def.cubre}</p>}
      </div>

      {pestanas.length > 1 && (
        <div role="tablist" className="flex gap-1 flex-wrap"
             style={{ borderBottom: '1px solid var(--color-line)', paddingBottom: 12 }}>
          {pestanas.map((p, i) => (
            <button key={p.id} onClick={() => setCual(i)} role="tab"
                    aria-selected={i === cual} className="pest">
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      {activa.tipo === 'resumen' && (
        <ResumenModulo companyId={companyId} modulo={slug} moneda={moneda}
                       titulo={def?.name ?? slug} />
      )}

      {activa.tipo === 'novedades' && <Novedades />}

      {/* Cada entidad pide su nivel: pagos y compras exigen 60, el resto 40.
          Es el mismo umbral que aplica RLS, dicho también en pantalla. */}
      {activa.tipo === 'datos' && (
        <Vista key={activa.esquema.tabla} esquema={activa.esquema} companyId={companyId}
               puedeEditar={nivel >= (activa.esquema.nivelEscritura ?? 40)} />
      )}
    </div>
  );
}

/* Un módulo encendido cuya pantalla todavía no existe. Decir solo "falta
   construir esta pantalla" no ayuda a nadie: aquí se dice qué cubre y sobre
   qué tablas se va a construir, que ya están en la base y aisladas. */
function PorConstruir({ slug }: { slug: ModuleSlug }) {
  const def = MODULES[slug];
  return (
    <div className="grid gap-3">
      <div className="rotulo">{def?.name ?? slug}</div>
      <div className="tarjeta p-8 mt-1.5">
        <p className="titular" style={{ fontSize: 22 }}>Pantalla en construcción</p>
        {def?.cubre && <p className="text-[13px] text-muted mt-1.5 max-w-[58ch]">{def.cubre}</p>}
        {def?.tablas && def.tablas.length > 0 && (
          <>
            <p className="rotulo mt-5 mb-2">Ya está en la base, aislado por empresa</p>
            <div className="flex flex-wrap gap-1.5">
              {def.tablas.map(tb => (
                <code key={tb} className="text-[11.5px] px-2 py-1 rounded-lg bg-sunk border border-line text-muted">
                  {tb}
                </code>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* La configuración en pestañas. Antes era una columna larga donde la puesta en
   marcha, el equipo y los módulos competían por la misma atención. Cada cosa
   en su pestaña se encuentra; apiladas, no. */
type Solapa = 'empresa' | 'equipo' | 'marca' | 'campos' | 'modulos';

function Configuracion({ esp, bloqueados, companyId, puedeEditarMarca }:
  { esp: EspacioData; bloqueados: EspacioData['modulos'];
    companyId: string; puedeEditarMarca: boolean }) {
  const nivel = esp.mi_rol?.nivel ?? 0;
  const [solapa, setSolapa] = useState<Solapa>('empresa');

  const solapas: { id: Solapa; nombre: string; visible: boolean }[] = [
    { id: 'empresa', nombre: 'Empresa',        visible: true },
    { id: 'equipo',  nombre: 'Equipo',         visible: nivel >= 60 },
    { id: 'marca',   nombre: 'Marca',          visible: puedeEditarMarca },
    { id: 'campos',  nombre: 'Campos propios', visible: puedeEditarMarca },
    { id: 'modulos', nombre: 'Módulos',        visible: true }
  ];
  const abiertas = solapas.filter(s => s.visible);

  return (
    <>
      <div className="aparece">
        <div className="rotulo">Configuración</div>
        <h1 className="titular mt-1.5">{esp.empresa.nombre}</h1>
        <p className="text-[13px] text-muted mt-1.5 max-w-[62ch]">
          {esp.empresa.linea} · plan {esp.plan?.nombre ?? '—'} · entras como {esp.mi_rol?.nombre ?? '—'}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 flex-wrap border-b border-line pb-3">
        {abiertas.map(s => (
          <button key={s.id} role="tab" aria-selected={solapa === s.id}
                  onClick={() => setSolapa(s.id)} className="pest">
            {s.nombre}
          </button>
        ))}
      </div>

      {solapa === 'empresa' && (
        <PuestaEnMarcha companyId={companyId} puedeEditar={puedeEditarMarca} />
      )}
      {solapa === 'equipo'  && nivel >= 60 && <Equipo companyId={companyId} miNivel={nivel} />}
      {solapa === 'marca'   && puedeEditarMarca &&
        <MarcaDeLaEmpresa companyId={companyId} nombre={esp.empresa.nombre} />}
      {solapa === 'campos'  && puedeEditarMarca && <CamposPropios companyId={companyId} />}
      {solapa === 'modulos' && <Modulos esp={esp} bloqueados={bloqueados} />}
    </>
  );
}

function Modulos({ esp, bloqueados }:
  { esp: EspacioData; bloqueados: EspacioData['modulos'] }) {
  return (
    <section className="grid gap-3 aparece">
      <div>
        <div className="rotulo">Módulos</div>
        <p className="text-[13px] text-muted mt-1.5 max-w-[62ch]">
          Un módulo se usa si lo tienes encendido <em>y</em> tu plan lo incluye.
          En el menú aparecen los que cumplen las dos cosas; aquí está la lista
          completa, para que se vea qué abre cada plan.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {esp.modulos.map(m => (
          <div key={m.slug}
            className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-[13px] ${
              m.disponible ? 'border-line bg-surface' : 'border-line/60 text-faint bg-sunk/30'}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              m.disponible ? 'bg-ok' : m.encendido ? 'bg-danger' : 'bg-faint/40'}`} />
            <span className={m.disponible ? 'font-bold' : ''}>
              {MODULES[m.slug as ModuleSlug]?.name ?? m.slug}
            </span>
            {!m.disponible && (
              <span className="ml-auto rotulo" style={{ fontSize: 9 }}>
                {m.encendido ? 'fuera del plan' : 'apagado'}
              </span>
            )}
          </div>
        ))}
      </div>
      {bloqueados.length > 0 && (
        <p className="text-[12.5px] text-muted">
          {bloqueados.length} módulo(s) encendido(s) que tu plan no incluye. Subiendo de plan se activan solos.
        </p>
      )}
    </section>
  );
}

const Item = ({ activo, onClick, label, fueraDelPlan }:
  { activo: boolean; onClick: () => void; label: string; fueraDelPlan?: boolean }) => (
  <button onClick={onClick} className="nav-item" aria-current={activo ? 'page' : undefined}>
    {label}
    {/* Un punto, no una etiqueta: se ve que está fuera del plan sin gritarlo. */}
    {fueraDelPlan && (
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-auto ${activo ? 'bg-bg/50' : 'bg-accent/60'}`}
            title="Fuera de tu plan · visible mientras se construye" />
    )}
  </button>
);
