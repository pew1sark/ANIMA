import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { useTenant } from '@/core/tenant/TenantContext';
import { MODULES } from '@/core/modules/registry';
import { cargarEspacio, cargarKpis, type Espacio as EspacioData } from '@/core/tenant/Espacio';
import { Marca, MarcaCliente, PieAnima } from '@/components/Marca';
import { MarcaDeLaEmpresa } from '@/components/company/MarcaEmpresa';
import { Clientes } from '@/components/company/Clientes';
import type { ModuleSlug } from '@/types/core';

const money = (n = 0, m = 'CLP') =>
  m === 'CLP' ? '$' + Math.round(n).toLocaleString('es-CL') : n.toLocaleString('es-CL');
const num = (n = 0) => Math.round(n).toLocaleString('es-CL');

/* El espacio de trabajo del cliente. La navegación NO está escrita a mano:
   sale de los módulos que su plan le permite. Dos empresas distintas ven
   menús distintos con el mismo código. */
export function Espacio({ volver }: { volver?: () => void }) {
  const { user, isPlatformAdmin, signOut } = useAuth();
  const { memberships, current, select } = useTenant();
  const cid = current?.company.id;
  const marca = current?.company.branding ?? null;

  const [esp, setEsp] = useState<EspacioData | null>(null);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [vista, setVista] = useState<string>('inicio');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cid) return;
    setCargando(true); setVista('inicio');
    Promise.all([cargarEspacio(cid), cargarKpis(cid)])
      .then(([e, k]) => { setEsp(e); setKpis(k); })
      .catch(() => {}).finally(() => setCargando(false));
  }, [cid]);

  const disponibles = (esp?.modulos ?? []).filter(m => m.disponible && m.slug !== 'core');
  const bloqueados  = (esp?.modulos ?? []).filter(m => m.encendido && !m.disponible);
  const esAdmin = (esp?.mi_rol?.nivel ?? 0) >= 80;

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

        <nav className="flex md:flex-col gap-1 flex-1">
          <Item activo={vista==='inicio'} onClick={() => setVista('inicio')} label="Inicio" />
          {disponibles.map(m => (
            <Item key={m.slug} activo={vista===m.slug} onClick={() => setVista(m.slug)}
                  label={MODULES[m.slug as ModuleSlug]?.name ?? m.slug} />
          ))}
          {esAdmin && <Item activo={vista==='config'} onClick={() => setVista('config')} label="Configuración" />}
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
          <span className="hidden md:block text-[13px] text-muted">
            {esp?.empresa.nombre} <span className="text-faint">·</span> {esp?.empresa.linea}
          </span>
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

        <main className="p-6 max-w-4xl grid gap-8">
          {cargando && <p className="text-[13px] text-muted">Cargando tu espacio…</p>}

          {!cargando && esp && vista === 'inicio' && (
            <>
              <div className="aparece">
                <h1 className="text-[30px] font-extrabold tracking-tight">{esp.empresa.nombre}</h1>
                <p className="text-[13px] text-muted mt-1">
                  {esp.empresa.linea} · plan {esp.plan?.nombre ?? '—'} ·
                  entras como {esp.mi_rol?.nombre ?? '—'}
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 aparece aparece-1">
                <Kpi l="Ventas del mes" v={money(kpis.ventas_mes, esp.empresa.moneda)} />
                <Kpi l="Por cobrar" v={money(kpis.cuentas_por_cobrar, esp.empresa.moneda)}
                     alerta={(kpis.cuentas_vencidas ?? 0) > 0 ? money(kpis.cuentas_vencidas, esp.empresa.moneda) + ' vencido' : undefined} />
                <Kpi l="Pedidos abiertos" v={num(kpis.pedidos_pendientes)} />
                <Kpi l="Stock" v={num(kpis.stock_total) + ' kg'}
                     nota={kpis.stock_valor ? money(kpis.stock_valor, esp.empresa.moneda) : undefined} />
                <Kpi l="Productos" v={num(kpis.productos_total)}
                     alerta={(kpis.productos_stock_bajo ?? 0) > 0 ? num(kpis.productos_stock_bajo) + ' bajo mínimo' : undefined} />
                <Kpi l="Clientes" v={num(kpis.clientes_activos)} />
                <Kpi l="Proveedores" v={num(kpis.proveedores)} />
                <Kpi l="Compras registradas" v={money(kpis.compras_historico, esp.empresa.moneda)} nota="histórico" />
              </div>

              {esp.features.length > 0 && (
                <section className="grid gap-3">
                  <h2 className="text-[10px] uppercase tracking-wider font-extrabold text-muted">
                    Hecho para ustedes
                  </h2>
                  <div className="grid gap-2">
                    {esp.features.map(f => (
                      <div key={f.slug} className="rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <b className="text-[14px] font-bold">{f.nombre}</b>
                          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5
                                           rounded-full bg-accent/15 text-accent-deep">{f.etapa}</span>
                        </div>
                        {f.descripcion && <p className="text-[12.5px] text-muted mt-1">{f.descripcion}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Clientes es el primer módulo de COMPANY construido de verdad sobre la
              arquitectura de Bilagay. Los demás siguen el mismo camino. */}
          {!cargando && esp && cid && vista === 'crm' && (
            <Clientes companyId={cid} puedeEditar={(esp.mi_rol?.nivel ?? 0) >= 40} />
          )}

          {!cargando && esp && vista !== 'inicio' && vista !== 'config' && vista !== 'crm' && (
            <PorConstruir slug={vista as ModuleSlug} />
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

/* Un módulo encendido cuya pantalla todavía no existe. Decir solo "falta
   construir esta pantalla" no ayuda a nadie: aquí se dice qué cubre y sobre
   qué tablas se va a construir, que ya están en la base y aisladas. */
function PorConstruir({ slug }: { slug: ModuleSlug }) {
  const def = MODULES[slug];
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-extrabold tracking-tight">{def?.name ?? slug}</h1>
      <div className="rounded-2xl border border-line bg-surface p-8">
        <p className="text-[14px] font-bold">Incluido en tu plan · pantalla en construcción</p>
        {def?.cubre && <p className="text-[13px] text-muted mt-1.5 max-w-[58ch]">{def.cubre}</p>}
        {def?.tablas && def.tablas.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted mt-5 mb-2">
              Ya está en la base, aislado por empresa
            </p>
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

function Configuracion({ esp, bloqueados, companyId, puedeEditarMarca }:
  { esp: EspacioData; bloqueados: EspacioData['modulos'];
    companyId: string; puedeEditarMarca: boolean }) {
  return (
    <>
      <div className="aparece">
        <h1 className="text-2xl font-extrabold tracking-tight">Configuración</h1>
        <p className="text-[13px] text-muted mt-1 max-w-[62ch]">
          Cómo quedó armada tu plataforma. Un módulo se usa si lo tienes encendido
          <em> y</em> tu plan lo incluye.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {esp.modulos.map(m => (
          <div key={m.slug}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13px] ${
              m.disponible ? 'border-line bg-surface' : 'border-line/60 text-faint'}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              m.disponible ? 'bg-ok' : m.encendido ? 'bg-danger' : 'bg-faint/40'}`} />
            <span className={m.disponible ? 'font-bold' : ''}>
              {MODULES[m.slug as ModuleSlug]?.name ?? m.slug}
            </span>
            {!m.disponible && m.encendido &&
              <span className="ml-auto text-[10px] uppercase tracking-wider font-extrabold text-danger">fuera del plan</span>}
            {!m.disponible && !m.encendido &&
              <span className="ml-auto text-[10px] uppercase tracking-wider font-extrabold">off</span>}
          </div>
        ))}
      </div>
      {bloqueados.length > 0 && (
        <p className="text-[12.5px] text-muted">
          {bloqueados.length} módulo(s) encendido(s) que tu plan no incluye. Subiendo de plan se activan solos.
        </p>
      )}

      {puedeEditarMarca && <MarcaDeLaEmpresa companyId={companyId} nombre={esp.empresa.nombre} />}
    </>
  );
}

const Item = ({ activo, onClick, label }:
  { activo: boolean; onClick: () => void; label: string }) => (
  <button onClick={onClick}
    className={`text-left px-3 py-2 rounded-xl text-[13.5px] transition whitespace-nowrap ${
      activo ? 'bg-ink text-bg font-bold' : 'text-ink-2 hover:bg-accent/10'}`}>
    {label}
  </button>
);

const Kpi = ({ l, v, nota, alerta }:
  { l: string; v: string; nota?: string; alerta?: string }) => (
  <div className="rounded-2xl border border-line bg-surface p-4">
    <div className="text-[10px] uppercase tracking-wider font-extrabold text-muted">{l}</div>
    <div className="text-[21px] font-extrabold tracking-tight tabular-nums mt-0.5">{v}</div>
    {alerta && <div className="text-[11.5px] font-bold text-danger mt-0.5">{alerta}</div>}
    {nota && !alerta && <div className="text-[11.5px] text-faint mt-0.5">{nota}</div>}
  </div>
);
