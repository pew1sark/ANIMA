import { useEffect, useRef, useState } from 'react';
import { mesCorto } from '@/lib/formato';

/* EL PERÍODO
   ---------------------------------------------------------------------------
   Un rango de meses con atajos y con un calendario propio.

   Empezó con dos `<input type="month">`. Funcionaban en Chrome y en Safari no:
   Safari NO implementa ese tipo y lo degrada a un campo de texto — sin icono,
   sin calendario, sin nada que indique qué se espera escribir. Como la mitad
   de quien va a usar esto trabaja en Mac, el control «personalizado» era en la
   práctica un campo vacío que no se sabía llenar.

   Así que el calendario se dibuja aquí. Doce meses y un paso de año: no hace
   falta más, porque la unidad de este módulo es el MES —los modelos, la
   ejecución y el presupuesto se guardan por mes— y elegir días sería ofrecer
   una precisión que ningún dato tiene.

   Se elige por rango: el primer clic pone el inicio, el segundo el fin, y si
   se hacen al revés se ordenan solos. Nadie tiene que acertar el orden. */

export interface Rango { desde?: string; hasta?: string }

type Atajo = { id: string; nombre: string; atras: number; adelante: number };

const ATAJOS: Atajo[] = [
  { id: '3m',   nombre: '3 meses',   atras: 2,  adelante: 0 },
  { id: '6m',   nombre: '6 meses',   atras: 5,  adelante: 0 },
  { id: '12m',  nombre: '12 meses',  atras: 11, adelante: 0 },
  { id: 'ano',  nombre: 'Este año',  atras: -1, adelante: -1 },   // caso aparte
  { id: 'todo', nombre: 'Todo',      atras: 11, adelante: 11 }
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const iso = (a: number, m: number) => `${a}-${String(m + 1).padStart(2, '0')}-01`;

const mesDesplazado = (n: number) => {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() + n, 1);
  return iso(d.getFullYear(), d.getMonth());
};

