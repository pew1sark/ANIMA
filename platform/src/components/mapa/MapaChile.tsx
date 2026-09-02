import { useMemo, useState } from 'react';
import { REGIONES, MAPA_ANCHO, MAPA_ALTO, reconoceRegion } from '@/components/mapa/chile';

/* Dónde está el negocio.

   El mapa NO va solo: va con la lista de comunas al lado. Un mapa contesta
   «hacia dónde» de un vistazo y miente en todo lo demás —una región enorme y
   vacía pesa en la retina mucho más que una chica llena de clientes—, así que
   la lista es la que da los números y el mapa es la que da la forma.

   El color es una rampa de un solo tono, clara a oscura, porque lo que codifica
   es magnitud. Ni un arcoíris ni un color por región. */

export interface FilaComuna {
  comuna: string; region: string | null;
  clientes: number; pedidos: number; ventas: number;
}

interface Props {
  comunas: FilaComuna[];
  /** Cuántos clientes activos hay en total, tengan región o no. */
  total: number;
  formato: (v: number) => string;
}

const RAMPA = ['var(--rampa-1)', 'var(--rampa-2)', 'var(--rampa-3)', 'var(--rampa-4)', 'var(--rampa-6)'];

export function MapaChile({ comunas, total, formato }: Props) {
  const [sobre, setSobre] = useState<string | null>(null);

  const { porRegion, techo, sinUbicar, hayVentas } = useMemo(() => {
    const porRegion = new Map<string, { clientes: number; ventas: number; comunas: number }>();
    let sinUbicar = 0;
    for (const c of comunas) {
      const cod = reconoceRegion(c.region);
      if (!cod) { sinUbicar += c.clientes; continue; }
      const a = porRegion.get(cod) ?? { clientes: 0, ventas: 0, comunas: 0 };
      a.clientes += c.clientes; a.ventas += Number(c.ventas) || 0; a.comunas += 1;
      porRegion.set(cod, a);
    }
    const ventas = [...porRegion.values()].map(v => v.ventas);
    const hayVentas = ventas.some(v => v > 0);
    const clientes = [...porRegion.values()].map(v => v.clientes);
    return {
      porRegion, sinUbicar, hayVentas,
      techo: Math.max(1, ...(hayVentas ? ventas : clientes))
    };
  }, [comunas]);

  /* Sin una sola región reconocida no hay mapa que dibujar. Decirlo es más
     útil que enseñar un país en blanco: el dato existe, falta llenarlo. */
  if (porRegion.size === 0) {
    return (
      <div className="grid gap-2">
        <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
          {total === 0
            ? 'Todavía no hay clientes cargados. En cuanto los haya, aquí se ve dónde vende la empresa.'
            : `Ninguno de tus ${total} clientes tiene la región anotada en su ficha.`}
        </p>
        {total > 0 && (
          <p style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
            Es el campo <b>Región</b> en Clientes. Con eso puesto, este mapa se dibuja solo.
          </p>
        )}
      </div>
    );
  }

  const escala = (v: number) => {
    if (v <= 0) return 'var(--color-sunk)';
    const i = Math.min(RAMPA.length - 1, Math.floor((v / techo) * RAMPA.length));
    return RAMPA[i]!;
  };

  const activa = sobre ? porRegion.get(sobre) : null;
  const nombreActiva = sobre ? REGIONES.find(r => r.codigo === sobre)?.nombre : null;

  const alto = 420;
  const conDato = REGIONES.filter(r => porRegion.has(r.codigo));

  /* El ranking de regiones. Chile mide 4.300 km de largo y 180 de ancho: en el
     mapa, una región con la mitad del negocio puede ser una raya de veinte
     píxeles. La lista es la que dice cuánto; el mapa, dónde. */
  const ranking = conDato
    .map(r => ({ ...r, ...porRegion.get(r.codigo)! }))
    .sort((a, b) => (hayVentas ? b.ventas - a.ventas : b.clientes - a.clientes));

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-6">
      {/* ---------------- el país ---------------- */}
      <div className="relative shrink-0">
        <svg viewBox={`0 0 ${MAPA_ANCHO} ${MAPA_ALTO}`} height={alto}
             width={(MAPA_ANCHO / MAPA_ALTO) * alto}
             role="img" aria-label={`Mapa de Chile: ${conDato.length} regiones con clientes`}>
          {REGIONES.map(r => {
            const dato = porRegion.get(r.codigo);
            const v = dato ? (hayVentas ? dato.ventas : dato.clientes) : 0;
            return (
              <path key={r.codigo} d={r.d}
                    fill={dato ? escala(v) : 'var(--color-bg)'}
                    /* Las regiones sin dato llevan borde propio: si no, el país
                       se corta por donde termina el negocio y no se entiende
                       dónde está lo que sí se ve. */
                    stroke={dato ? 'var(--color-surface)' : 'var(--color-line)'}
                    strokeWidth={dato ? 1.2 : 1}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      opacity: sobre && sobre !== r.codigo ? .5 : 1,
                      transition: 'opacity .15s ease'
                    }}
                    onPointerEnter={() => dato && setSobre(r.codigo)}
                    onPointerLeave={() => setSobre(null)}>
                <title>{r.nombre}{dato ? ` · ${dato.clientes} cliente(s)` : ' · sin clientes'}</title>
              </path>
            );
          })}
        </svg>

        {activa && (
          <div className="globo" style={{ position: 'absolute', left: '100%', top: 8, transform: 'none' }}>
            {nombreActiva}<br />
            <b>{activa.clientes}</b> <span className="opacity-70">cliente(s)</span>
            {hayVentas && <><br /><b>{formato(activa.ventas)}</b> <span className="opacity-70">en 180 días</span></>}
          </div>
        )}

        {/* Escala del color. Una rampa sin escala es decoración. */}
        <div className="flex items-center gap-2 mt-3" style={{ fontSize: 10.5, color: 'var(--color-faint)' }}>
          <span>menos</span>
          <span className="flex rounded overflow-hidden" style={{ height: 8 }}>
            {RAMPA.map(c => <span key={c} style={{ width: 14, background: c }} />)}
          </span>
          <span>más</span>
          <span className="ml-1">{hayVentas ? 'ventas' : 'clientes'}</span>
        </div>
      </div>

      {/* ---------------- las listas ---------------- */}
      <div className="flex-1 min-w-[280px] grid gap-5 content-start">
        <div>
          <div className="rotulo rotulo-tenue mb-2">Por región</div>
          <div className="grid gap-1.5">
            {ranking.slice(0, 5).map(r => (
              <div key={r.codigo} className="flex items-center gap-2.5"
                   style={{ fontSize: 'var(--texto-md)',
                            opacity: sobre && sobre !== r.codigo ? .5 : 1 }}
                   onPointerEnter={() => setSobre(r.codigo)}
                   onPointerLeave={() => setSobre(null)}>
                <span className="llave" style={{ background: escala(hayVentas ? r.ventas : r.clientes) }} />
                <span className="flex-1 min-w-0 truncate">{r.nombre}</span>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--color-faint)', fontSize: 11 }}>
                  {r.clientes} cli.
                </span>
                <span className="cifra shrink-0 text-right" style={{ width: 100 }}>
                  {r.ventas > 0 ? formato(r.ventas) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="rotulo rotulo-tenue mb-2">Por comuna</div>
          <div className="grid gap-1.5">
            {comunas.slice(0, 8).map(c => (
              <div key={c.comuna + (c.region ?? '')} className="flex items-baseline gap-3"
                   style={{ fontSize: 'var(--texto-md)' }}>
                <span className="flex-1 min-w-0 truncate">
                  {c.comuna}
                  {c.region && (
                    <span style={{ color: 'var(--color-faint)', fontSize: 11 }}> · {c.region}</span>
                  )}
                </span>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--color-faint)', fontSize: 11 }}>
                  {c.clientes} cli.
                </span>
                <span className="cifra shrink-0 text-right" style={{ width: 100 }}>
                  {Number(c.ventas) > 0 ? formato(c.ventas) : '—'}
                </span>
              </div>
            ))}
          </div>
          {comunas.length > 8 && (
            <p className="mt-2" style={{ fontSize: 11, color: 'var(--color-faint)' }}>
              y {comunas.length - 8} comuna(s) más.
            </p>
          )}
        </div>

        {sinUbicar > 0 && (
          <p className="pt-3" style={{ fontSize: 11, color: 'var(--color-faint)', borderTop: '1px solid var(--color-line)' }}>
            {sinUbicar} cliente(s) sin región reconocible: no entran en el mapa, sí en la lista.
          </p>
        )}
      </div>
    </div>
  );
}
