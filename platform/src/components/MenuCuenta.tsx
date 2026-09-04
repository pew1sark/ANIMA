import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { perfilService, IDIOMAS, type Perfil } from '@/services/perfil.service';
import { useInstalacion, COMO_INSTALAR } from '@/lib/instalar';
import { env } from '@/config/env';

/* El menú de la cuenta.
   ---------------------------------------------------------------------------
   Se abre pinchando tu nombre, arriba a la derecha, y es el mismo en STUDIO y
   en COMPANY: idioma, ayuda, plan, instalar y salir, en ese orden. Que sea el
   mismo importa más de lo que parece — quien usa las dos plataformas no tiene
   por qué aprender dos veces dónde se cierra la sesión.

   Lo que cambia entre una y otra son los dos primeros destinos, que dependen
   de dónde está parado: en COMPANY, tu espacio y el plan de la empresa; en
   STUDIO, tu Alma y tu Forma. Por eso llegan como props y no van escritos
   aquí dentro. */
export function MenuCuenta({ irAMiEspacio, irAMiPlan, nombreEspacio = 'Mi espacio' }: {
  irAMiEspacio?: () => void;
  irAMiPlan?: () => void;
  nombreEspacio?: string;
}) {
  const { user, signOut } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [verIdiomas, setVerIdiomas] = useState(false);
  const [verInstalar, setVerInstalar] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const { estado, instalar } = useInstalacion();

  useEffect(() => { perfilService.mio().then(setPerfil).catch(() => {}); }, []);

  /* Se cierra al pinchar fuera y con Escape. Un menú que solo se cierra con su
     propio botón es un menú que se queda abierto. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  function cerrar() { setAbierto(false); setVerIdiomas(false); setVerInstalar(false); }

  const nombre = perfil?.full_name?.trim() || user?.email?.split('@')[0] || 'Mi cuenta';
  const iniciales = nombre.slice(0, 2).toUpperCase();
  const idioma = IDIOMAS.find(i => i.codigo === (perfil?.locale ?? 'es')) ?? IDIOMAS[0];

  async function elegirIdioma(codigo: string) {
    setPerfil(p => (p ? { ...p, locale: codigo } : p));
    try { await perfilService.fijarIdioma(codigo); } catch { /* queda para el próximo intento */ }
    setVerIdiomas(false);
  }

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => setAbierto(v => !v)}
              aria-haspopup="menu" aria-expanded={abierto}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full border border-line
                         bg-surface hover:border-accent transition max-w-[210px]">
        <span className="w-6 h-6 rounded-full grid place-items-center shrink-0
                         bg-accent/15 text-accent-deep text-[10px] font-extrabold">{iniciales}</span>
        <span className="text-[12.5px] font-bold truncate">{nombre}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             className={`text-faint shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div role="menu"
             className="absolute right-0 mt-2 w-[268px] rounded-2xl border border-line bg-surface
                        shadow-[0_18px_44px_rgba(0,0,0,.14)] p-1.5 z-50 entra">
          <div className="px-3 py-2.5">
            <b className="block text-[13.5px] font-extrabold truncate">{nombre}</b>
            <span className="block text-[11.5px] text-muted truncate">{user?.email}</span>
          </div>
          <Linea />

          {irAMiEspacio && (
            <Fila onClick={() => { cerrar(); irAMiEspacio(); }} icono={<IcoCasa />}>{nombreEspacio}</Fila>
          )}
          {irAMiPlan && (
            <Fila onClick={() => { cerrar(); irAMiPlan(); }} icono={<IcoEstrella />}>Mi plan</Fila>
          )}
          <Fila onClick={() => window.open(env.sitio + 'planes.html', '_blank')} icono={<IcoSubir />}>
            Mejorar plan
          </Fila>

          <Linea />

          {/* Idioma. Se guarda de verdad en el perfil; lo que todavía no existe
              es la traducción, y eso se dice en vez de esconderlo. */}
          <Fila onClick={() => setVerIdiomas(v => !v)} icono={<IcoGlobo />}
                pista={idioma.nombre} abre={verIdiomas}>Idioma</Fila>
          {verIdiomas && (
            <div className="pl-9 pr-2 pb-1.5 grid gap-0.5">
              {IDIOMAS.map(i => (
                <button key={i.codigo} disabled={!i.listo}
                        onClick={() => elegirIdioma(i.codigo)}
                        className={`text-left text-[12.5px] px-2.5 py-1.5 rounded-lg transition
                                    ${i.codigo === idioma.codigo ? 'font-bold' : ''}
                                    ${i.listo ? 'hover:bg-sunk' : 'opacity-45 cursor-default'}`}>
                  {i.nombre}
                  {!i.listo && <span className="text-[10.5px] text-faint"> · aún no traducido</span>}
                  {i.codigo === idioma.codigo && <span className="text-accent-deep"> ✓</span>}
                </button>
              ))}
            </div>
          )}

          <Fila onClick={() => window.open('mailto:tscanima@gmail.com?subject=' +
                    encodeURIComponent('ANIMA — necesito ayuda'), '_blank')} icono={<IcoAyuda />}>
            Obtener ayuda
          </Fila>

          {estado === 'instalada'
            ? <Fila icono={<IcoBajar />} pista="Ya instalada" onClick={() => {}}>Instalar aplicación</Fila>
            : <Fila icono={<IcoBajar />} abre={verInstalar}
                    onClick={async () => {
                      if (estado === 'instalable') { const ok = await instalar(); if (ok) cerrar(); }
                      else setVerInstalar(v => !v);
                    }}>Instalar aplicación</Fila>}
          {verInstalar && (
            <ul className="pl-9 pr-3 pb-2 grid gap-1.5">
              {COMO_INSTALAR.map((t, i) => (
                <li key={i} className="text-[11.5px] text-muted leading-relaxed">{t}</li>
              ))}
            </ul>
          )}

          <Linea />
          <Fila onClick={() => { cerrar(); signOut(); }} icono={<IcoSalir />} peligro>Cerrar sesión</Fila>
        </div>
      )}
    </div>
  );
}

const Linea = () => <div className="h-px bg-line my-1.5 mx-1" />;

function Fila({ children, onClick, icono, pista, peligro, abre }: {
  children: ReactNode; onClick: () => void; icono: ReactNode;
  pista?: string; peligro?: boolean; abre?: boolean;
}) {
  return (
    <button role="menuitem" onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition
                        text-[13px] font-medium hover:bg-sunk
                        ${peligro ? 'text-danger hover:bg-danger/8' : 'text-ink-2'}`}>
      <span className="shrink-0 text-faint">{icono}</span>
      <span className="flex-1 truncate">{children}</span>
      {pista && <span className="text-[11.5px] text-faint shrink-0">{pista}</span>}
      {abre !== undefined && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             className={`text-faint shrink-0 transition-transform ${abre ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      )}
    </button>
  );
}

/* Iconos: trazo de 1.7, la misma familia que el resto del sistema. */
const ico = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
              strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const IcoCasa    = () => <svg {...ico}><path d="M3 10.5 12 3l9 7.5V21H3z" /><path d="M9 21v-6h6v6" /></svg>;
const IcoEstrella= () => <svg {...ico}><path d="m12 3 2.6 5.6 6.4.9-4.6 4.4 1.1 6.1L12 17l-5.5 3 1.1-6.1L3 9.5l6.4-.9z" /></svg>;
const IcoSubir   = () => <svg {...ico}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>;
const IcoGlobo   = () => <svg {...ico}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg>;
const IcoAyuda   = () => <svg {...ico}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" /><path d="M12 17h.01" /></svg>;
const IcoBajar   = () => <svg {...ico}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></svg>;
const IcoSalir   = () => <svg {...ico}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;
