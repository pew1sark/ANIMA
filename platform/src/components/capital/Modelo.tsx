import { useEffect, useMemo, useState } from 'react';
import { cargarModelo, listarModelos, listarProyectos, validarModelo,
         marcarValidado, nuevaVersion, regenerar,
         type ModeloCalculado, type ModeloBreve, type ProyectoBreve,
         type Aviso, type LineaModelo, type Naturaleza } from '@/services/capital.service';
import { TarjetaCifra, Avisos, Elige } from '@/components/capital/Cifra';
import { dinero, dineroCorto, cantidad, mesCorto } from '@/lib/formato';

/* EL MODELO FINANCIERO
   ---------------------------------------------------------------------------
   Es la pantalla que el motor de datos no sabe dibujar. El motor hace filas con
   ficha; esto es una MATRIZ: conceptos en las filas, meses en las columnas, y
   un estado de resultados derivado debajo.

   Tres decisiones que la explican:

   1 · LA VERSIÓN ES VISIBLE Y SE ELIGE. Arriba se escoge escenario y versión.
       Un modelo validado se puede mirar pero no tocar —lo impide la base, no
       esta pantalla— y para seguir trabajando se crea una versión nueva. Así
       "lo que le mostramos al inversionista en agosto" sigue existiendo.

   2 · LAS CELDAS CORREGIDAS A MANO SE MARCAN. Una celda con `origen: manual`
       lleva un punto. Regenerar la matriz no la pisa, y quien la mira sabe que
       ese mes no salió de la fórmula.

   3 · NINGÚN INDICADOR SIN FÓRMULA. Las tarjetas de arriba se abren y muestran
       de qué está hecha cada cifra. No se recalcula nada aquí: viene todo de
       `ci_modelo_calculado()`. */

const ORDEN: Naturaleza[] = ['ingreso', 'costo_directo', 'gasto_operativo', 'depreciacion', 'inversion'];

const NOMBRE: Record<Naturaleza, string> = {
  ingreso: 'Ingresos',
  costo_directo: 'Costos directos',
  gasto_operativo: 'Gastos operativos',
  depreciacion: 'Depreciación',
  inversion: 'Inversión'
};

/* Las filas derivadas del estado de resultados, en el orden en que se leen.
   `clave` es el campo del mes; `fuerte` marca las tres cifras que alguien
   busca primero y que por eso van en negrita. */
const DERIVADAS: { clave: keyof ModeloCalculado['meses'][number]; nombre: string; fuerte?: boolean }[] = [
  { clave: 'margen_bruto',   nombre: 'Margen bruto' },
  { clave: 'ebitda',         nombre: 'EBITDA', fuerte: true },
  { clave: 'ebit',           nombre: 'EBIT' },
  { clave: 'impuesto',       nombre: 'Impuesto' },
  { clave: 'fcl',            nombre: 'Flujo de caja libre', fuerte: true },
  { clave: 'caja_acumulada', nombre: 'Caja acumulada', fuerte: true }
];

