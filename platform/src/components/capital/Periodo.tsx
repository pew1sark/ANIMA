import { useEffect, useRef, useState } from 'react';
import { mesCorto } from '@/lib/formato';

/* EL PERÍODO
   ---------------------------------------------------------------------------
   Un rango de meses con atajos y con modo personalizado.

   Antes eran dos campos `type="month"` sueltos. Funcionaban, y eran un mal
   control por dos razones: vacíos se dibujan como «---------- de ----», que no
   dice nada; y obligan a pensar en fechas cuando lo que uno quiere es «los
   últimos seis meses». Los atajos responden esa pregunta directamente y el
   personalizado sigue estando para cuando de verdad hace falta un rango raro.

   El estado vive fuera: este componente solo propone. Devuelve el día 1 de
   cada mes en ISO, que es la forma en que la base guarda un período. */

export interface Rango { desde?: string; hasta?: string }

type Atajo = {
  id: string;
  nombre: string;
  /** Meses hacia atrás y hacia adelante desde el mes en curso. */
  atras: number;
  adelante: number;
};

const ATAJOS: Atajo[] = [
  { id: '3m',   nombre: '3 meses',   atras: 2,  adelante: 0 },
  { id: '6m',   nombre: '6 meses',   atras: 5,  adelante: 0 },
  { id: '12m',  nombre: '12 meses',  atras: 11, adelante: 0 },
  { id: 'ano',  nombre: 'Este año',  atras: -1, adelante: -1 },   // caso aparte
  { id: 'todo', nombre: 'Todo',      atras: 11, adelante: 11 }
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

const mesDesplazado = (n: number) => {
  const h = new Date();
  return iso(new Date(h.getFullYear(), h.getMonth() + n, 1));
};

function rangoDe(a: Atajo): Rango {
  if (a.id === 'ano') {
    const y = new Date().getFullYear();
    return { desde: `${y}-01-01`, hasta: `${y}-12-01` };
  }
  return { desde: mesDesplazado(-a.atras), hasta: mesDesplazado(a.adelante) };
}

/** Qué atajo describe el rango actual, si alguno. Se compara el resultado y no
 *  se guarda cuál se pulsó: así el atajo sigue marcado al recargar. */
function atajoActivo(r: Rango): string | null {
  if (!r.desde && !r.hasta) return '12m';
  for (const a of ATAJOS) {
    const x = rangoDe(a);
    if (x.desde === r.desde && x.hasta === r.hasta) return a.id;
  }
  return null;
}

export function Periodo({ valor, onChange, etiqueta = 'Período' }:
  { valor: Rango; onChange: (r: Rango) => void; etiqueta?: string }) {
  const activo = atajoActivo(valor);
  const [abierto, setAbierto] = useState(activo === null);
  const caja = useRef<HTMLDivElement>(null);

  /* Si el rango deja de coincidir con un atajo —porque alguien escribió una
     fecha— el panel personalizado se queda abierto. Cerrarlo escondería lo
     que la persona acaba de escribir. */
  useEffect(() => { if (activo === null) setAbierto(true); }, [activo]);

  const set = (k: keyof Rango) => (v: string) =>
    onChange({ ...valor, [k]: v ? `${v}-01` : undefined });

  return (
    <div ref={caja} className="grid gap-2 min-w-0">
      <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>{etiqueta}</span>
      <div className="flex items-center gap-1 flex-wrap">
        <div className="grupo">
          {ATAJOS.map(a => (
            <button key={a.id} type="button" aria-pressed={activo === a.id}
                    onClick={() => { onChange(rangoDe(a)); setAbierto(false); }}>
              {a.nombre}
            </button>
          ))}
          <button type="button" aria-pressed={activo === null}
                  onClick={() => setAbierto(v => !v)}
                  title="Elegir un mes de inicio y uno de fin">
            Personalizado
          </button>
        </div>
        {activo === null && (
          <span className="text-[11.5px] text-faint tabular-nums">
            {valor.desde ? mesCorto(valor.desde.slice(0, 7)) : '—'}
            {' → '}
            {valor.hasta ? mesCorto(valor.hasta.slice(0, 7)) : '—'}
          </span>
        )}
      </div>

      {abierto && (
        <div className="entra flex items-end gap-2 flex-wrap">
          <label className="grid gap-1">
            <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>Desde</span>
            <input className="campo" type="month" style={{ minHeight: 34, padding: '6px 10px', width: 150 }}
                   value={(valor.desde ?? '').slice(0, 7)}
                   onChange={e => set('desde')(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>Hasta</span>
            <input className="campo" type="month" style={{ minHeight: 34, padding: '6px 10px', width: 150 }}
                   value={(valor.hasta ?? '').slice(0, 7)}
                   onChange={e => set('hasta')(e.target.value)} />
          </label>
          {(valor.desde || valor.hasta) && (
            <button type="button" className="b b-fan b-sm"
                    onClick={() => onChange({ desde: undefined, hasta: undefined })}>
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
