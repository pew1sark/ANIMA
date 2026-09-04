import { Cuotas } from '@/components/company/Cuotas';
import { MODULES } from '@/core/modules/registry';
import { dinero } from '@/lib/formato';
import { env } from '@/config/env';
import type { Espacio } from '@/core/tenant/Espacio';
import type { ModuleSlug } from '@/types/core';

/* Mi plan — el perfil de la empresa y hasta dónde llega lo contratado.
   ---------------------------------------------------------------------------
   Antes, para saber qué plan tenía una empresa había que preguntarle a quien
   la vendió. Aquí está: qué se contrató, qué enciende, cuánto queda de cada
   cuota y qué falta por encender. Nada de esto se calcula en el navegador —
   viene de `mi_espacio()` y de `cuotas()`. */
export function MiPlan({ esp }: { esp: Espacio }) {
  const encendidos  = esp.modulos.filter(m => m.disponible && m.slug !== 'core');
  const fuera       = esp.modulos.filter(m => !m.disponible && m.slug !== 'core');
  const propias     = esp.features ?? [];

  return (
    <div className="grid gap-4">
      {/* ---------------------------------------------- el plan ------------- */}
      <section className="tarjeta p-6 aparece">
        <div className="rotulo rotulo-tenue">Tu plan</div>
        <div className="flex items-end gap-3 flex-wrap mt-2">
          <h1 className="cifra-heroe">{esp.plan?.nombre ?? 'Sin plan'}</h1>
          {esp.plan && esp.plan.precio > 0 && (
            <span className="mb-1.5" style={{ fontSize: 'var(--texto-lg)', color: 'var(--color-muted)' }}>
              {dinero(esp.plan.precio, esp.empresa.moneda)} <span style={{ fontSize: 'var(--texto-md)' }}>al mes</span>
            </span>
          )}
          {esp.plan?.estado && (
            <span className={`marca mb-2 ${esp.plan.estado === 'activa' ? 'marca-ok'
                              : esp.plan.estado === 'morosa' ? 'marca-malo' : 'marca-aviso'}`}>
              {esp.plan.estado}
            </span>
          )}
        </div>
        <p className="subtitulo mt-2">
          Contratado por <b style={{ color: 'var(--color-ink)' }}>{esp.empresa.nombre}</b>. Subir de plan levanta los
          topes y enciende lo que falte, con la información intacta y sin traspasos.
        </p>
        <div className="flex gap-2 mt-5 flex-wrap">
          <a href={env.sitio + 'planes.html'} target="_blank" rel="noreferrer" className="b b-pri">
            Ver planes y mejorar
          </a>
          <a href={'mailto:tscanima@gmail.com?subject=' +
                   encodeURIComponent(`ANIMA — plan de ${esp.empresa.nombre}`)} className="b b-sec">
            Escribir a ANIMA
          </a>
        </div>
      </section>

      {/* ---------------------------------------------- las cuotas ---------- */}
      <Cuotas companyId={esp.empresa.id} />

      {/* ---------------------------------------------- la empresa ---------- */}
      <section className="tarjeta p-5 aparece aparece-1">
        <h2 className="rotulo">La empresa</h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-3">
          <Dato l="Nombre" v={esp.empresa.nombre} />
          <Dato l="Identificador" v={esp.empresa.slug} />
          <Dato l="Plataforma" v={esp.empresa.linea ?? '—'} />
          <Dato l="Moneda" v={esp.empresa.moneda} />
          <Dato l="País" v={esp.empresa.pais || '—'} />
          <Dato l="Estado" v={esp.empresa.estado} />
          <Dato l="Tu rol" v={esp.mi_rol?.nombre ?? '—'} />
          <Dato l="Tipo" v={esp.empresa.tipo === 'advisor' ? 'Administra clientes' : 'Administra lo suyo'} />
        </div>
      </section>

      {/* ---------------------------------------------- los módulos --------- */}
      <section className="tarjeta p-5 aparece aparece-2">
        <h2 className="rotulo">Qué enciende</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          {encendidos.map(m => (
            <span key={m.slug} className="marca marca-ok">
              {MODULES[m.slug as ModuleSlug]?.name ?? m.slug}
            </span>
          ))}
        </div>
        {fuera.length > 0 && (
          <>
            <p className="mt-5 mb-2" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
              Fuera de tu plan por ahora. No están apagados en la base: están esperando.
            </p>
            <div className="flex flex-wrap gap-2">
              {fuera.map(m => (
                <span key={m.slug} className="marca">
                  {MODULES[m.slug as ModuleSlug]?.name ?? m.slug}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------- lo hecho a medida ------------ */}
      {propias.length > 0 && (
        <section className="tarjeta p-5 aparece aparece-3">
          <h2 className="rotulo">Hecho para ustedes</h2>
          <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
            Lo que se construyó a pedido de esta empresa y quedó mantenido con el resto.
          </p>
          <div className="grid gap-2">
            {propias.map(f => (
              <div key={f.slug} className="rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-sunk)' }}>
                <span className="flex items-center gap-2 flex-wrap">
                  <b style={{ fontSize: 'var(--texto-md)' }}>{f.nombre}</b>
                  <span className="marca marca-acento">{f.etapa}</span>
                </span>
                {f.descripcion && (
                  <span className="block mt-0.5" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {f.descripcion}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const Dato = ({ l, v }: { l: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
    <span style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>{l}</span>
    <b style={{ fontSize: 'var(--texto-md)' }} className="text-right truncate">{v}</b>
  </div>
);
