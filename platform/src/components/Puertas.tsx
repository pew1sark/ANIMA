import { useEffect, type CSSProperties } from 'react';
import { Oscuro } from '@/components/Oscuro';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca, Apex, ApexCompany } from '@/components/Marca';
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
export function Puertas({ studio, company, anteriores, consola }:
  { studio?: () => void; company?: () => void; anteriores?: () => void; consola?: () => void }) {
  const { user, signOut } = useAuth();
  const h = new Date().getHours();
  const saludo = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <Oscuro className="min-h-full">
      <div className="relative min-h-full max-w-[900px] mx-auto px-5 sm:px-8 pt-5 pb-8 flex flex-col">
        <header className="flex items-center justify-between sube" style={retraso(0)}>
          <Marca />
          <button onClick={signOut} className="b b-fan b-sm">Salir</button>
        </header>

        <div className="flex-1 flex flex-col justify-center py-8 sm:py-12">
          <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className="portal-marca w-[56px] h-[56px] mx-auto">
            <path pathLength={1} d="M18 82 L50 20 L82 82" stroke="#fff" strokeWidth="5.5"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="portal-rotulo text-center mt-7 sube" style={retraso(1)}>{saludo}</p>
          <h1 className="portal-titulo text-center text-[44px] sm:text-[66px] mt-3 sube" style={retraso(2)}>
            ¿Dónde entras <em>hoy</em>?
          </h1>
          <p className="text-center text-[12.5px] text-muted mt-3 sube" style={retraso(3)}>{user?.email}</p>

          <div className="grid gap-4 sm:grid-cols-2 mt-10">
            {studio && <Puerta
              onClick={studio} d={4}
              titulo="ANIMA STUDIO"
              lema="Donde creas."
              texto="Tu Alma, el Taller, tus clientes y el Clan."
              glifo={<Apex className="w-[24px] h-[24px]" />}
            />}
            {company && <Puerta
              onClick={company} d={5}
              titulo="ANIMA COMPANY"
              lema="Donde se opera."
              texto="Clientes, pedidos, inventario, compras, reparto y cobranza."
              glifo={<ApexCompany className="w-[24px] h-[24px]" />}
            />}
          </div>

          {anteriores && (
            <p className="text-center text-[12px] text-muted mt-3 sube" style={retraso(6)}>
              ¿Buscas un espacio anterior de COMPANY?{' '}
              <button onClick={anteriores} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-deep">Abrirlo aquí</button>
            </p>
          )}

          {consola && (
            <button onClick={consola} style={retraso(6)}
              className="sube vidrio mt-4 w-full text-left flex items-center gap-3.5 px-4 py-3.5 rounded-2xl group
                         hover:border-white/25 transition
                         focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
              <span className="w-9 h-9 rounded-xl grid place-items-center border border-white/15 bg-white/[.05] shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                     strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h11" />
                </svg>
              </span>
              <span className="min-w-0">
                <b className="block text-[13.5px] font-semibold tracking-tight">Consola de plataforma</b>
                <span className="text-[12px] text-muted">Usuarios, planes y pagos de quienes usan ANIMA</span>
              </span>
              <span className="ml-auto text-faint group-hover:text-ink group-hover:translate-x-0.5 transition">→</span>
            </button>
          )}
        </div>

        <p className="text-center text-[10.5px] text-faint tracking-[.22em] uppercase sube" style={retraso(7)}>
          ANIMA TSC · Technology System Connection
        </p>
      </div>
    </Oscuro>
  );
}

const retraso = (n: number) => ({ ['--d' as string]: n } as CSSProperties);

/* Una puerta. Es una tarjeta entera pulsable —no un enlace dentro de una
   tarjeta—: al acercarse sube la luz del umbral (ver `.puerta` en index.css),
   el marco se enciende y el glifo se vuelve de luz. */
function Puerta({ onClick, titulo, lema, texto, glifo, d }: {
  onClick: () => void; titulo: string; lema: string; texto: string; glifo: React.ReactNode; d: number;
}) {
  return (
    <button onClick={onClick} className="puerta sube group" style={retraso(d)}>
      <span className="glifo">{glifo}</span>
      <span className="mt-auto pt-7 sm:pt-12 block">
        <span className="portal-rotulo block">{titulo}</span>
        <span className="portal-titulo block text-[34px] sm:text-[38px] mt-2"><em>{lema}</em></span>
        <span className="block text-[12.5px] text-muted mt-2 leading-relaxed">{texto}</span>
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold mt-5 text-ink">
          Entrar <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </span>
      </span>
    </button>
  );
}

/* Quien solo tiene COMPANY va directo al sitio nuevo. */
export function EntrandoACompany() {
  useEffect(() => { window.location.replace(env.company); }, []);
  return (
    <Oscuro className="min-h-full grid place-items-center p-6">
      <div className="text-center">
        <p className="text-[13px] text-muted">Entrando a ANIMA COMPANY…</p>
        <a href={env.company} className="text-[13px] font-bold text-accent-deep hover:underline mt-2 inline-block">
          Si no pasa nada, entra aquí
        </a>
      </div>
    </Oscuro>
  );
}

/* Quien solo tiene Alma no tiene nada que elegir: se le abre STUDIO. El enlace
   queda visible por si el navegador bloquea el salto. */
export function EntrandoAStudio() {
  useEffect(() => { window.location.replace(env.studio); }, []);
  return (
    <Oscuro className="min-h-full grid place-items-center p-6">
      <div className="text-center">
        <p className="text-[13px] text-muted">Entrando a tu Alma…</p>
        <a href={env.studio} className="text-[13px] font-bold text-accent-deep hover:underline mt-2 inline-block">
          Si no pasa nada, entra aquí
        </a>
      </div>
    </Oscuro>
  );
}
