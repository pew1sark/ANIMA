import { useMemo, useState } from 'react';
import { DEPARTAMENTOS, MAPA_ANCHO, MAPA_ALTO } from '@/components/mapa/colombia';
import { ubicarMunicipio } from '@/components/mapa/ubicar';

/* Dónde está el negocio, en Colombia.
   ---------------------------------------------------------------------------
   Se aparta de `MapaChile` en una cosa, y no por gusto: allá el dato se pinta
   sobre la REGIÓN —quince polígonos, cada uno con su color— y aquí va como
   BURBUJA sobre el municipio.

   El motivo es la escala. Colombia tiene 1.122 municipios; a la escala del
   país, uno mide menos de un píxel, así que colorearlo no se vería. Y colorear
   el departamento en su lugar respondería otra pregunta: una inmobiliaria de
   Pamplona con todo su inventario en un municipio pintaría Norte de Santander
   entero, que es cuarenta veces más grande que su mercado.

   La burbuja resuelve las dos: está en el sitio exacto y su tamaño dice cuánto.
   El área —no el radio— es proporcional al valor, que es como se lee una
   superficie: un círculo del doble de radio parece cuatro veces más, y sería
   mentir por cuatro.

   Los departamentos van debajo, en gris, sin dato: son el mapa, no la
   información. */

export interface PuntoMapa {
  /** El municipio tal como está escrito en la ficha. */
  lugar: string;
  /** El departamento, para desatar homónimos. Hay cuatro «La Unión». */
  departamento?: string | null;
  /** Lo que dimensiona la burbuja. */
  valor: number;
  /** Lo que se enseña al pasar por encima, además del valor. */
  detalle?: { etiqueta: string; valor: string }[];
}

interface Props {
  puntos: PuntoMapa[];
  /** Cómo se llama lo que se está contando: «inmuebles», «clientes». */
  metrica: string;
  /** Total real, ubicados o no, para poder decir cuántos faltan. */
  total?: number;
  alto?: number;
}

const RADIO_MAX = 30;   // en unidades del lienzo
const RADIO_MIN = 4;

