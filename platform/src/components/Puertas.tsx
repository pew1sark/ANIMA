import { useEffect } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca } from '@/components/Marca';
import { env } from '@/config/env';

/* El primer lugar después de entrar. ANIMA es una sola cuenta y dos mundos:
   en STUDIO se crea, en COMPANY se administra. Elegir aquí evita que la
   plataforma tenga que ser las dos cosas a la vez en la misma pantalla.

   STUDIO no es una vista de esta app: es el ANIMA de siempre, en home.html.
   La sesión es la misma —mismo origen, mismo proyecto de Supabase—, así que
   se cruza sin volver a entrar. */
export function Puertas({ irAStudio, irACompany }:
  { irAStudio: () => void; irACompany: () => void }) {
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
          <Puerta
            onClick={irAStudio}
            titulo="ANIMA STUDIO"
            lema="Donde creas."
            texto="Tu Alma, el Taller, el Clan y el Mundo. Proyectos, clientes, cotizaciones y tu Raíz."
            glifo={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20 L12 5 L20 20" />
              </svg>
            }
          />
          <Puerta
            onClick={irACompany}
            titulo="ANIMA COMPANY"
            lema="Donde se administra."
            texto="Las organizaciones que usan ANIMA: sus planes, sus módulos y la relación comercial."
            glifo={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" />
              </svg>
            }
          />
        </div>

        <p className="text-[11.5px] text-faint mt-7 leading-relaxed">
          Una sola cuenta para las dos. Puedes volver aquí cuando quieras.
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