export function ModeloFinanciero({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [proyectos, setProyectos] = useState<ProyectoBreve[]>([]);
  const [proyecto, setProyecto] = useState('');
  const [modelos, setModelos] = useState<ModeloBreve[]>([]);
  const [modelo, setModelo] = useState('');
  const [d, setD] = useState<ModeloCalculado | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [tic, setTic] = useState(0);

  useEffect(() => {
    let vivo = true;
    listarProyectos(companyId)
      .then(p => { if (!vivo) return; setProyectos(p); setProyecto(a => a || (p[0]?.id ?? '')); })
      .catch(e => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  useEffect(() => {
    if (!proyecto) { setModelos([]); setModelo(''); setD(null); return; }
    let vivo = true;
    listarModelos(proyecto)
      .then(m => { if (!vivo) return; setModelos(m); setModelo(m[0]?.id ?? ''); })
      .catch(e => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [proyecto, tic]);

  useEffect(() => {
    if (!modelo) { setD(null); setAvisos([]); return; }
    let vivo = true;
    setCargando(true); setError(null);
    Promise.all([cargarModelo(modelo), validarModelo(modelo)])
      .then(([m, a]) => { if (!vivo) return; setD(m); setAvisos(a); })
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar el modelo.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [modelo, tic]);

  const congelado = d?.modelo.estado === 'validado';
  const puedeTocar = puedeEditar && !congelado;

  async function accion(nombre: string, fn: () => Promise<unknown>) {
    setOcupado(nombre); setError(null);
    try { await fn(); setTic(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción.'); }
    finally { setOcupado(null); }
  }

  async function validar() {
    if (!modelo) return;
    await accion('validar', async () => {
      const r = await marcarValidado(modelo);
      setAvisos(r.avisos);
      if (!r.validado) {
        setError(`No se puede validar: hay ${r.bloqueantes} problema(s) que lo impiden. Están listados abajo.`);
      }
    });
  }

  if (!cargando && proyectos.length === 0) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Todavía no hay proyectos</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Un modelo financiero cuelga de un escenario, y un escenario de un proyecto.
          Empieza creando el proyecto en la pestaña <b>Proyectos</b>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 aparece">
      {/* ---------- qué se está mirando ---------- */}
      <section className="tarjeta p-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Elige label="Proyecto" valor={proyecto} onChange={setProyecto}
                 opciones={proyectos} nombre={p => p.name} />
          <Elige label="Escenario y versión" valor={modelo} onChange={setModelo}
                 opciones={modelos}
                 nombre={m => `${m.escenario} · v${m.version}${m.label ? ` — ${m.label}` : ''}` +
                              (m.state === 'validado' ? ' ✓' : '')} />
          {d && (
            <div className="grid gap-1">
              <span className="rotulo">Estado</span>
              <div className="flex items-center gap-2 flex-wrap pt-1.5">
                <span className={`marca ${congelado ? 'marca-ok' : 'marca-aviso'}`}>
                  {congelado ? 'Validado' : 'Borrador'}
                </span>
                <span className="text-[12.5px] text-faint">
                  {d.modelo.meses} meses desde {mesCorto(d.modelo.inicio)} · {d.modelo.moneda}
                </span>
              </div>
            </div>
          )}
        </div>

        {d && (
          <div className="flex gap-2 flex-wrap items-center">
            {puedeTocar && (
              <>
                <button className="b b-sec b-sm" disabled={!!ocupado}
                        onClick={() => accion('regenerar', () => regenerar(modelo))}
                        title="Vuelve a expandir las líneas a sus meses. No pisa las celdas corregidas a mano.">
                  {ocupado === 'regenerar' ? '…' : 'Recalcular la matriz'}
                </button>
                <button className="b b-pri b-sm" disabled={!!ocupado} onClick={validar}>
                  {ocupado === 'validar' ? '…' : 'Marcar como validado'}
                </button>
              </>
            )}
            {puedeEditar && (
              <button className="b b-sec b-sm" disabled={!!ocupado}
                      onClick={() => accion('version', () => nuevaVersion(modelo))}
                      title="Copia este modelo entero en una versión nueva, en borrador.">
                {ocupado === 'version' ? '…' : 'Crear versión nueva'}
              </button>
            )}
            {congelado && (
              <span className="text-[12.5px] text-muted">
                Validado: no se toca. Para seguir trabajando, crea una versión nueva.
              </span>
            )}
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="entra rounded-xl px-3.5 py-2.5 text-[13px]"
           style={{ color: 'var(--color-danger)',
                    background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)' }}>
          {error}
        </p>
      )}

      {cargando && (
        <div className="grid gap-4" aria-busy="true">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 100 }} />)}
          </div>
          <div className="tarjeta" style={{ height: 300 }} />
        </div>
      )}

      {!cargando && !d && modelo === '' && proyecto !== '' && (
        <div className="tarjeta p-8">
          <p className="titular" style={{ fontSize: 20 }}>Este proyecto no tiene modelo todavía</p>
          <p className="subtitulo mt-1.5 max-w-[58ch]">
            Crea un escenario en la pestaña <b>Escenarios</b> y su primera versión aparecerá aquí.
          </p>
        </div>
      )}

      {!cargando && d && (
        <>
          {/* ---------- 1 · la respuesta ---------- */}
          <section className="grid gap-2.5">
            <h2 className="rotulo">Resultado del horizonte · {d.modelo.meses} meses</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {d.indicadores.map(i => (
                <TarjetaCifra key={i.clave} ind={i} moneda={d.modelo.moneda} />
              ))}
            </div>
            <p className="text-[12px] text-faint">
              Pulsa cualquier tarjeta para ver la fórmula y los datos con los que se calculó.
            </p>
          </section>

          {/* ---------- 2 · qué está torcido ---------- */}
          <Avisos avisos={avisos} titulo={avisos.length ? 'Revisiones sobre este modelo' : undefined} />

          {/* ---------- 3 · los supuestos ---------- */}
          <Supuestos escenario={d.escenario} />

          {/* ---------- 4 · la matriz ---------- */}
          <Matriz d={d} />
        </>
      )}
    </div>
  );
}

/* Los supuestos del escenario, tal como se guardaron. Se muestran crudos a
   propósito: son de cada negocio y ninguna lista fija los cubre, así que
   traducirlos aquí obligaría a mantener un diccionario que siempre va tarde. */
function Supuestos({ escenario }: { escenario: ModeloCalculado['escenario'] }) {
  const pares = Object.entries(escenario.supuestos ?? {});
  if (pares.length === 0) {
    return (
      <section className="tarjeta p-4">
        <h2 className="rotulo">Supuestos del escenario «{escenario.nombre}»</h2>
        <p className="text-[12.5px] text-muted mt-1.5 max-w-[62ch]">
          Este escenario no declara supuestos. Un escenario sin supuestos escritos no
          se puede comparar con otro ni defender ante un tercero.
        </p>
      </section>
    );
  }
  return (
    <section className="tarjeta p-4">
      <h2 className="rotulo">Supuestos del escenario «{escenario.nombre}»</h2>
      <div className="grid gap-x-6 gap-y-1.5 mt-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {pares.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2 text-[12.5px]">
            <span className="text-faint truncate">{k.replace(/_/g, ' ')}</span>
            <b className="ml-auto tabular-nums shrink-0">
              {typeof v === 'number' ? cantidad(v, 2) : String(v)}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}

/* LA MATRIZ. Conceptos en las filas, meses en las columnas.
   La primera columna queda anclada al desplazar —clase `ancla`, la misma que
   usa el motor de datos— porque una matriz de 36 columnas sin ancla obliga a
   recordar en qué fila se está. */
function Matriz({ d }: { d: ModeloCalculado }) {
  const [compacta, setCompacta] = useState(true);
  const moneda = d.modelo.moneda;

  /* Doce meses caben y se leen. El horizonte entero son 36 o 60 columnas: útil
     para revisar, ilegible como vista por defecto. */
  const meses = useMemo(
    () => compacta ? d.meses.slice(0, 12) : d.meses, [d.meses, compacta]);
  const claves = meses.map(m => m.periodo);

  const grupos = useMemo(() => ORDEN.map(k => ({
    kind: k,
    lineas: d.lineas.filter(l => l.kind === k)
  })).filter(g => g.lineas.length > 0), [d.lineas]);

  const plata = (v: number) => dineroCorto(v, moneda);

  return (
    <section className="tarjeta p-5 grid gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h2 className="rotulo">Matriz mensual</h2>
          <p className="text-[12.5px] text-faint mt-1">
            {d.lineas.length} línea(s) · {d.meses.length} meses · cifras en {moneda}
          </p>
        </div>
        {d.meses.length > 12 && (
          <button className="b b-sec b-sm ml-auto" onClick={() => setCompacta(c => !c)}>
            {compacta ? `Ver los ${d.meses.length} meses` : 'Ver los primeros 12'}
          </button>
        )}
      </div>

      <div className="desliza -mx-5 px-5">
        <table className="tabla">
          <thead>
            <tr>
              <th className="ancla">Concepto</th>
              <th className="num">Total</th>
              {claves.map(k => <th key={k} className="num" style={{ whiteSpace: 'nowrap' }}>{mesCorto(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <FilasDeGrupo key={g.kind} kind={g.kind} lineas={g.lineas}
                            claves={claves} meses={meses} plata={plata} moneda={moneda} />
            ))}

            {/* El estado de resultados derivado. Va debajo de las líneas
                porque es su consecuencia, no su encabezado. */}
            <tr><td colSpan={claves.length + 2} style={{ height: 10 }} /></tr>
            {DERIVADAS.map(f => (
              <tr key={String(f.clave)}>
                <td className="ancla principal" style={{ fontWeight: f.fuerte ? 800 : 600 }}>
                  {f.nombre}
                </td>
                <td className="num cifra" style={{ fontWeight: f.fuerte ? 800 : 600 }}>
                  {f.clave === 'caja_acumulada'
                    ? '—'
                    : plata(d.meses.reduce((s, m) => s + Number(m[f.clave] ?? 0), 0))}
                </td>
                {meses.map(m => {
                  const v = Number(m[f.clave] ?? 0);
                  return (
                    <td key={m.periodo} className="num cifra"
                        style={{ fontWeight: f.fuerte ? 800 : 600,
                                 color: v < 0 ? 'var(--color-danger)' : undefined }}>
                      {plata(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-faint">
        El total de «Caja acumulada» no se suma: es un saldo, no un flujo. Las celdas
        con punto (·) las corrigió una persona y el recálculo no las toca.
      </p>
    </section>
  );
}

function FilasDeGrupo({ kind, lineas, claves, meses, plata, moneda }: {
  kind: Naturaleza; lineas: LineaModelo[]; claves: string[];
  meses: ModeloCalculado['meses']; plata: (v: number) => string; moneda: string;
}) {
  const total = lineas.reduce((s, l) => s + Number(l.total ?? 0), 0);
  const porMes = (k: string) => lineas.reduce((s, l) => s + Number(l.meses[k]?.monto ?? 0), 0);

  return (
    <>
      <tr>
        <td className="ancla principal" style={{ fontWeight: 800 }}>{NOMBRE[kind]}</td>
        <td className="num cifra" style={{ fontWeight: 800 }}>{plata(total)}</td>
        {claves.map(k => (
          <td key={k} className="num cifra" style={{ fontWeight: 800 }}>{plata(porMes(k))}</td>
        ))}
      </tr>
      {lineas.map(l => (
        <tr key={l.id}>
          <td className="ancla" style={{ paddingLeft: 22 }}>
            <span title={descripcion(l, moneda)}>{l.name}</span>
            {l.unidad && <span className="ml-2 text-[11px] text-faint">{l.unidad}</span>}
          </td>
          <td className="num cifra">{plata(Number(l.total ?? 0))}</td>
          {claves.map(k => {
            const c = l.meses[k];
            return (
              <td key={k} className="num cifra">
                {c ? plata(c.monto) : '—'}
                {c?.origen === 'manual' && (
                  <span className="ml-1" style={{ color: 'var(--color-accent)' }} title="Corregido a mano">·</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
      <tr aria-hidden="true"><td colSpan={meses.length + 2} style={{ height: 6 }} /></tr>
    </>
  );
}

/* De dónde sale una línea, en una frase. Va en el `title` de la fila: es la
   trazabilidad al nivel del concepto, igual que las tarjetas la dan al nivel
   del indicador. */
function descripcion(l: LineaModelo, moneda: string): string {
  const crece = l.growth_pct ? ` · crece ${cantidad(l.growth_pct, 2)}% al mes` : '';
  const cada = l.frequency === 'unica' ? ' · una sola vez'
             : l.frequency === 'anual' ? ' · una vez al año' : '';
  if (l.driver === 'cantidad_precio') {
    return `${cantidad(l.quantity ?? 0, 2)} × ${dinero(l.unit_price ?? 0, moneda)}${crece}${cada}`;
  }
  if (l.driver === 'pct_ingresos') {
    return `${cantidad(l.pct ?? 0, 2)}% de los ingresos del mes${cada}`;
  }
  return `${dinero(l.amount ?? 0, moneda)} por período${crece}${cada}`;
}
