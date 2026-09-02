import { useEffect, useState } from 'react';
import { cargarResumen, type Resumen, type Formato, type Tono,
         type ListaResumen, type SerieResumen } from '@/services/resumen.service';
import { Columnas } from '@/components/graficos/Columnas';
import { dinero, dineroCorto, cantidad, mesCorto, diaCorto } from '@/lib/formato';

/* Dibuja el resumen de CUALQUIER módulo.
   ---------------------------------------------------------------------------
   No hay un `if (modulo === 'crm')` en todo el archivo, y esa es la idea: la
   base declara qué mostrar —cifras, series, listas— y esto sabe dibujar esas
   tres cosas. Un módulo nuevo se resume escribiendo SQL, no un componente.

   Es el mismo trato que el motor de datos tiene con las entidades, aplicado a
   la pregunta que va ANTES de la lista. */

interface Props { companyId: string; modulo: string; moneda: string; titulo: string }

export function ResumenModulo({ companyId, modulo, moneda, titulo }: Props) {
  const [r, setR] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    cargarResumen(companyId, modulo)
      .then(d => { if (vivo) setR(d); })
      .catch(e => { if (vivo) setError(e.message ?? 'No se pudo cargar el resumen.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [companyId, modulo]);

  const escribe = (v: unknown, f?: Formato): string => {
    if (v == null || v === '') return '—';
    switch (f) {
      case 'dinero':     return dinero(v, moneda);
      case 'numero':     return cantidad(v, 1);
      case 'porcentaje': return `${cantidad(v)}%`;
      case 'fecha':      return diaCorto(String(v).slice(0, 10));
      case 'mes':        return mesCorto(String(v));
      case 'dias':       return `${cantidad(v)} días`;
      default:           return String(v);
    }
  };

  if (cargando) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 94 }} />)}
        </div>
        <div className="tarjeta" style={{ height: 220 }} />
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="entra tarjeta p-4"
         style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
    );
  }
  if (!r) return null;

  const nada = r.cifras.every(c => !Number(c.valor))
            && r.listas.every(l => l.filas.length === 0)
            && r.series.every(s => s.puntos.every(p => !Number(p.y) && !Number(p.y2)));

  return (
    <div className="grid gap-4 aparece">
      {r.cifras.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {r.cifras.map(c => (
            <div key={c.etiqueta} className="tarjeta p-4 toque">
              <div className="rotulo">{c.etiqueta}</div>
              {/* El tono solo pinta cuando el número dice algo. Un cero no es
                  una alerta: no hay deuda vencida que avisar. */}
              <div className="cifra-grande mt-2"
                   style={{ color: Number(c.valor) > 0 ? color(c.tono) : undefined }}>
                {escribe(c.valor, c.formato)}
              </div>
              {c.nota && (
                <div className="mt-1.5" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>{c.nota}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Aviso honesto: la pantalla funciona, lo que falta son los datos. Se
          dice una vez arriba y no una por bloque vacío. */}
      {nada && (
        <div className="tarjeta p-6">
          <p className="titular" style={{ fontSize: 19 }}>Todavía no hay nada que resumir</p>
          <p className="subtitulo mt-1.5">
            {titulo} se llena solo a medida que se opera. Las pestañas de al lado
            son donde se carga; esta es donde se mira.
          </p>
        </div>
      )}

      {r.series.map(s => <Grafico key={s.titulo} serie={s} moneda={moneda} />)}

      {/* Una lista debajo de otra, siempre. Se intentó en dos columnas y no
          cabía: estas tablas llevan cuatro o cinco columnas de dinero, y a
          media pantalla obligan a desplazar en horizontal cada una. */}
      <div className="grid gap-4">
        {r.listas.map(l => <Lista key={l.titulo} lista={l} escribe={escribe} />)}
      </div>
    </div>
  );
}

const color = (t?: Tono) =>
  t === 'malo' ? 'var(--color-danger)'
  : t === 'aviso' ? 'var(--color-aviso)'
  : t === 'ok' ? 'var(--color-ok)'
  : undefined;

/* Una serie declarada. Con una medida, una columna. Con dos, van AGRUPADAS y
   no apiladas: lo que llega aquí son medidas independientes —cobros y pagos—,
   y su suma no es ninguna cifra. Apilarlas dibujaría un total inventado.

   Por lo mismo llevan dos tonos distintos y no dos pasos del mismo: son cosas
   distintas, no partes de una. El par está validado contra fondo blanco. */
function Grafico({ serie, moneda }: { serie: SerieResumen; moneda: string }) {
  const dos = (serie.leyenda?.length ?? 1) > 1;
  const corta = (v: number) =>
    serie.formato === 'dinero' ? dineroCorto(v, moneda) : cantidad(v);

  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{serie.titulo}</h2>
      {serie.nota && (
        <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
          {serie.nota}
        </p>
      )}
      <Columnas
        columnas={serie.puntos.map(p => ({
          etiqueta: p.formato_x === 'mes' ? mesCorto(p.x) : p.x,
          partes: (dos
            ? { a: Number(p.y) || 0, b: Number(p.y2) || 0 }
            : { a: Number(p.y) || 0 }) as Record<string, number>
        }))}
        modo={dos ? 'agrupado' : 'apilado'}
        series={dos
          ? [{ clave: 'a', nombre: serie.leyenda![0]!, color: 'var(--dato-1)' },
             { clave: 'b', nombre: serie.leyenda![1]!, color: 'var(--dato-2)' }]
          : [{ clave: 'a', nombre: serie.leyenda?.[0] ?? serie.titulo, color: 'var(--dato-1)' }]}
        formato={corta} />
    </section>
  );
}

function Lista({ lista, escribe }:
  { lista: ListaResumen; escribe: (v: unknown, f?: Formato) => string }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{lista.titulo}</h2>
      {lista.nota && (
        <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
          {lista.nota}
        </p>
      )}
      {lista.filas.length === 0
        ? <p className="mt-3" style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
            Sin datos todavía.
          </p>
        : <div className="desliza -mx-5 px-5 mt-3">
            <table className="tabla">
              <thead>
                <tr>
                  {lista.columnas.map((c, i) => (
                    <th key={c.k} className={`${numerica(c.formato) ? 'num' : ''} ${i === 0 ? 'ancla' : ''}`}>
                      {c.t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.filas.map((f, i) => (
                  <tr key={i}>
                    {lista.columnas.map((c, j) => {
                      const v = f[c.k];
                      const pinta = c.tono && Number(v) > 0 ? color(c.tono) : undefined;
                      return (
                        <td key={c.k}
                            className={`${numerica(c.formato) ? 'num cifra' : ''} ${j === 0 ? 'ancla principal' : ''}`}
                            style={{ color: pinta, whiteSpace: c.formato === 'fecha' ? 'nowrap' : undefined }}>
                          {escribe(v, c.formato)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </section>
  );
}

const numerica = (f?: Formato) => f === 'dinero' || f === 'numero' || f === 'porcentaje' || f === 'dias';
