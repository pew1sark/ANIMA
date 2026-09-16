import { useEffect, useState } from 'react';
import { cargarCalidad, type Calidad, type FilaArreglar } from '@/services/inmobiliaria.service';
import { Cabecera } from '@/components/capital/Cifra';
import { cantidad } from '@/lib/formato';

/* CALIDAD DE DATO · §48
   ---------------------------------------------------------------------------
   El documento pide un `Completeness Score` por entidad. Está aquí, arriba, y
   sirve para una sola cosa: saber si la cosa mejora o empeora de una semana a
   otra.

   Lo que de verdad arregla algo es lo de abajo: la lista de filas concretas.
   «Calidad de dato 78%» no se puede trabajar; «el inmueble INM-2026-000014
   está vendido sin fecha» sí, y son veinte minutos de alguien que sabe los
   hechos.

   El orden de esa lista no se puede cambiar desde la pantalla, y es a
   propósito: está ordenada por lo que rompe cifras primero. Una venta sin
   fecha se cae de todas las series; un canal de captación en blanco solo deja
   un hueco. Dejar que se ordene por código convertiría la lista en un
   inventario y no en un plan de trabajo. */

const GRAVEDAD: Record<number, { texto: string; color: string; fondo: string }> = {
  1: { texto: 'Rompe cifras',  color: 'var(--color-danger)', fondo: 'color-mix(in srgb, var(--color-danger) 10%, transparent)' },
  2: { texto: 'Las distorsiona', color: 'var(--color-aviso)', fondo: 'color-mix(in srgb, var(--color-aviso) 12%, transparent)' },
  3: { texto: 'Deja un hueco', color: 'var(--color-muted)', fondo: 'var(--color-sunk)' }
};

export function CalidadDeDato({ companyId }: { companyId: string }) {
  const [d, setD] = useState<Calidad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    cargarCalidad(companyId)
      .then(r => vivo && setD(r))
      .catch(e => vivo && setError((e as Error).message ?? 'No se pudo cargar.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  const filas: FilaArreglar[] = d?.arreglar ?? [];
  const mostradas = verTodo ? filas : filas.slice(0, 25);
  const porGravedad = (g: number) => filas.filter(f => f.gravedad === g).length;

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Calidad de dato"
        nota="Qué falta y dónde. El porcentaje de arriba dice si mejora; la lista de abajo es la que se puede trabajar."
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && (
        <div className="grid gap-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 150 }} />)}
          </div>
          <div className="tarjeta" style={{ height: 260 }} />
        </div>
      )}

      {!cargando && d && (
        <>
          {/* ---------- completitud por entidad ---------- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.entidades.map(e => (
              <section key={e.tabla} className="tarjeta p-4 grid gap-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="rotulo">{e.entidad}</h2>
                  <span style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>
                    {cantidad(e.filas)} fila(s)
                  </span>
                </div>

                {e.completitud === null ? (
                  <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
                    Sin filas todavía.
                  </p>
                ) : (
                  <>
                    <div className="cifra-grande" style={{ lineHeight: 1 }}>
                      {e.completitud}<span style={{ fontSize: '.5em', color: 'var(--color-faint)' }}>%</span>
                    </div>
                    {/* La barra es la misma cifra, para leerla sin leerla. */}
                    <div className="rounded-md overflow-hidden" style={{ background: 'var(--color-sunk)', height: 5 }}>
                      <div style={{ width: `${e.completitud}%`, height: '100%', borderRadius: 4,
                                    background: e.completitud >= 85 ? 'var(--color-ok)'
                                              : e.completitud >= 60 ? 'var(--color-aviso)'
                                              : 'var(--color-danger)' }} />
                    </div>
                    <ul className="grid gap-1 mt-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {e.faltantes.filter(f => f.n > 0).map(f => (
                        <li key={f.campo} className="flex justify-between gap-2"
                            style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                          <span>{f.campo}</span>
                          <b className="tabular-nums" style={{ color: 'var(--color-ink-2)' }}>{cantidad(f.n)}</b>
                        </li>
                      ))}
                      {e.faltantes.every(f => f.n === 0) && (
                        <li style={{ fontSize: 11.5, color: 'var(--color-ok)' }}>Nada pendiente.</li>
                      )}
                    </ul>
                  </>
                )}
              </section>
            ))}
          </div>

          {/* ---------- lo que hay que tocar ---------- */}
          <section className="tarjeta p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="rotulo">Lo que hay que arreglar</h2>
              {filas.length > 0 && (
                <span className="flex flex-wrap gap-1.5">
                  {[1, 2, 3].map(g => porGravedad(g) > 0 && (
                    <span key={g} className="marca" style={{ background: GRAVEDAD[g]!.fondo, color: GRAVEDAD[g]!.color }}>
                      <b className="tabular-nums">{cantidad(porGravedad(g))}</b> {GRAVEDAD[g]!.texto.toLowerCase()}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
              Ordenado por lo que rompe cifras primero. No se puede reordenar a propósito:
              así es un plan de trabajo y no un inventario.
            </p>

            {filas.length === 0 ? (
              <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-ok)' }}>
                No hay nada que arreglar. Es raro y es una buena noticia.
              </p>
            ) : (
              <>
                <div className="desliza -mx-5 px-5">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th className="ancla">Qué</th>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Ciudad</th>
                        <th>Problema</th>
                        <th>Por qué importa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mostradas.map((f, i) => (
                        <tr key={`${f.tabla}-${f.codigo}-${i}`}>
                          <td className="ancla">
                            <span className="marca" style={{ background: GRAVEDAD[f.gravedad]!.fondo,
                                                             color: GRAVEDAD[f.gravedad]!.color,
                                                             whiteSpace: 'nowrap' }}>
                              {f.entidad}
                            </span>
                          </td>
                          <td className="cifra" style={{ whiteSpace: 'nowrap' }}>{f.codigo}</td>
                          <td className="principal">{f.nombre}</td>
                          <td style={{ color: 'var(--color-muted)' }}>{f.ciudad}</td>
                          <td>{f.problema}</td>
                          <td style={{ color: 'var(--color-muted)', fontSize: 11.5 }}>{f.efecto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filas.length > 25 && (
                  <button className="b b-sec b-sm mt-3" onClick={() => setVerTodo(v => !v)}>
                    {verTodo ? 'Ver solo las primeras 25' : `Ver las ${cantidad(filas.length)}`}
                  </button>
                )}
              </>
            )}

            {d.mediana_precio_m2 > 0 && (
              <p className="mt-4" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>
                Un precio por m² se marca como inverosímil cuando se aparta más de{' '}
                <b>{d.factor_atipico}×</b> de la mediana de la empresa, que hoy es{' '}
                <b className="tabular-nums">{cantidad(d.mediana_precio_m2)}</b>. No es un valor
                absoluto: se calibra con los datos de cada organización, y el factor se ajusta
                en Supuestos.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