function rangoDe(a: Atajo): Rango {
  if (a.id === 'ano') {
    const y = new Date().getFullYear();
    return { desde: iso(y, 0), hasta: iso(y, 11) };
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

/** '2026-03-01' → 202603, para comparar meses sin construir fechas. */
const orden = (s?: string) => s ? Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1 : null;

export function Periodo({ valor, onChange, etiqueta = 'Período' }:
  { valor: Rango; onChange: (r: Rango) => void; etiqueta?: string }) {
  const activo = atajoActivo(valor);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  /* Cerrar al pulsar fuera y con Escape. Un panel flotante que solo se cierra
     con su propio botón se queda abierto tapando la pantalla en cuanto alguien
     se distrae. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const texto = valor.desde || valor.hasta
    ? `${valor.desde ? mesCorto(valor.desde.slice(0, 7)) : '…'} → ${valor.hasta ? mesCorto(valor.hasta.slice(0, 7)) : '…'}`
    : 'Elegir meses';

  return (
    <div ref={caja} className="grid gap-2 min-w-0" style={{ position: 'relative' }}>
      <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>{etiqueta}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="grupo">
          {ATAJOS.map(a => (
            <button key={a.id} type="button" aria-pressed={activo === a.id}
                    onClick={() => { onChange(rangoDe(a)); setAbierto(false); }}>
              {a.nombre}
            </button>
          ))}
          <button type="button" aria-pressed={activo === null}
                  aria-expanded={abierto}
                  onClick={() => setAbierto(v => !v)}
                  title="Elegir el mes de inicio y el de fin en un calendario">
            Personalizado
          </button>
        </div>

        {activo === null && (
          <button type="button" onClick={() => setAbierto(v => !v)}
                  className="b b-fan b-sm tabular-nums"
                  title="Cambiar el rango">
            {texto}
          </button>
        )}
      </div>

      {abierto && (
        <Calendario valor={valor} onChange={onChange} cerrar={() => setAbierto(false)} />
      )}
    </div>
  );
}

/* El calendario de meses. Doce casillas en tres filas de cuatro, un paso de
   año, y el rango pintado entre los dos extremos para que se vea qué se está
   eligiendo antes de soltarlo. El mes en curso lleva un borde: es la
   referencia con la que todo el mundo se orienta. */
function Calendario({ valor, onChange, cerrar }:
  { valor: Rango; onChange: (r: Rango) => void; cerrar: () => void }) {
  const hoy = new Date();
  const [ano, setAno] = useState(() => Number((valor.desde ?? iso(hoy.getFullYear(), 0)).slice(0, 4)));
  /* Qué extremo se está eligiendo. Con los dos puestos, el siguiente clic
     reinicia: es lo que espera quien vuelve a abrir para cambiar el rango. */
  const [toca, setToca] = useState<'desde' | 'hasta'>(valor.desde && !valor.hasta ? 'hasta' : 'desde');

  const d = orden(valor.desde), h = orden(valor.hasta);

  function elegir(m: number) {
    const v = iso(ano, m);
    if (toca === 'desde') {
      onChange({ desde: v, hasta: undefined });
      setToca('hasta');
      return;
    }
    /* Si el segundo clic cae antes del primero, se ordenan solos en vez de
       rechazar el clic: la persona ya dijo qué dos meses quiere. */
    const a = valor.desde!, b = v;
    const [x, y] = (orden(a)! <= orden(b)!) ? [a, b] : [b, a];
    onChange({ desde: x, hasta: y });
    setToca('desde');
    cerrar();
  }

  const estado = (m: number): 'extremo' | 'dentro' | 'fuera' => {
    const n = ano * 12 + m;
    if (n === d || n === h) return 'extremo';
    if (d != null && h != null && n > d && n < h) return 'dentro';
    return 'fuera';
  };

  return (
    <div className="entra" role="dialog" aria-label="Elegir el período"
         style={{
           position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 60,
           width: 292, padding: 14, borderRadius: 16,
           background: 'var(--color-surface)', border: '1px solid var(--color-line)',
           boxShadow: '0 12px 34px rgba(17,17,17,.17)'
         }}>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" className="b b-fan b-sm" style={{ minHeight: 28, padding: '3px 10px' }}
                onClick={() => setAno(a => a - 1)} aria-label="Año anterior">‹</button>
        <b className="text-[14px] font-extrabold tabular-nums mx-auto">{ano}</b>
        <button type="button" className="b b-fan b-sm" style={{ minHeight: 28, padding: '3px 10px' }}
                onClick={() => setAno(a => a + 1)} aria-label="Año siguiente">›</button>
      </div>

      <p className="text-[11.5px] mb-2.5" style={{ color: 'var(--color-muted)' }}>
        {toca === 'desde'
          ? 'Elige el mes en que empieza el período.'
          : <>Ahora el mes en que termina. Empieza en <b>{mesCorto(valor.desde!.slice(0, 7))}</b>.</>}
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        {MESES.map((nombre, m) => {
          const e = estado(m);
          const esHoy = ano === hoy.getFullYear() && m === hoy.getMonth();
          return (
            <button key={nombre} type="button" onClick={() => elegir(m)}
                    aria-pressed={e === 'extremo'}
                    style={{
                      padding: '8px 0', borderRadius: 10,
                      fontSize: 'var(--texto-md)', fontWeight: e === 'fuera' ? 600 : 800,
                      background: e === 'extremo' ? 'var(--color-ink)'
                                : e === 'dentro'  ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                                : 'transparent',
                      color: e === 'extremo' ? 'var(--color-bg)' : 'var(--color-ink)',
                      border: esHoy && e === 'fuera'
                        ? '1px solid color-mix(in srgb, var(--color-accent) 60%, transparent)'
                        : '1px solid transparent',
                      transition: 'background-color .15s ease'
                    }}
                    title={esHoy ? 'El mes en curso' : undefined}>
              {nombre}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-line)' }}>
        <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--color-faint)' }}>
          {valor.desde ? mesCorto(valor.desde.slice(0, 7)) : '…'}
          {' → '}
          {valor.hasta ? mesCorto(valor.hasta.slice(0, 7)) : '…'}
        </span>
        <button type="button" className="b b-fan b-sm ml-auto"
                onClick={() => { onChange({ desde: undefined, hasta: undefined }); setToca('desde'); }}>
          Limpiar
        </button>
        <button type="button" className="b b-sec b-sm" onClick={cerrar}>Listo</button>
      </div>
    </div>
  );
}
