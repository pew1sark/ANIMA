import { useEffect, useState } from 'react';
import { cargarMatriz, calificar, descalificar,
         type Matriz, type CriterioMatriz, type OportunidadMatriz } from '@/services/inmobiliaria.service';
import { Avisos, Cabecera } from '@/components/capital/Cifra';
import { dineroLlano, cantidad } from '@/lib/formato';

/* LA MATRIZ DE CALIFICACIÓN
   ---------------------------------------------------------------------------
   Oportunidades en las filas, criterios en las columnas, un número del 1 al 5
   en cada cruce. Es la pantalla que convierte «este lote me gusta» en algo que
   se puede comparar con otro lote.

   Tres decisiones que explican por qué se ve así:

   1 · LA MATRIZ Y NO UNA FICHA POR OPORTUNIDAD. Calificar de a una hace que
       cada nota se ponga sin ver las demás, y entonces el 4 de una oportunidad
       y el 4 de otra no significan lo mismo. Puestas en una grilla, se
       califica comparando, que es lo único que hace útil una escala de 1 a 5.

   2 · NINGUNA NOTA SE CALCULA AQUÍ. Al guardar una celda se vuelve a pedir la
       matriz entera, y el promedio ponderado, la banda y la decisión vienen de
       `rei_matriz_scoring()`. Recalcularlo en el navegador para "no esperar"
       habría creado una segunda aritmética que tarde o temprano difiere de la
       que decide.

   3 · EL PESO CUBIERTO SE MUESTRA. Una nota de 4,8 con el 30% del peso puesto
       no es la misma información que una de 4,8 completa, y sin decirlo las
       dos se leen igual. */

export function CalificacionOportunidades({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [m, setM] = useState<Matriz | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  async function recargar() {
    setError(null);
    try {
      const r = await cargarMatriz(companyId);
      if (!r) { setSinAcceso(true); return; }
      setM(r);
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo cargar la matriz.');
    }
  }

  useEffect(() => {
    let vivo = true;
    setCargando(true); setSinAcceso(false);
    cargarMatriz(companyId)
      .then(r => { if (!vivo) return; if (!r) setSinAcceso(true); else setM(r); })
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar la matriz.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  async function poner(oportunidad: string, criterio: string, valor: string) {
    const clave = `${oportunidad}:${criterio}`;
    setGuardando(clave); setError(null);
    try {
      if (valor === '') await descalificar(oportunidad, criterio);
      else await calificar(companyId, oportunidad, criterio, Number(valor));
      await recargar();
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo guardar la calificación.');
    } finally { setGuardando(null); }
  }

  if (sinAcceso) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Esta pantalla no es para tu nivel de acceso</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Calificar oportunidades es decidir qué se estructura primero con el capital de
          la firma. Hace falta nivel de dirección.
        </p>
      </div>
    );
  }

  if (cargando) return <div className="tarjeta aparece" style={{ height: 260 }} aria-busy="true" />;

  const pesoOk = m ? Math.abs(m.peso_total - 100) < 0.005 : true;

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Calificación de oportunidades"
        nota="Cada criterio se califica de 1 a 5. La nota es el promedio ponderado sobre el peso que se alcanzó a calificar, no sobre 100: una oportunidad con cinco de siete criterios puestos da su nota sobre esos cinco en vez de arrastrar ceros por lo que nadie ha mirado."
        marcas={m && (
          <span className={`marca ${pesoOk ? 'marca-ok' : 'marca-aviso'}`}>
            pesos: {cantidad(m.peso_total, 2)}%
          </span>
        )}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {m && <Avisos avisos={m.alertas} />}

      {m && m.criterios.length > 0 && (
        <>
          <section className="tarjeta p-5">
            <h2 className="rotulo">Los criterios y lo que pesan</h2>
            <p className="mt-1 text-[12.5px] text-faint max-w-[72ch]">
              Se editan en la pestaña <b>Criterios</b>. Pulsa uno para ver qué mide y cómo
              se ve un 1, un 3 y un 5 — que es lo que hace que dos personas califiquen
              parecido.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {m.criterios.map(c => (
                <button key={c.id} type="button"
                        onClick={() => setAbierto(a => (a === c.id ? null : c.id))}
                        aria-expanded={abierto === c.id}
                        className={`marca ${abierto === c.id ? 'marca-acento' : ''}`}>
                  {c.nombre} · {cantidad(c.peso, 2)}%
                </button>
              ))}
            </div>
            {abierto && <Escala criterio={m.criterios.find(c => c.id === abierto)!} />}
          </section>

          {m.oportunidades.length === 0
            ? <div className="tarjeta p-8">
                <p className="titular" style={{ fontSize: 19 }}>No hay oportunidades que calificar</p>
                <p className="subtitulo mt-1.5 max-w-[62ch]">
                  Cárgalas en la pestaña <b>Oportunidades</b>: un predio con su área, su
                  precio pedido y su ficha normativa. Aquí aparecen en cuanto existan.
                </p>
              </div>
            : <Grilla m={m} puedeEditar={puedeEditar} guardando={guardando} poner={poner} />}
        </>
      )}
    </div>
  );
}

