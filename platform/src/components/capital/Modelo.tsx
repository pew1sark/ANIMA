import { useEffect, useMemo, useState } from 'react';
import { cargarModelo, listarModelos, listarProyectos, validarModelo,
         marcarValidado, nuevaVersion, regenerar,
         type ModeloCalculado, type ModeloBreve, type ProyectoBreve,
         type Aviso, type LineaModelo, type Naturaleza } from '@/services/capital.service';
import { TarjetaCifra, Avisos, Elige, Cabecera } from '@/components/capital/Cifra';
import { dinero, dineroCorto, cantidad, mesCorto } from '@/lib/formato';

/* EL MODELO FINANCIERO
   ---------------------------------------------------------------------------
   Es la pantalla que el motor de datos no sabe dibujar. El motor hace filas con
   ficha; esto es una MATRIZ: conceptos en las filas, meses en las columnas, y
   un estado de resultados derivado debajo.

   Cuatro decisiones que la explican:

   1 · LA VERSIÓN ES VISIBLE Y SE ELIGE. Arriba se escoge escenario y versión.
       Un modelo validado se puede mirar pero no tocar —lo impide la base, no
       esta pantalla— y para seguir trabajando se crea una versión nueva. Así
       "lo que le mostramos al inversionista en agosto" sigue existiendo.

   2 · CUATRO CIFRAS MANDAN. EBITDA, VAN, TIR y payback en grande; las otras
       doce, compactas y agrupadas. Dieciséis tarjetas iguales obligan a
       leerlas todas para encontrar la que se vino a buscar.

   3 · LAS CIFRAS NO SE PARTEN. En la matriz, cada número ocupa una línea
       aunque la columna tenga que ensancharse: "$22" arriba y "mil" abajo se
       leen como dos cosas distintas. Para eso el contenedor se desliza, y se
       ve que se desliza.

   4 · NINGÚN INDICADOR SIN FÓRMULA. Las tarjetas se abren y muestran de qué
       está hecha cada cifra. No se recalcula nada aquí: viene todo de
       `ci_modelo_calculado()`. */

const ORDEN: Naturaleza[] = ['ingreso', 'costo_directo', 'gasto_operativo', 'depreciacion', 'inversion'];

const NOMBRE: Record<Naturaleza, string> = {
  ingreso: 'Ingresos',
  costo_directo: 'Costos directos',
  gasto_operativo: 'Gastos operativos',
  depreciacion: 'Depreciación',
  inversion: 'Inversión'
};

/** Lo que un inversionista pregunta primero. */
const HEROICOS = ['ebitda', 'van', 'tir', 'payback'];

/** El resto, agrupado por la pregunta que responde. */
const GRUPOS: { titulo: string; claves: string[] }[] = [
  { titulo: 'El resultado', claves: ['ingresos', 'cogs', 'margen_bruto', 'margen_pct', 'ebitda_pct', 'ebit'] },
  { titulo: 'La caja y el retorno', claves: ['capex', 'necesidad_capital', 'burn_rate', 'runway', 'punto_equilibrio', 'roi'] }
];

