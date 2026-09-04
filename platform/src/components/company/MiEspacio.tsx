import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { perfilService, type Aviso, type Perfil } from '@/services/perfil.service';
import { Cuotas } from '@/components/company/Cuotas';
import { MODULES } from '@/core/modules/registry';
import { dinero, cuando } from '@/lib/formato';
import type { Espacio } from '@/core/tenant/Espacio';
import type { ModuleSlug } from '@/types/core';

/* Mi espacio — la portada de la persona, no la del negocio.
   ---------------------------------------------------------------------------
   COMPANY ya tenía Inicio, pero Inicio es del negocio: ventas del mes, señales,
   cobranza. Ninguna de esas cifras es tuya. Faltaba el otro lado, el que STUDIO
   siempre tuvo — dónde estoy parado, con qué rol, qué plan tengo, qué me falta
   por leer y por dónde entro a trabajar.

   El orden es el de las preguntas que uno se hace al entrar:
     1. ¿Dónde estoy y como quién?
     2. ¿Hay algo esperándome?
     3. ¿Hasta dónde llega mi plan?
     4. ¿Por dónde entro? */
export function MiEspacio({ esp, irA, irAMiPlan }: {
  esp: Espacio;
  irA: (vista: string) => void;
  irAMiPlan: () => void;
}) {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => { perfilService.mio().then(setPerfil).catch(() => {}); }, []);
  useEffect(() => {
    perfilService.avisos(esp.empresa.id).then(setAvisos).catch(() => {});
  }, [esp.empresa.id]);

  const nombre = perfil?.full_name?.trim() || user?.email?.split('@')[0] || '';
  const hora = new Date().getHours();
  const saludo = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buenos días'
               : hora < 20 ? 'Buenas tardes' : 'Buenas noches';

  const modulos = esp.modulos.filter(m => m.disponible && m.slug !== 'core');

  return (
    <div className="grid gap-4">
      {/* ---------------------------------------- quién soy y dónde ---------- */}
      <section className="tarjeta p-6 aparece">
        <div className="rotulo rotulo-tenue">{esp.empresa.linea ?? 'ANIMA COMPANY'}</div>
        <h1 className="titular mt-2">{saludo}{nombre ? `, ${nombre}` : ''}.</h1>
        <p className="subtitulo mt-2">
          Estás en <b style={{ color: 'var(--color-ink)' }}>{esp.empresa.nombre}</b>
          {esp.mi_rol && <> como <b style={{ color: 'var(--color-ink)' }}>{esp.mi_rol.nombre}</b></>}.
          {esp.plan && <> Plan {esp.plan.nombre}
            {esp.plan.precio > 0 && <> · {dinero(esp.plan.precio, esp.empresa.moneda)} al mes</>}.</>}
        </p>
        <div className="flex gap-2 mt-5 flex-wrap">
          <button onClick={irAMiPlan} className="b b-pri">Mi plan y mi empresa</button>
          <button onClick={() => irA('inicio')} className="b b-sec">Ver el panel del negocio</button>
        </div>
      </section>

      {/* ---------------------------------------- lo que me espera ----------- */}
      {avisos.length > 0 && (
        <section className="tarjeta p-5 aparece aparece-1">
          <div className="flex items-baseline gap-3">
            <h2 className="rotulo">Sin leer</h2>
            <span className="marca">{avisos.length}</span>
          </div>
          <div className="grid gap-2 mt-3">
            {avisos.map(a => (
              <div key={a.id} className="rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-sunk)' }}>
                <b className="block" style={{ fontSize: 'var(--texto-md)' }}>{a.title}</b>
                {a.body && <span className="block mt-0.5" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{a.body}</span>}
                <span className="block mt-1" style={{ fontSize: 11, color: 'var(--color-faint)' }}>{cuando(a.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------- hasta dónde llego --------- */}
      <Cuotas companyId={esp.empresa.id} />

      {/* ---------------------------------------- por dónde entro ----------- */}
      <section className="tarjeta p-5 aparece aparece-2">
        <h2 className="rotulo">Tu trabajo</h2>
        <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
          Lo que tu plan y tu rol te abren en esta organización.
        </p>
        <div className="flex flex-wrap gap-2">
          {modulos.map(m => (
            <button key={m.slug} onClick={() => irA(m.slug)} className="b b-sec b-sm">
              {MODULES[m.slug as ModuleSlug]?.name ?? m.slug}
            </button>
          ))}
          {modulos.length === 0 && (
            <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
              Todavía no hay módulos encendidos para ti.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
