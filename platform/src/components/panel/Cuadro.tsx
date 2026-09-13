import { Columnas } from '@/components/graficos/Columnas';
import { escribe } from '@/components/capital/Cifra';
import { dineroCorto, mesCorto, diaCorto } from '@/lib/formato';
import type { Formato, ListaResumen, SerieResumen } from '@/services/resumen.service';

/* Las dos piezas con las que se dibuja un panel: una curva y una tabla.
   ---------------------------------------------------------------------------
   Vivían dentro del panel de Capital Intelligence. Cuando Real Estate
   Intelligence necesitó las mismas —porque `rei_resumen()` devuelve la misma
   forma que `ci_resumen()`, que era el punto— la alternativa era copiarlas.

   Copiadas habrían empezado a diferir: un arreglo al recorte de una celda
   aquí y no allá, y dos paneles de la misma plataforma que se ven distinto
   sin que nadie lo haya decidido. Viven aquí, y los dos módulos las importan.

   No saben de proyectos ni de predios: reciben `SerieResumen` y
   `ListaResumen`, que es el contrato que devuelve la base. Cualquier módulo
   que hable ese idioma puede usarlas. */

export function Grafico({ serie, moneda }: { serie: SerieResumen; moneda: string }) {
  const dos = (serie.leyenda?.length ?? 1) > 1;
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{serie.titulo}</h2>
      {serie.nota && <p className="mt-1 mb-3 text-[12.5px] text-faint max-w-[70ch]">{serie.nota}</p>}
      <Columnas
        columnas={serie.puntos.map(p => ({
          etiqueta: p.formato_x === 'mes' ? mesCorto(p.x) : p.x,
          /* El tipo se afirma porque las dos ramas del ternario no unifican
             solas en un Record<string, number>. Es el mismo trato que hace
             `ResumenModulo` con la misma forma. */
          partes: (dos
            ? { a: Number(p.y) || 0, b: Number(p.y2) || 0 }
            : { a: Number(p.y) || 0 }) as Record<string, number>
        }))}
        /* Las dos series no se apilan: su suma no es ninguna cifra. */
        modo="agrupado"
        series={dos
          ? [{ clave: 'a', nombre: serie.leyenda![0]!, color: 'var(--dato-1)' },
             { clave: 'b', nombre: serie.leyenda![1]!, color: 'var(--dato-2)' }]
          : [{ clave: 'a', nombre: serie.titulo, color: 'var(--dato-1)' }]}
        formato={v => (serie.formato === 'dinero' ? dineroCorto(v, moneda) : escribe(v, serie.formato, moneda))} />
    </section>
  );
}

export const numerica = (f?: string) =>
  f === 'dinero' || f === 'numero' || f === 'porcentaje' || f === 'dias' || f === 'meses';

/* Una celda de lista. El formato manda: `fecha` se escribe corta, lo numérico
   pasa por el mismo `escribe` que las tarjetas —para que una cifra se vea
   igual en los dos sitios— y el resto es texto tal cual. */
export function celda(v: unknown, f: Formato | undefined, moneda: string): string {
  if (v == null || v === '') return '—';
  if (f === 'fecha') return diaCorto(String(v).slice(0, 10));
  if (numerica(f)) return escribe(Number(v), f, moneda);
  return String(v);
}

export function Lista({ lista, moneda }: { lista: ListaResumen; moneda: string }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{lista.titulo}</h2>
      {lista.nota && <p className="mt-1 text-[12.5px] text-faint">{lista.nota}</p>}
      {lista.filas.length === 0
        ? <p className="mt-3 text-[13px] text-muted">Sin datos todavía.</p>
        : <div className="desliza -mx-5 px-5 mt-3">
            <table className="tabla">
              <thead>
                <tr>
                  {lista.columnas.map((c, i) => (
                    <th key={c.k} className={`${numerica(c.formato) ? 'num' : ''} ${i === 0 ? 'ancla' : ''}`}>{c.t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.filas.map((f, i) => (
                  <tr key={i}>
                    {lista.columnas.map((c, j) => (
                      <td key={c.k}
                          className={`${numerica(c.formato) ? 'num cifra' : ''} ${j === 0 ? 'ancla principal' : ''}`}>
                        {j === 0
                          ? <span className="recorta" title={String(f[c.k] ?? '')}>{celda(f[c.k], c.formato, moneda)}</span>
                          : celda(f[c.k], c.formato, moneda)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </section>
  );
}