/* Las filas derivadas del estado de resultados, en el orden en que se leen.
   `fuerte` marca las tres cifras que alguien busca primero. */
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

  const heroicos = d?.indicadores.filter(i => HEROICOS.includes(i.clave)) ?? [];

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo={d?.proyecto.nombre ?? 'Modelo financiero'}
        nota={d ? `${d.escenario.nombre} · versión ${d.modelo.version}${d.modelo.label ? ` — ${d.modelo.label}` : ''} · ${d.modelo.meses} meses desde ${mesCorto(d.modelo.inicio)}` : undefined}
        marcas={d && (
          <>
            <span className={`marca ${congelado ? 'marca-ok' : 'marca-aviso'}`}>
              {congelado ? 'Validado' : 'Borrador'}
            </span>
            <span className="marca marca-acento">{d.modelo.moneda}</span>
          </>
        )}
        acciones={d && (
          <>
            {puedeTocar && (
              <>
                <button className="b b-sec b-sm" disabled={!!ocupado}
                        onClick={() => accion('regenerar', () => regenerar(modelo))}
                        title="Vuelve a expandir las líneas a sus meses. No pisa las celdas corregidas a mano.">
                  {ocupado === 'regenerar' ? '…' : 'Recalcular'}
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
                {ocupado === 'version' ? '…' : 'Nueva versión'}
              </button>
            )}
            <button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>
          </>
        )} />

      <div className="filtros no-imprimir">
        <Elige label="Proyecto" valor={proyecto} onChange={setProyecto}
               opciones={proyectos} nombre={p => p.name} />
        <Elige label="Escenario y versión" valor={modelo} onChange={setModelo}
               opciones={modelos}
               nombre={m => `${m.escenario} · v${m.version}${m.label ? ` — ${m.label}` : ''}` +
                            (m.state === 'validado' ? '  ✓' : '')} />
        {congelado && (
          <p className="text-[12px] text-muted self-center max-w-[34ch]">
            Validado: no se toca. Para seguir trabajando, crea una versión nueva.
          </p>
        )}
      </div>

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 108 }} />)}
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
          {/* ---------- 1 · las cuatro que mandan ---------- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heroicos.map(i => <TarjetaCifra key={i.clave} ind={i} moneda={d.modelo.moneda} destacada />)}
          </div>

          {/* ---------- 2 · qué está torcido ---------- */}
          <Avisos avisos={avisos} titulo={avisos.length ? 'Revisiones sobre este modelo' : undefined} />

          {/* ---------- 3 · el resto del cuadro ---------- */}
          {GRUPOS.map(g => {
            const cifras = d.indicadores.filter(i => g.claves.includes(i.clave));
            if (cifras.length === 0) return null;
            return (
              <section key={g.titulo} className="grid gap-2.5">
                <h2 className="rotulo rotulo-tenue">{g.titulo}</h2>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {cifras.map(i => <TarjetaCifra key={i.clave} ind={i} moneda={d.modelo.moneda} />)}
                </div>
              </section>
            );
          })}
          <p className="text-[12px] text-faint -mt-1">
            Pulsa la <b>i</b> de cualquier tarjeta para ver la fórmula y los datos con los que se calculó.
          </p>

          {/* ---------- 4 · los supuestos ---------- */}
          <Supuestos escenario={d.escenario} modelo={d.modelo} />

          {/* ---------- 5 · la matriz ---------- */}
          <Matriz d={d} />
        </>
      )}
    </div>
  );
}

/* Los supuestos del escenario, tal como se guardaron. Se muestran crudos a
   propósito: son de cada negocio y ninguna lista fija los cubre, así que
   traducirlos aquí obligaría a mantener un diccionario que siempre va tarde. */
