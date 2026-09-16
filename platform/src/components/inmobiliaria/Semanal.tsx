import { useEffect, useState } from 'react';
import { cargarSemanal, type InformeSemanal } from '@/services/inmobiliaria.service';
import { Cabecera } from '@/components/capital/Cifra';
import { dinero, cantidad, diaCorto } from '@/lib/formato';

/* WEEKLY MANAGEMENT REPORT · §11 y §49
   ---------------------------------------------------------------------------
   La minuta de la reunión semanal, armada con datos y no con recuerdos. Los
   seis bloques que pide el documento, en su orden.

   LO QUE NO HACE, Y ES LA MITAD DE SU VALOR. Un informe automático que rellena
   todos sus huecos es un informe que miente en los huecos. Este lleva una
   sección de notas donde dice qué NO pudo calcular y por qué —«no hay meta
   cargada para el mes», «el modelo no distingue captación de publicación»—
   para que quien lo lea sepa separar un cero de un no sé.

   Eso vale más que una casilla llena: la minuta se lleva a una reunión, y un
   número inventado en una reunión se convierte en una decisión inventada. */

export function InformeSemanalInmobiliario({ companyId }: { companyId: string }) {
  const [semana, setSemana] = useState<string>('');
  const [d, setD] = useState<InformeSemanal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null); setSinAcceso(false);
    cargarSemanal(companyId, semana || undefined)
      .then(r => { if (!vivo) return; if (!r) setSinAcceso(true); else setD(r); })
      .catch(e => vivo && setError((e as Error).message ?? 'No se pudo cargar el informe.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId, semana]);

  if (sinAcceso) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>La minuta es para quien responde por el equipo</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Reúne las metas y el resultado de cada persona, así que pide nivel de
          encargado o superior. Tu propio resultado contra tu propia meta está en el
          panel <b>Comercial</b>.
        </p>
      </div>
    );
  }

  const moneda = d?.moneda ?? 'COP';
  const plata = (v: number | null | undefined) => (v == null ? '—' : dinero(Number(v), moneda));

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Minuta semanal"
        nota={d ? `Semana del ${diaCorto(d.semana.desde)} al ${diaCorto(d.semana.hasta)}. Todo sale de los datos cargados: lo que no se puede calcular se dice al final en vez de rellenarse.` : undefined}
        marcas={d && <span className="marca marca-acento">{moneda}</span>}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <section className="tarjeta p-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5" style={{ width: 200 }}>
          <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>Semana</span>
          <input id="semana-informe" type="date" className="campo" value={semana}
                 onChange={e => setSemana(e.target.value)} />
        </label>
        {semana && (
          <button className="b b-sec b-sm" onClick={() => setSemana('')}>Semana en curso</button>
        )}
      </section>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && (
        <div className="grid gap-4" aria-busy="true">
          <div className="tarjeta" style={{ height: 180 }} />
          <div className="tarjeta" style={{ height: 220 }} />
        </div>
      )}

      {!cargando && d && (
        <>
          {/* ---------- 1 · resumen ejecutivo ---------- */}
          <section className="tarjeta p-5 grid gap-4">
            <h2 className="rotulo">1 · Resumen ejecutivo</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="rotulo rotulo-tenue">Esta semana</div>
                <div className="cifra-heroe mt-1">{plata(d.resumen.comision_semana)}</div>
                <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
                  {cantidad(d.resumen.cierres_semana)} cierre(s) de comisión
                </p>
              </div>
              <div>
                <div className="rotulo rotulo-tenue">Acumulado del mes</div>
                <div className="cifra-heroe mt-1">{plata(d.resumen.comision_mes)}</div>
                <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
                  {d.resumen.meta_mes == null
                    ? 'Sin meta cargada para el mes'
                    : <>contra una meta de {plata(d.resumen.meta_mes)}
                       {d.revenue.cumplimiento != null && <> · <b>{d.revenue.cumplimiento}%</b></>}</>}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="rotulo rotulo-tenue mb-2">Riesgos</div>
                {d.resumen.riesgos.length === 0
                  ? <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
                      Ninguno que los datos puedan ver.
                    </p>
                  : <ul className="grid gap-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {d.resumen.riesgos.map((r, i) => (
                        <li key={i} className="flex gap-2 items-start" style={{ fontSize: 'var(--texto-md)' }}>
                          <span className="rounded-full shrink-0 mt-1.5"
                                style={{ width: 5, height: 5, background: 'var(--color-danger)' }} />
                          {r}
                        </li>
                      ))}
                    </ul>}
              </div>
              <div>
                <div className="rotulo rotulo-tenue mb-2">Victorias</div>
                {d.resumen.victorias.length === 0
                  ? <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
                      Semana sin movimiento registrado.
                    </p>
                  : <ul className="grid gap-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {d.resumen.victorias.map((v, i) => (
                        <li key={i} className="flex gap-2 items-start" style={{ fontSize: 'var(--texto-md)' }}>
                          <span className="rounded-full shrink-0 mt-1.5"
                                style={{ width: 5, height: 5, background: 'var(--color-ok)' }} />
                          {v}
                        </li>
                      ))}
                    </ul>}
              </div>
            </div>
          </section>

          {/* ---------- 2 · revenue ---------- */}
          <Bloque n="2" titulo="Revenue">
            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Dato l="Meta del mes"   v={plata(d.revenue.meta)} />
              <Dato l="Real del mes"   v={plata(d.revenue.real)} />
              <Dato l="Cumplimiento"   v={d.revenue.cumplimiento == null ? '—' : `${d.revenue.cumplimiento}%`} />
              <Dato l="Proyección"     v={plata(d.revenue.proyeccion)}
                    n="real + pipeline ponderado" />
              <Dato l="Brecha"         v={plata(d.revenue.brecha)}
                    alerta={d.revenue.brecha != null && Number(d.revenue.brecha) > 0} />
            </div>
          </Bloque>

          {/* ---------- 3 · equipo ---------- */}
          <Bloque n="3" titulo="Equipo"
                  nota="Cada persona contra su propia meta. Quien no tiene meta ni actividad en el tramo no aparece: una fila de ceros esconde a quien sí trabajó.">
            {d.equipo.length === 0
              ? <Nada texto="Nadie tiene meta cargada ni actividad registrada en el tramo." />
              : <div className="desliza -mx-5 px-5">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th className="ancla">Persona</th>
                        <th className="num">Meta</th><th className="num">Resultado</th>
                        <th className="num">Cumple</th><th className="num">Pipeline</th>
                        <th className="num">Actividad</th><th className="num">Conversión</th>
                        <th className="num">Sin próxima acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.equipo.map(p => (
                        <tr key={p.persona}>
                          <td className="ancla principal">{p.persona}</td>
                          <td className="num">{plata(p.meta)}</td>
                          <td className="num cifra">{plata(p.resultado)}</td>
                          <td className="num cifra" style={{
                            color: p.cumplimiento == null ? undefined
                                 : p.cumplimiento >= 100 ? 'var(--color-ok)'
                                 : p.cumplimiento < 50 ? 'var(--color-danger)' : undefined }}>
                            {p.cumplimiento == null ? '—' : `${p.cumplimiento}%`}
                          </td>
                          <td className="num">{plata(p.pipeline)}</td>
                          <td className="num">{cantidad(p.actividad)}</td>
                          <td className="num">{p.conversion == null ? '—' : `${p.conversion}%`}</td>
                          <td className="num" style={{ color: p.pendientes > 0 ? 'var(--color-danger)' : 'var(--color-faint)' }}>
                            {p.pendientes ? cantidad(p.pendientes) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </Bloque>

          {/* ---------- 4 · brokerage ---------- */}
          <Bloque n="4" titulo="Brokerage">
            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Dato l="Captaciones" v={cantidad(d.brokerage.captaciones)} />
              <Dato l="Leads"       v={cantidad(d.brokerage.leads)} />
              <Dato l="Visitas"     v={cantidad(d.brokerage.visitas)} />
              <Dato l="Ofertas"     v={cantidad(d.brokerage.ofertas)} />
              <Dato l="Cierres"     v={cantidad(d.brokerage.cierres)} />
              <Dato l="Comisión realizada" v={plata(d.brokerage.comision_realizada)}
                    n={`esperada ${plata(d.brokerage.comision_esperada)}`} />
            </div>
          </Bloque>

          {/* ---------- 5 · operaciones ---------- */}
          <Bloque n="5" titulo="Operaciones">
            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Dato l="Contratos vigentes" v={cantidad(d.operaciones.contratos_vigentes)} />
              <Dato l="Vencen en 30 días"  v={cantidad(d.operaciones.vencen_30_dias)}
                    alerta={d.operaciones.vencen_30_dias > 0} />
              <Dato l="Pendientes abiertos" v={cantidad(d.operaciones.tareas_pendientes)} />
              <Dato l="Pendientes vencidos" v={cantidad(d.operaciones.tareas_vencidas)}
                    alerta={d.operaciones.tareas_vencidas > 0} />
              <Dato l="Registros incompletos" v={cantidad(d.operaciones.registros_incompletos)}
                    n="quedan fuera de las curvas" alerta={d.operaciones.registros_incompletos > 0} />
            </div>
          </Bloque>

          {/* ---------- 6 · desarrollo ---------- */}
          <Bloque n="6" titulo="Desarrollo">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Dato l="Oportunidades nuevas" v={cantidad(d.desarrollo.oportunidades_nuevas)} />
              <Dato l="En screening"         v={cantidad(d.desarrollo.en_screening)} />
              <Dato l="Factibilidades activas" v={cantidad(d.desarrollo.factibilidades_activas)} />
              <Dato l="Aprobadas"            v={cantidad(d.desarrollo.aprobadas)} />
            </div>
          </Bloque>

          {/* ---------- lo que no se pudo calcular ---------- */}
          {d.notas.length > 0 && (
            <section className="tarjeta p-5">
              <h2 className="rotulo">Lo que este informe no puede decir</h2>
              <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
                Está aquí para que un hueco no se lea como un cero. Un informe que rellena
                sus huecos miente justo en los huecos.
              </p>
              <ul className="grid gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {d.notas.map((n, i) => (
                  <li key={i} className="flex gap-2.5 items-start rounded-xl px-3 py-2.5"
                      style={{ background: 'var(--color-sunk)', fontSize: 'var(--texto-md)', lineHeight: 1.45 }}>
                    <span className="rounded-full shrink-0 mt-1.5"
                          style={{ width: 5, height: 5, background: 'var(--color-aviso)' }} />
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- piezas */

const Bloque = ({ n, titulo, nota, children }:
  { n: string; titulo: string; nota?: string; children: React.ReactNode }) => (
  <section className="tarjeta p-5">
    <h2 className="rotulo">{n} · {titulo}</h2>
    {nota && <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>{nota}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

const Dato = ({ l, v, n, alerta }:
  { l: string; v: string; n?: string; alerta?: boolean }) => (
  <div className="tarjeta p-4">
    <div className="rotulo">{l}</div>
    <div className="cifra-grande mt-2" style={{ color: alerta ? 'var(--color-danger)' : undefined }}>{v}</div>
    {n && <div className="mt-1.5" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>{n}</div>}
  </div>
);

const Nada = ({ texto }: { texto: string }) => (
  <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>{texto}</p>
);
