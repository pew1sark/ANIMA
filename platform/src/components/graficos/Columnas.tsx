import { useMemo, useState } from 'react';

/* Columnas. Se dibujan con cajas y no con SVG a propósito: cada segmento es un
   elemento real, así que tiene su propia zona sensible al puntero sin
   geometría a mano, y el texto no se escala con el lienzo.

   Hay dos modos, y elegir mal miente:

     apilado   — solo cuando las series son PARTES DE UN TODO y su suma
                 significa algo. Margen + costo = venta: apilar está bien.
     agrupado  — cuando son medidas independientes. Cobros y pagos comparten
                 unidad, pero cobros + pagos no es ninguna cifra: apilarlas
                 dibujaría un total que no existe.

   Compartir unidad no basta para apilar. Lo que se apila tiene que sumar.
   Y dos medidas de escalas distintas no van en este gráfico en ningún modo:
   irían en dos gráficos, nunca en dos ejes. */

export interface SerieCol { clave: string; nombre: string; color: string }
export interface Columna { etiqueta: string; partes: Record<string, number>; nota?: string }

interface Props {
  columnas: Columna[];
  series: SerieCol[];
  formato: (v: number) => string;
  alto?: number;
  modo?: 'apilado' | 'agrupado';
}

export function Columnas({ columnas, series, formato, alto = 150, modo = 'apilado' }: Props) {
  const [sobre, setSobre] = useState<number | null>(null);

  const { techo, totales, ejeY } = useMemo(() => {
    const totales = columnas.map(c => series.reduce((s, k) => s + (Number(c.partes[k.clave]) || 0), 0));
    /* Apilado, el techo lo marca la suma; agrupado, la barra más alta: si se
       usara la suma, ninguna barra llegaría nunca ni a la mitad del eje. */
    const mayor = modo === 'apilado'
      ? Math.max(0, ...totales)
      : Math.max(0, ...columnas.flatMap(c => series.map(k => Number(c.partes[k.clave]) || 0)));
    const crudo = Math.max(1, mayor);
    const orden = Math.pow(10, Math.floor(Math.log10(crudo)));
    const techo = Math.ceil(crudo / (orden / 2)) * (orden / 2);
    /* Sin un solo dato se rotula solo la base: si no, el eje inventado sale
       «$1 · $1 · $0» y parece un error en vez de un mes sin ventas. */
    return { techo, totales, ejeY: mayor > 0 ? [techo, techo / 2, 0] : [null, null, 0] };
  }, [columnas, series, modo]);

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
                  {modo === 'apilado' ? (
                    /* Las series se apilan en el orden en que llegan, de arriba
                       abajo: la primera es la que corona la columna. */
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
                  ) : (
                    /* Agrupado: una barra por serie, hombro con hombro y
                       midiéndose contra el mismo eje. El hueco de 2px las
                       separa; ninguna lleva borde. */
                    <span className="relative w-full h-full flex items-end justify-center gap-[2px]"
                          style={{ maxWidth: 24 * series.length + 2 * (series.length - 1) }}>
                      {series.map(s => {
                        const v = Number(c.partes[s.clave]) || 0;
                        return (
                          <span key={s.clave} className="flex-1"
                                style={{
                                  maxWidth: 24,
                                  height: `${(v / techo) * 100}%`,
                                  background: s.color,
                                  opacity: sobre == null || sobre === i ? 1 : .45,
                                  transition: 'opacity .15s ease',
                                  borderRadius: '4px 4px 0 0'
                                }} />
                        );
                      })}
                    </span>
                  )}

                  {sobre === i && (
                    <span className="globo" style={{
                      left: '50%',
                      top: `${100 - ((modo === 'apilado' ? total : Math.max(...series.map(s => Number(c.partes[s.clave]) || 0))) / techo) * 100}%`,
                      marginTop: -8 }}>
                      <span className="opacity-70">{c.etiqueta}</span><br />
                      {/* Agrupado no hay total que enseñar: sumar cobros y
                          pagos daría una cifra que no significa nada. */}
                      {modo === 'apilado' && <b>{formato(total)}</b>}
                      {series.map(s => (
                        (modo === 'apilado' && series.length === 1) ? null : (
                          <span key={s.clave} className="block opacity-70" style={{ fontSize: 11 }}>
                            {s.nombre} {formato(Number(c.partes[s.clave]) || 0)}
                          </span>
                        )
                      ))}
                      {modo === 'agrupado' && series.length === 1 && <b>{formato(total)}</b>}
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
