import { useMemo, useRef, useState } from 'react';

/* Una serie en el tiempo: área tenue, línea de 2px y un punto al final.
   Se dibuja a mano en SVG y no con una librería por dos razones: pesa cero, y
   una librería de gráficos trae su propio criterio tipográfico y de color, que
   es justo lo que aquí no se quiere.

   Los ejes y las etiquetas van en HTML, fuera del SVG: el SVG se escala con el
   ancho disponible y el texto dentro se escalaría con él, quedando a un cuerpo
   distinto en cada pantalla. */

export interface Punto { etiqueta: string; valor: number; nota?: string }

interface Props {
  puntos: Punto[];
  /** Cómo se escribe el valor en el globo y en el eje. */
  formato: (v: number) => string;
  color?: string;
  alto?: number;
}

const AN = 720;   // ancho del lienzo interno; el SVG se escala al contenedor

export function Serie({ puntos, formato, color = 'var(--dato-1)', alto = 150 }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  const { d, area, techo, ejeY } = useMemo(() => {
    const vals = puntos.map(p => p.valor);
    /* El techo se redondea hacia arriba a una cifra limpia: un eje que termina
       en 1.847.302 no ayuda a nadie a estimar. */
    const mayor = Math.max(0, ...vals);
    const crudo = Math.max(1, mayor);
    const orden = Math.pow(10, Math.floor(Math.log10(crudo)));
    const techo = Math.ceil(crudo / (orden / 2)) * (orden / 2);

    const x = (i: number) => puntos.length < 2 ? AN / 2 : (i / (puntos.length - 1)) * AN;
    const y = (v: number) => alto - (v / techo) * (alto - 6) - 3;

    const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
    return {
      d: linea,
      area: `${linea} L${x(puntos.length - 1).toFixed(1)} ${alto} L${x(0).toFixed(1)} ${alto} Z`,
      techo,
      /* Todo en cero: se rotula solo la base. Con un techo inventado de 1, las
         tres marcas salían «$1 · $1 · $0» y el gráfico parecía averiado. */
      ejeY: mayor > 0 ? [techo, techo / 2, 0] : [null, null, 0]
    };
  }, [puntos, alto]);

  if (puntos.length === 0) return null;

  const px = (i: number) => puntos.length < 2 ? 50 : (i / (puntos.length - 1)) * 100;
  const py = (v: number) => ((alto - (v / techo) * (alto - 6) - 3) / alto) * 100;

  const activo = sobre != null ? puntos[sobre] : null;

  /* El puntero cae en cualquier parte del ancho; se traduce al punto más
     cercano, que es lo que la gente cree que está señalando. */
  function apunta(e: React.PointerEvent) {
    const r = caja.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setSobre(Math.round(t * (puntos.length - 1)));
  }

  return (
    <div>
      <div className="flex gap-3">
        {/* eje vertical, en HTML */}
        <div className="flex flex-col justify-between shrink-0 text-right"
             style={{ height: alto, fontSize: 10.5, color: 'var(--color-faint)' }}>
          {ejeY.map((v, i) => (
            <span key={i} className="tabular-nums leading-none">{v == null ? '' : formato(v)}</span>
          ))}
        </div>

        <div ref={caja} className="relative flex-1 min-w-0"
             onPointerMove={apunta} onPointerLeave={() => setSobre(null)}>
          <svg viewBox={`0 0 ${AN} ${alto}`} width="100%" height={alto}
               preserveAspectRatio="none" role="img"
               aria-label={`Serie de ${puntos.length} puntos, máximo ${formato(techo)}`}>
            {/* retícula: continua, de un píxel y a un paso del fondo */}
            {[0, 0.5, 1].map(f => (
              <line key={f} className="eje" x1="0" x2={AN}
                    y1={(alto - 3) * f + 1.5} y2={(alto - 3) * f + 1.5}
                    vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill={color} opacity=".1" />
            <path d={d} fill="none" stroke={color} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" />
          </svg>

          {/* El punto final y el del cursor van en HTML, encima: dentro de un
              SVG con preserveAspectRatio="none" un círculo saldría ovalado. */}
          <Punta x={px(puntos.length - 1)} y={py(puntos[puntos.length - 1]!.valor)} color={color} />

          {activo && (
            <>
              <span className="absolute top-0 bottom-0 w-px pointer-events-none"
                    style={{ left: `${px(sobre!)}%`, background: 'var(--color-line)' }} />
              <Punta x={px(sobre!)} y={py(activo.valor)} color={color} />
              <span className="globo" style={{ left: `${px(sobre!)}%`, top: `${py(activo.valor)}%`, marginTop: -12 }}>
                {activo.etiqueta} · <b>{formato(activo.valor)}</b>
                {activo.nota && <span className="opacity-70"> · {activo.nota}</span>}
              </span>
            </>
          )}
        </div>
      </div>

      {/* eje horizontal: tres marcas, no treinta */}
      <div className="flex justify-between mt-2 pl-[52px]"
           style={{ fontSize: 10.5, color: 'var(--color-faint)' }}>
        <span>{puntos[0]!.etiqueta}</span>
        {puntos.length > 2 && <span>{puntos[Math.floor(puntos.length / 2)]!.etiqueta}</span>}
        <span>{puntos[puntos.length - 1]!.etiqueta}</span>
      </div>
    </div>
  );
}

/* El punto lleva un anillo del color de la superficie para que se lea aunque
   caiga justo encima de la línea. */
const Punta = ({ x, y, color }: { x: number; y: number; color: string }) => (
  <span className="absolute rounded-full pointer-events-none"
        style={{
          left: `${x}%`, top: `${y}%`, width: 9, height: 9,
          transform: 'translate(-50%,-50%)',
          background: color, boxShadow: '0 0 0 2px var(--color-surface)'
        }} />
);
