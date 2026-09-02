import { useMemo, useState } from 'react';

/* Columnas apiladas. Se dibujan con cajas y no con SVG a propósito: cada
   segmento es un elemento real, así que tiene su propia zona sensible al
   puntero sin geometría a mano, y el texto no se escala con el lienzo.

   Lo apilado tiene que sumar el total de la columna. Aquí es margen + costo =
   venta: dos partes de una misma cosa, que es cuándo apilar está justificado.
   Dos medidas que no suman nada juntas irían en dos gráficos, nunca en dos
   ejes. */

export interface SerieCol { clave: string; nombre: string; color: string }
export interface Columna { etiqueta: string; partes: Record<string, number>; nota?: string }

interface Props {
  columnas: Columna[];
  series: SerieCol[];
  formato: (v: number) => string;
  alto?: number;
}

export function Columnas({ columnas, series, formato, alto = 150 }: Props) {
  const [sobre, setSobre] = useState<number | null>(null);

  const { techo, totales, ejeY } = useMemo(() => {
    const totales = columnas.map(c => series.reduce((s, k) => s + (Number(c.partes[k.clave]) || 0), 0));
    const mayor = Math.max(0, ...totales);
    const crudo = Math.max(1, mayor);
    const orden = Math.pow(10, Math.floor(Math.log10(crudo)));
    const techo = Math.ceil(crudo / (orden / 2)) * (orden / 2);
    /* Sin un solo dato se rotula solo la base: si no, el eje inventado sale
       «$1 · $1 · $0» y parece un error en vez de un mes sin ventas. */
    return { techo, totales, ejeY: mayor > 0 ? [techo, techo / 2, 0] : [null, null, 0] };
  }, [columnas, series]);

  if (columnas.length === 0) return null;

  return (
    <div>
      {/* Leyenda: con dos o más series va siempre. La identidad no puede
          depender de recordar qué color era cuál. */}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
          {series.map(s => (
            <span key={s.clave} className="flex items-center gap-2"
                  style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
              <span className="llave" style={{ background: s.color }} />
              {s.nombre}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex flex-col justify-between shrink-0 text-right"
             style={{ height: alto, fontSize: 10.5, color: 'var(--color-faint)' }}>
          {ejeY.map((v, i) => (
            <span key={i} className="tabular-nums leading-none">{v == null ? '' : formato(v)}</span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0">
          {/* retícula por detrás */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2].map(i => (
              <span key={i} className="block h-px w-full" style={{ background: 'var(--color-line)' }} />
            ))}
          </div>

          <div className="relative flex items-end gap-[3px]" style={{ height: alto }}>
            {columnas.map((c, i) => {
              const total = totales[i]!;
              return (
                <div key={c.etiqueta}
                     className="flex-1 min-w-0 h-full flex items-end justify-center relative"
                     onPointerEnter={() => setSobre(i)} onPointerLeave={() => setSobre(null)}>
                  {/* zona sensible de columna entera: apuntar a una barra de
                      3px de alto en un mes flojo es imposible */}
                  <span className="absolute inset-0" />
                  {/* Las series se apilan en el orden en que llegan, de arriba
                      abajo: la primera es la que corona la columna. */}
                  <span className="relative w-full flex flex-col justify-end"
                        style={{ maxWidth: 24, height: `${(total / techo) * 100}%` }}>
                    {series.map((s, j, arr) => {
                      const v = Number(c.partes[s.clave]) || 0;
                      if (v <= 0) return null;
                      const arriba = j === 0;                       // el segmento superior
                      const ultimo = j === arr.length - 1;
                      return (
                        <span key={s.clave}
                              style={{
                                height: `${total > 0 ? (v / total) * 100 : 0}%`,
                                background: s.color,
                                opacity: sobre == null || sobre === i ? 1 : .45,
                                transition: 'opacity .15s ease',
                                borderRadius: arriba ? '4px 4px 0 0' : 0,
                                /* 2px de superficie separando los tramos: es el
                                   hueco el que separa, no un borde dibujado */
                                marginBottom: ultimo ? 0 : 2
                              }} />
                      );
                    })}
                  </span>

                  {sobre === i && (
                    <span className="globo" style={{ left: '50%', top: `${100 - (total / techo) * 100}%`, marginTop: -8 }}>
                      <span className="opacity-70">{c.etiqueta}</span><br />
                      <b>{formato(total)}</b>
                      {series.length > 1 && series.map(s => (
                        <span key={s.clave} className="block opacity-70" style={{ fontSize: 11 }}>
                          {s.nombre} {formato(Number(c.partes[s.clave]) || 0)}
                        </span>
                      ))}
                      {c.nota && <span className="block opacity-70" style={{ fontSize: 11 }}>{c.nota}</span>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-[3px] mt-2 pl-[52px]" style={{ fontSize: 10.5, color: 'var(--color-faint)' }}>
        {columnas.map((c, i) => (
          <span key={c.etiqueta} className="flex-1 min-w-0 text-center truncate"
                style={{ fontWeight: sobre === i ? 'var(--peso-fuerte)' : undefined,
                         color: sobre === i ? 'var(--color-ink-2)' : undefined }}>
            {c.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