function Supuestos({ escenario, modelo }: {
  escenario: ModeloCalculado['escenario']; modelo: ModeloCalculado['modelo'];
}) {
  const pares = Object.entries(escenario.supuestos ?? {});
  const parametros: [string, string][] = [
    ['Saldo inicial de caja', modelo.saldo_inicial == null ? '— sin declarar' : dinero(modelo.saldo_inicial, modelo.moneda)],
    ['Tasa de descuento', modelo.tasa_descuento == null ? '— sin declarar' : `${cantidad(modelo.tasa_descuento, 2)}% anual`],
    ['Tasa de impuesto', modelo.tasa_impuesto == null ? '—' : `${cantidad(modelo.tasa_impuesto, 2)}%`]
  ];

  return (
    <section className="tarjeta p-5 grid gap-3">
      <h2 className="rotulo">Supuestos · escenario «{escenario.nombre}»</h2>

      <div className="grid gap-x-7 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {parametros.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2 text-[12.5px] py-1
                                  border-b border-line last:border-0">
            <span className="text-muted truncate">{k}</span>
            <b className="ml-auto tabular-nums shrink-0"
               style={{ color: v.startsWith('—') ? 'var(--color-aviso)' : undefined }}>{v}</b>
          </div>
        ))}
      </div>

      {pares.length === 0 ? (
        <p className="text-[12.5px] text-muted max-w-[62ch]">
          Este escenario no declara supuestos propios. Uno sin supuestos escritos no se
          puede comparar con otro ni defender ante un tercero.
        </p>
      ) : (
        <div className="grid gap-x-7 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {pares.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 text-[12.5px] py-1
                                    border-b border-line last:border-0">
              <span className="text-faint truncate">{k.replace(/_/g, ' ')}</span>
              <b className="ml-auto tabular-nums shrink-0">
                {typeof v === 'number' ? cantidad(v, 2) : String(v)}
              </b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* LA MATRIZ. Conceptos en las filas, meses en las columnas.
   La primera columna queda anclada al desplazar —clase `ancla`, la misma que
   usa el motor de datos— porque una matriz de treinta y seis columnas sin
   ancla obliga a recordar en qué fila se está. */
function Matriz({ d }: { d: ModeloCalculado }) {
  const [ventana, setVentana] = useState(12);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const moneda = d.modelo.moneda;

  const meses = useMemo(() => d.meses.slice(0, ventana), [d.meses, ventana]);
  const claves = meses.map(m => m.periodo);

  const grupos = useMemo(() => ORDEN.map(k => ({
    kind: k,
    lineas: d.lineas.filter(l => l.kind === k)
  })).filter(g => g.lineas.length > 0), [d.lineas]);

  /* La unidad de negocio solo se escribe cuando hay más de una. Repetir
     «Membresía» en las nueve líneas de un proyecto que tiene una sola unidad
     no informa, y encima le roba a cada nombre el ancho que necesita para no
     terminar en «M…». */
  const variasUnidades = useMemo(
    () => new Set(d.lineas.map(l => l.unidad ?? '')).size > 1, [d.lineas]);

  const plata = (v: number) => dineroCorto(v, moneda);
  const alterna = (k: string) =>
    setColapsados(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <section className="tarjeta p-5 grid gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h2 className="rotulo">Matriz mensual</h2>
          <p className="text-[12.5px] text-faint mt-1">
            {d.lineas.length} línea{d.lineas.length === 1 ? '' : 's'} · {d.meses.length} meses ·
            cifras abreviadas en {moneda}
          </p>
        </div>
        {d.meses.length > 12 && (
          <div className="grupo ml-auto no-imprimir">
            {[12, 24, d.meses.length].filter((v, i, a) => a.indexOf(v) === i && v <= d.meses.length)
              .map(v => (
                <button key={v} aria-pressed={ventana === v} onClick={() => setVentana(v)}>
                  {v === d.meses.length ? `Todo (${v})` : `${v} meses`}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="desliza -mx-5 px-5">
        <table className="tabla tabla-densa">
          <thead>
            <tr>
              <th className="ancla" style={{ minWidth: 230 }}>Concepto</th>
              <th className="num" style={{ minWidth: 96 }}>Total</th>
              {claves.map(k => <th key={k} className="num">{mesCorto(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <FilasDeGrupo key={g.kind} kind={g.kind} lineas={g.lineas}
                            claves={claves} plata={plata} moneda={moneda}
                            conUnidad={variasUnidades}
                            colapsado={colapsados.has(g.kind)} alterna={() => alterna(g.kind)} />
            ))}

            {/* El estado de resultados derivado. Va debajo de las líneas
                porque es su consecuencia, no su encabezado. */}
            <tr aria-hidden="true"><td colSpan={claves.length + 2} style={{ height: 14, borderTop: 0 }} /></tr>
            {DERIVADAS.map(f => (
              <tr key={String(f.clave)}>
                <td className="ancla principal" style={{ fontWeight: f.fuerte ? 800 : 600 }}>
                  <span className="recorta">{f.nombre}</span>
                </td>
                <td className="num cifra" style={{ fontWeight: f.fuerte ? 800 : 600 }}>
                  {f.clave === 'caja_acumulada'
                    ? <span className="text-faint" title="Es un saldo, no un flujo: no se suma">—</span>
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

function FilasDeGrupo({ kind, lineas, claves, plata, moneda, conUnidad, colapsado, alterna }: {
  kind: Naturaleza; lineas: LineaModelo[]; claves: string[];
  plata: (v: number) => string; moneda: string; conUnidad: boolean;
  colapsado: boolean; alterna: () => void;
}) {
  const total = lineas.reduce((s, l) => s + Number(l.total ?? 0), 0);
  const porMes = (k: string) => lineas.reduce((s, l) => s + Number(l.meses[k]?.monto ?? 0), 0);

  return (
    <>
      <tr className="grupo-fila">
        <td className="ancla">
          <button type="button" onClick={alterna}
                  className="flex items-center gap-2 w-full text-left"
                  aria-expanded={!colapsado}
                  title={colapsado ? 'Ver las líneas' : 'Ocultar las líneas'}>
            <span className="text-[10px] text-faint w-2.5 shrink-0 no-imprimir">
              {colapsado ? '▸' : '▾'}
            </span>
            <span className="recorta">{NOMBRE[kind]}</span>
            <span className="text-[10.5px] text-faint font-normal shrink-0">{lineas.length}</span>
          </button>
        </td>
        <td className="num cifra">{plata(total)}</td>
        {claves.map(k => <td key={k} className="num cifra">{plata(porMes(k))}</td>)}
      </tr>

      {!colapsado && lineas.map(l => (
        <tr key={l.id}>
          <td className="ancla" style={{ paddingLeft: 30 }}>
            <span className="recorta" title={`${l.name}${l.unidad ? ` · ${l.unidad}` : ''} — ${descripcion(l, moneda)}`}>
              {l.name}
              {conUnidad && l.unidad && (
                <span className="ml-2 text-[11px] text-faint">{l.unidad}</span>
              )}
            </span>
          </td>
          <td className="num cifra">{plata(Number(l.total ?? 0))}</td>
          {claves.map(k => {
            const c = l.meses[k];
            return (
              <td key={k} className="num cifra">
                {c ? plata(c.monto) : <span className="text-faint">—</span>}
                {c?.origen === 'manual' && (
                  <span className="ml-1" style={{ color: 'var(--color-accent)' }}
                        title="Corregido a mano · el recálculo no lo toca">·</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
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