function Escala({ criterio }: { criterio: CriterioMatriz }) {
  return (
    <div className="formula entra mt-3">
      {criterio.mide && <p>{criterio.mide}</p>}
      <dl>
        {([['1 · muy bajo', criterio.bajo], ['3 · medio', criterio.medio], ['5 · muy alto', criterio.alto]] as const)
          .filter(([, t]) => t)
          .map(([k, t]) => (
            <div key={k} className="insumo"><dt>{k}</dt><dd>{t}</dd></div>
          ))}
      </dl>
    </div>
  );
}

const TONO_BANDA: Record<string, string> = { A: 'marca-ok', B: 'marca-acento', C: 'marca-aviso', D: 'marca-malo' };

function Grilla({ m, puedeEditar, guardando, poner }: {
  m: Matriz; puedeEditar: boolean; guardando: string | null;
  poner: (oportunidad: string, criterio: string, valor: string) => void;
}) {
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">Oportunidades</h2>
      <div className="desliza -mx-5 px-5 mt-3">
        <table className="tabla">
          <thead>
            <tr>
              <th className="ancla">Oportunidad</th>
              <th>Municipio</th>
              <th className="num">Precio / m²</th>
              {m.criterios.map(c => (
                <th key={c.id} className="num" title={`${c.nombre} · peso ${cantidad(c.peso, 2)}%`}>
                  {abreviar(c.nombre)}
                </th>
              ))}
              <th className="num">Nota</th>
              <th>Banda</th>
              <th>Decisión sugerida</th>
            </tr>
          </thead>
          <tbody>
            {m.oportunidades.map(o => <Fila key={o.id} o={o} criterios={m.criterios}
                                            puedeEditar={puedeEditar} guardando={guardando} poner={poner} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Fila({ o, criterios, puedeEditar, guardando, poner }: {
  o: OportunidadMatriz; criterios: CriterioMatriz[]; puedeEditar: boolean;
  guardando: string | null; poner: (oportunidad: string, criterio: string, valor: string) => void;
}) {
  /* Una nota con poco peso detrás se marca. No se esconde ni se bloquea: se
     dice, que es distinto. */
  const parcial = o.cubierto_pct != null && o.cubierto_pct > 0 && o.cubierto_pct < 100;

  return (
    <tr>
      <td className="ancla principal">
        <span className="recorta" title={o.nombre}>{o.nombre}</span>
      </td>
      <td>{o.municipio ?? '—'}</td>
      <td className="num cifra">{o.precio_m2 == null ? '—' : dineroLlano(o.precio_m2)}</td>

      {criterios.map(c => {
        const celda = o.calificaciones[c.id];
        const clave = `${o.id}:${c.id}`;
        return (
          <td key={c.id} className="num">
            {puedeEditar
              ? <select className="campo" style={{ minWidth: 62, padding: '2px 4px', textAlign: 'center' }}
                        value={celda ? String(celda.valor) : ''}
                        disabled={guardando === clave}
                        aria-label={`${c.nombre} en ${o.nombre}`}
                        onChange={e => poner(o.id, c.id, e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              : <span className="cifra">{celda ? celda.valor : '—'}</span>}
          </td>
        );
      })}

      <td className="num cifra">
        {o.score == null ? '—' : cantidad(o.score, 2)}
        {parcial && (
          <span className="block text-[11px]" style={{ color: 'var(--color-faint)' }}>
            {cantidad(o.cubierto_pct!, 0)}% del peso
          </span>
        )}
      </td>
      <td>{o.banda ? <span className={`marca ${TONO_BANDA[o.banda] ?? ''}`}>{o.banda}</span> : '—'}</td>
      <td>{o.decision ?? <span style={{ color: 'var(--color-faint)' }}>sin calificar</span>}</td>
    </tr>
  );
}

/* Siete encabezados completos no caben en una fila, y con la tabla desplazada
   en horizontal dejan de verse justo cuando hay que elegir la columna. El
   nombre entero sigue en el `title`. */
function abreviar(nombre: string): string {
  const limpio = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  if (limpio.length <= 14) return limpio;
  return limpio.split(/\s+/).filter(p => p.length > 2).slice(0, 2).join(' ');
}
