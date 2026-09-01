import { useEffect } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca } from '@/components/Marca';
import { env } from '@/config/env';

/* El primer lugar después de entrar. ANIMA es una sola cuenta y dos mundos:
   en STUDIO se crea, en COMPANY se administra. Cuál se abre lo decidió el plan;
   aquí solo se elige.

   STUDIO no es una vista de esta app: es el ANIMA de siempre, en home.html.
   La sesión es la misma —mismo origen, mismo proyecto de Supabase—, así que
   se cruza sin volver a entrar.

   La consola va aparte, debajo de la línea: no es un tercer producto ni un
   lugar donde se trabaje. Es el panel desde donde se mira el negocio del
   software. */
export function Puertas({ studio, company, consola }:
  { studio?: () => void; company?: () => void; consola?: () => void }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <Marca />
          <button onClick={signOut} className="text-[13px] text-muted hover:text-ink transition">
            Salir
          </button>
        </div>

        <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">¿Dónde entras hoy?</h1>
        <p className="text-[13px] text-muted mt-1.5 mb-7">{user?.email}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {studio && <Puerta
            onClick={studio}
            titulo="ANIMA STUDIO"
            lema="Donde creas."
            texto="Para quien trabaja con su obra: tu Alma, el Taller, el Clan y el Mundo."
            glifo={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20 L12 5 L20 20" />
              </svg>
            }
          />}
          {company && <Puerta
            onClick={company}
            titulo="ANIMA COMPANY"
            lema="Donde se opera."
            texto="Para empresas formales: clientes, pedidos, inventario, compras, reparto y cobranza."
            glifo={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" />
              </svg>
            }
          />}
        </div>

        {consola && (
          <>
            <div className="h-px bg-line mt-8 mb-4" />
            <button onClick={consola}
              className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl
                         border border-line bg-sunk hover:border-accent transition group">
              <span className="w-9 h-9 rounded-xl grid place-items-center bg-ink text-bg shrink-0">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                     strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h11" />
                </svg>
              </span>
              <span className="min-w-0">
                <b className="block text-[13.5px] font-extrabold tracking-tight">Consola de plataforma</b>
                <span className="text-[12px] text-muted">Usuarios, planes y pagos de quienes usan ANIMA</span>
              </span>
              <span className="ml-auto text-faint group-hover:text-accent transition">→</span>
            </button>
          </>
        )}

        <p className="text-[11.5px] text-faint mt-7 leading-relaxed">
          Una sola cuenta. Lo que se te abre lo decide tu plan.
        </p>
      </div>
    </div>
  );
}

function Puerta({ onClick, titulo, lema, texto, glifo }: {
  onClick: () => void; titulo: string; lema: string; texto: string; glifo: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className="text-left p-5 rounded-3xl border border-line bg-surface hover:border-accent
                 hover:-translate-y-0.5 transition group
                 shadow-[0_10px_30px_rgba(0,0,0,.04)]">
      <span className="w-11 h-11 rounded-2xl grid place-items-center border border-line bg-sunk
                       text-accent-deep group-hover:bg-accent group-hover:text-white
                       group-hover:border-accent transition">
        {glifo}
      </span>
      <b className="block text-[16px] font-extrabold tracking-tight mt-4">{titulo}</b>
      <span className="block text-[13px] font-bold text-accent-deep mt-0.5">{lema}</span>
      <span className="block text-[12.5px] text-muted mt-2 leading-relaxed">{texto}</span>
      <span className="block text-[12.5px] font-bold mt-4 text-faint group-hover:text-accent transition">
        Entrar →
      </span>
    </button>
  );
}

/* Quien solo tiene Alma no tiene nada que elegir: se le abre STUDIO. El enlace
   queda visible por si el navegador bloquea el salto. */
export function EntrandoAStudio() {
  useEffect(() => { window.location.replace(env.studio); }, []);
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="text-center">
        <p className="text-[13px] text-muted">Entrando a tu Alma…</p>
        <a href={env.studio} className="text-[13px] font-bold text-accent-deep hover:underline mt-2 inline-block">
          Si no pasa nada, entra aquí
        </a>
      </div>
    </div>
  );
}