export function MapaColombia({ puntos, metrica, total, alto = 420 }: Props) {
  const [sobre, setSobre] = useState<string | null>(null);

  const { burbujas, sinUbicar, ubicados } = useMemo(() => {
    /* Varias filas pueden caer en el mismo municipio —«Cúcuta» y «San José de
       Cúcuta» son el mismo sitio— y tienen que sumar, no taparse. */
    const porCodigo = new Map<string, {
      codigo: string; nombre: string; x: number; y: number;
      valor: number; escrito: Set<string>; detalle: { etiqueta: string; valor: string }[];
    }>();
    let sinUbicar = 0;

    for (const p of puntos) {
      const m = ubicarMunicipio(p.lugar, p.departamento);
      if (!m) { sinUbicar += p.valor; continue; }
      const ya = porCodigo.get(m.codigo);
      if (ya) {
        ya.valor += p.valor;
        ya.escrito.add(p.lugar);
        if (p.detalle) ya.detalle = ya.detalle.concat(p.detalle);
      } else {
        porCodigo.set(m.codigo, {
          codigo: m.codigo, nombre: m.nombre, x: m.x, y: m.y,
          valor: p.valor, escrito: new Set([p.lugar]), detalle: p.detalle ?? []
        });
      }
    }

    const lista = [...porCodigo.values()].filter(b => b.valor > 0);
    const techo = Math.max(1, ...lista.map(b => b.valor));
    /* Radio por raíz del valor: lo que se compara es el ÁREA. */
    const burbujas = lista
      .map(b => ({ ...b, r: RADIO_MIN + (RADIO_MAX - RADIO_MIN) * Math.sqrt(b.valor / techo) }))
      .sort((a, b) => b.valor - a.valor);

    return { burbujas, sinUbicar, ubicados: lista.reduce((s, b) => s + b.valor, 0) };
  }, [puntos]);

  if (burbujas.length === 0) {
    return (
      <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
        {puntos.length === 0
          ? `Todavía no hay ${metrica} cargados. En cuanto los haya, aquí se ve dónde está el negocio.`
          : `Ninguno de los ${metrica} tiene un municipio que se pueda ubicar en el mapa.`}
      </p>
    );
  }

  const activa = sobre ? burbujas.find(b => b.codigo === sobre) ?? null : null;
  /* Cuántos quedaron fuera. Si quien llama sabe el total, manda ese —incluye
     las filas que ni siquiera trajo—; si no, el que se contó al ubicar. */
  const faltan = total != null ? Math.max(0, total - ubicados) : sinUbicar;

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-6">
      {/* ---------------- el país ---------------- */}
      <div className="relative shrink-0">
        <svg viewBox={`0 0 ${MAPA_ANCHO} ${MAPA_ALTO}`} height={alto}
             width={(MAPA_ANCHO / MAPA_ALTO) * alto}
             role="img"
             aria-label={`Mapa de Colombia: ${burbujas.length} municipio(s) con ${metrica}`}>
          {/* El país, sin dato: es el mapa, no la información. */}
          {DEPARTAMENTOS.map(d => (
            <path key={d.codigo} d={d.d}
                  fill="var(--color-sunk)" stroke="var(--color-line)" strokeWidth={1}
                  vectorEffect="non-scaling-stroke" />
          ))}

          {/* Las burbujas, de mayor a menor para que una pequeña encima de una
              grande se siga pudiendo señalar. */}
          {burbujas.map(b => (
            <circle key={b.codigo} cx={b.x} cy={b.y} r={b.r}
                    fill="var(--color-acento)"
                    fillOpacity={sobre && sobre !== b.codigo ? .25 : .55}
                    stroke="var(--color-acento)" strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                    style={{ transition: 'fill-opacity .15s ease', cursor: 'default' }}
                    onPointerEnter={() => setSobre(b.codigo)}
                    onPointerLeave={() => setSobre(null)}>
              <title>{b.nombre} · {b.valor} {metrica}</title>
            </circle>
          ))}
        </svg>

        {activa && (
          <div className="globo" style={{ position: 'absolute', left: '100%', top: 8, transform: 'none' }}>
            {activa.nombre}<br />
            <b>{activa.valor}</b> <span className="opacity-70">{metrica}</span>
            {activa.detalle.map((d, i) => (
              <span key={i}><br /><b>{d.valor}</b> <span className="opacity-70">{d.etiqueta}</span></span>
            ))}
          </div>
        )}

        {/* La escala. Una burbuja sin referencia de tamaño es decoración. */}
        <div className="flex items-baseline gap-2 mt-3" style={{ fontSize: 10.5, color: 'var(--color-faint)' }}>
          <svg width={62} height={22} aria-hidden="true">
            <circle cx={8}  cy={14} r={4}  fill="var(--color-acento)" fillOpacity={.55} />
            <circle cx={26} cy={12} r={7}  fill="var(--color-acento)" fillOpacity={.55} />
            <circle cx={48} cy={11} r={10} fill="var(--color-acento)" fillOpacity={.55} />
          </svg>
          <span>el área es la cantidad de {metrica}</span>
        </div>
      </div>

      {/* ---------------- la lista ---------------- */}
      <div className="flex-1 min-w-[280px] grid gap-2 content-start">
        <div className="rotulo rotulo-tenue">Por municipio</div>
        <div className="grid gap-1.5">
          {burbujas.slice(0, 10).map(b => (
            <div key={b.codigo} className="flex items-baseline gap-2.5"
                 style={{ fontSize: 'var(--texto-md)',
                          opacity: sobre && sobre !== b.codigo ? .5 : 1 }}
                 onPointerEnter={() => setSobre(b.codigo)}
                 onPointerLeave={() => setSobre(null)}>
              <span className="flex-1 min-w-0 truncate">{b.nombre}</span>
              <span className="cifra shrink-0 text-right tabular-nums" style={{ width: 64 }}>
                {b.valor}
              </span>
            </div>
          ))}
        </div>

        {burbujas.length > 10 && (
          <p style={{ fontSize: 11, color: 'var(--color-faint)' }}>
            y {burbujas.length - 10} municipio(s) más.
          </p>
        )}

        {/* Lo que no se pudo ubicar, y por qué. Sin esto la suma del mapa no
            cuadra con el total y nadie sabe dónde se fue la diferencia. */}
        {faltan > 0 && (
          <p className="pt-3 mt-1" style={{ fontSize: 11, color: 'var(--color-faint)',
                                            borderTop: '1px solid var(--color-line)' }}>
            {faltan} sin municipio reconocible: o la casilla está vacía, o lo escrito
            no es un municipio —un barrio o un corregimiento no lo son—. No entran en
            el mapa.
          </p>
        )}
      </div>
    </div>
  );
}
