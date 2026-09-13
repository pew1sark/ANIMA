import { useEffect, useMemo, useState } from 'react';
import { listarDesarrollos, listarModelos, crearModelo, guardarModelo,
         cargarPrefactibilidad, guardarPeriodo, borrarPeriodo, sembrarCurva,
         type DesarrolloBreve, type ModeloREI, type Prefactibilidad as Datos } from '@/services/inmobiliaria.service';
import { TarjetaCifra, Avisos, Elige, Cabecera, escribe } from '@/components/capital/Cifra';
import { cantidad } from '@/lib/formato';

/* LA HOJA DE PREFACTIBILIDAD
   ---------------------------------------------------------------------------
   La pantalla que dice si un proyecto se sostiene. Arriba los supuestos, abajo
   el flujo, y en medio las cifras que salen de los dos.

   Lo que la separa de una planilla —y el motivo de que exista— es que ninguno
   de los números de en medio está escrito en ninguna parte. Se recalculan en
   PostgreSQL cada vez que se pide, desde los supuestos guardados, y cada uno
   se abre y muestra la fórmula con la que salió y los datos que entraron.
   Cuando alguien mueve el precio por m², el margen ya cambió: no hay una celda
   que quedó con el número viejo.

   LOS SUPUESTOS SON DE DOS PISOS. Cada porcentaje puede venir de la
   organización —lo que la casa usa por defecto— o pisarse para este proyecto.
   Vacío significa «usa el de la organización», y por eso la pantalla muestra
   al lado el valor que de verdad entró al cálculo: sin eso, un campo en blanco
   se lee como un dato faltante cuando en realidad es una decisión.

   VERSIONES, NO CORRECCIONES. Un modelo validado no se edita: se duplica. El
   modelo con el que se aprobó un proyecto tiene que seguir diciendo lo que
   decía el día que se aprobó. */

const HEROICAS = ['margen', 'tir', 'van', 'dscr'];

export function PrefactibilidadProyecto({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [desarrollos, setDesarrollos] = useState<DesarrolloBreve[]>([]);
  const [desarrollo, setDesarrollo] = useState('');
  const [modelos, setModelos] = useState<ModeloREI[]>([]);
  const [modelo, setModelo] = useState('');
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const actual = useMemo(() => modelos.find(m => m.id === modelo) ?? null, [modelos, modelo]);
  const editable = puedeEditar && actual?.state === 'borrador';

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    listarDesarrollos(companyId)
      .then(ds => {
        if (!vivo) return;
        setDesarrollos(ds);
        setDesarrollo(a => a || (ds[0]?.id ?? ''));
      })
      .catch(e => vivo && setError(e.message ?? 'No se pudieron cargar los desarrollos.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  useEffect(() => {
    if (!desarrollo) { setModelos([]); setModelo(''); setD(null); return; }
    let vivo = true;
    listarModelos(desarrollo)
      .then(ms => {
        if (!vivo) return;
        setModelos(ms);
        setModelo(ms[0]?.id ?? '');
        if (ms.length === 0) setD(null);
      })
      .catch(e => vivo && setError(e.message ?? 'No se pudieron cargar los modelos.'));
    return () => { vivo = false; };
  }, [desarrollo]);

  async function refrescar(id = modelo) {
    if (!id) { setD(null); return; }
    setError(null);
    try {
      const r = await cargarPrefactibilidad(id);
      if (!r) { setSinAcceso(true); return; }
      setD(r);
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo calcular la prefactibilidad.');
    }
  }

  useEffect(() => { void refrescar(modelo); }, [modelo]);

  async function nuevaVersion(copiar: boolean) {
    if (!desarrollo) return;
    setOcupado(true); setError(null); setAviso(null);
    try {
      const m = await crearModelo(companyId, desarrollo, copiar ? actual : null);
      const ms = await listarModelos(desarrollo);
      setModelos(ms); setModelo(m.id);
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo crear la versión.');
    } finally { setOcupado(false); }
  }

  async function cambiar(campo: keyof ModeloREI, valor: unknown) {
    if (!actual) return;
    setOcupado(true); setError(null);
    try {
      await guardarModelo(actual.id, { [campo]: valor } as Partial<ModeloREI>);
      setModelos(ms => ms.map(m => (m.id === actual.id ? { ...m, [campo]: valor } as ModeloREI : m)));
      await refrescar(actual.id);
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo guardar el supuesto.');
    } finally { setOcupado(false); }
  }

  async function curva() {
    if (!actual) return;
    setOcupado(true); setError(null); setAviso(null);
    try {
      const n = await sembrarCurva(actual.id);
      setAviso(n === 0
        ? 'El modelo ya tenía periodos cargados: no se tocó ninguno.'
        : `Se sembraron ${n} periodos con la curva estándar. Reemplázalos con el cronograma real de obra y el plan de ventas en cuanto existan.`);
      await refrescar(actual.id);
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo sembrar la curva.');
    } finally { setOcupado(false); }
  }

  if (sinAcceso) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Esta pantalla no es para tu nivel de acceso</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Aquí está el margen del proyecto, el costo real de obra y el punto de
          equilibrio. Es el único lugar del módulo donde hasta mirar exige nivel de
          dirección, y es a propósito: quien muestra un inmueble no necesita saber con
          cuánto margen se vende el edificio.
        </p>
      </div>
    );
  }

  if (cargando) return <div className="tarjeta aparece" style={{ height: 260 }} aria-busy="true" />;

  if (desarrollos.length === 0) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 19 }}>Todavía no hay desarrollos</p>
        <p className="subtitulo mt-1.5 max-w-[62ch]">
          Un modelo de prefactibilidad cuelga de un desarrollo. Crea uno en la pestaña
          <b> Desarrollos</b> —normalmente a partir de una oportunidad que ya pasó la
          calificación— y vuelve aquí.
        </p>
      </div>
    );
  }

  const heroicas = d?.cifras.filter(c => HEROICAS.includes(c.clave)) ?? [];
  const resto    = d?.cifras.filter(c => !HEROICAS.includes(c.clave)) ?? [];
  const moneda   = d?.modelo.moneda ?? '';

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Prefactibilidad"
        nota="Los supuestos se guardan; el margen, la TIR, el VAN y la cobertura se calculan cada vez desde ellos. Pulsa cualquier cifra para ver su fórmula y los datos que entraron."
        marcas={actual && (
          <>
            <span className="marca">v{actual.version}</span>
            <span className={`marca ${actual.state === 'validado' ? 'marca-ok' : ''}`}>{actual.state}</span>
          </>
        )}
        acciones={
          <>
            {puedeEditar && (
              <button className="b b-sec b-sm" onClick={() => nuevaVersion(false)} disabled={ocupado}>
                Nueva versión
              </button>
            )}
            {puedeEditar && actual && (
              <button className="b b-sec b-sm" onClick={() => nuevaVersion(true)} disabled={ocupado}>
                Duplicar esta
              </button>
            )}
            <button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>
          </>
        } />

      <section className="no-imprimir">
        <div className="filtros">
          <Elige label="Desarrollo" valor={desarrollo} onChange={setDesarrollo}
                 opciones={desarrollos} nombre={x => x.name} />
          {modelos.length > 0 && (
            <Elige label="Versión" valor={modelo} onChange={setModelo}
                   opciones={modelos.map(m => ({ id: m.id, n: `v${m.version} · ${m.label ?? 'sin nombre'} · ${m.state}` }))}
                   nombre={x => x.n} ancho={260} />
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}
      {aviso && <p className="entra tarjeta p-4" style={{ fontSize: 'var(--texto-md)' }}>{aviso}</p>}

      {modelos.length === 0 && (
        <div className="tarjeta p-8">
          <p className="titular" style={{ fontSize: 19 }}>Este desarrollo no tiene modelo todavía</p>
          <p className="subtitulo mt-1.5 max-w-[62ch]">
            Un modelo son cuatro supuestos —unidades, área por unidad, precio por m² y
            producto— y una curva de egresos e ingresos. Con eso salen el margen, la TIR,
            el VAN y el veredicto.
          </p>
          {puedeEditar && (
            <button className="b b-pri b-sm mt-4" onClick={() => nuevaVersion(false)} disabled={ocupado}>
              Crear el primero
            </button>
          )}
        </div>
      )}

      {d && actual && (
        <>
          <Avisos avisos={d.alertas} titulo={d.alertas.length ? 'Qué mirar primero' : undefined} />

          <Veredicto d={d} />

          <Supuestos modelo={actual} d={d} editable={!!editable} ocupado={ocupado} cambiar={cambiar} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heroicas.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={moneda} destacada />)}
          </div>

          <section className="grid gap-2.5">
            <h2 className="rotulo rotulo-tenue">Cómo se arma el costo</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {resto.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={moneda} />)}
            </div>
          </section>

          <Flujo d={d} modelo={actual} companyId={companyId} editable={!!editable}
                 ocupado={ocupado} setOcupado={setOcupado} setError={setError}
                 refrescar={() => refrescar(actual.id)} curva={curva} />

          {puedeEditar && actual.state === 'borrador' && (
            <section className="tarjeta p-5 no-imprimir">
              <h2 className="rotulo">Cerrar esta versión</h2>
              <p className="mt-1 text-[12.5px] text-muted max-w-[70ch]">
                Validar la congela: deja de poder editarse y de aceptar cambios en el
                flujo. Es lo que hace que el modelo con el que se aprobó un proyecto siga
                diciendo dentro de un año lo que decía ese día. Para seguir trabajando,
                duplícala.
              </p>
              <button className="b b-sec b-sm mt-3" disabled={ocupado}
                      onClick={() => cambiar('state', 'validado')}>
                Validar versión {actual.version}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* El veredicto va ARRIBA de las cifras y no al final. Es lo que se vino a
   buscar, y enterrarlo bajo catorce tarjetas obliga a leerlas todas para
   encontrar la única frase que resume. */
function Veredicto({ d }: { d: Datos }) {
  const { texto, cumple } = d.veredicto;
  const color = cumple === true ? 'var(--color-ok)' : cumple === false ? 'var(--color-danger)' : 'var(--color-aviso)';
  return (
    <section className="tarjeta p-5" style={{ borderLeft: `3px solid ${color}` }}>
      <h2 className="rotulo">Veredicto</h2>
      <p className="titular mt-1" style={{ fontSize: 19, color }}>{texto}</p>
      <p className="mt-1.5 text-[12.5px] text-muted max-w-[76ch]">
        Se compara contra los cuatro mínimos de la organización: TIR ≥ {pct(d.supuestos.tir_minima)},
        VAN ≥ 0, cobertura ≥ {num(d.supuestos.dscr_minimo)} y margen ≥ {pct(d.supuestos.margen_minimo)}.
        {cumple === null && ' Falta al menos un dato, así que no alcanza para dictaminar — que no es lo mismo que no cumplir.'}
      </p>
    </section>
  );
}

const pct = (v: number | null) => (v == null ? '—' : `${cantidad(v, 2)}%`);
const num = (v: number | null) => (v == null ? '—' : cantidad(v, 2));

/* Un campo de supuesto. Cuando se puede pisar el valor de la organización, se
   muestra al lado el que de verdad entró al cálculo: sin eso, un campo vacío
   se lee como un dato faltante y no como «usa el de la casa». */
function Campo({ label, valor, onGuardar, editable, ayuda, heredado, sufijo }: {
  label: string; valor: number | string | null;
  onGuardar: (v: string) => void; editable: boolean;
  ayuda?: string; heredado?: string; sufijo?: string;
}) {
  const [borrador, setBorrador] = useState(valor == null ? '' : String(valor));
  useEffect(() => { setBorrador(valor == null ? '' : String(valor)); }, [valor]);

  return (
    <label className="grid gap-1.5 min-w-0">
      <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>
        {label}{sufijo ? ` (${sufijo})` : ''}
      </span>
      <input className="campo" inputMode="decimal" value={borrador} disabled={!editable}
             placeholder={heredado ?? ''}
             onChange={e => setBorrador(e.target.value)}
             onBlur={() => { if (borrador !== (valor == null ? '' : String(valor))) onGuardar(borrador); }} />
      {(ayuda || heredado) && (
        <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
          {heredado && valor == null ? `de la organización: ${heredado}` : ayuda}
        </span>
      )}
    </label>
  );
}

function Supuestos({ modelo, d, editable, ocupado, cambiar }: {
  modelo: ModeloREI; d: Datos; editable: boolean; ocupado: boolean;
  cambiar: (campo: keyof ModeloREI, valor: unknown) => void;
}) {
  const puesto = editable && !ocupado;
  const numero = (campo: keyof ModeloREI) => (v: string) =>
    cambiar(campo, v.trim() === '' ? null : Number(v.replace(',', '.')));
  const s = d.supuestos;

  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">Supuestos</h2>
      <p className="mt-1 text-[12.5px] text-faint max-w-[76ch]">
        Los cuatro de arriba son de este proyecto. Los de abajo se pueden dejar vacíos
        para usar los de la organización —que se editan en la pestaña <b>Supuestos</b>— o
        pisarse solo aquí. {!editable && <b>Esta versión no se puede editar.</b>}
      </p>

      <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Unidades" valor={modelo.units} editable={puesto} onGuardar={numero('units')} />
        <Campo label="Área vendible por unidad" sufijo="m²" valor={modelo.avg_area_m2}
               editable={puesto} onGuardar={numero('avg_area_m2')} />
        <Campo label="Precio de venta por m²" valor={modelo.price_m2}
               editable={puesto} onGuardar={numero('price_m2')} />
        <label className="grid gap-1.5 min-w-0">
          <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>Producto</span>
          <select className="campo" value={modelo.product} disabled={!puesto}
                  onChange={e => cambiar('product', e.target.value)}>
            {['vis', 'vip', 'no_vis', 'comercial', 'oficinas', 'lotes', 'turistico', 'otro']
              .map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
            decide qué costo de obra por m² se usa
          </span>
        </label>
      </div>

      <div className="grid gap-3 mt-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Costo del suelo" valor={modelo.land_cost} editable={puesto}
               onGuardar={v => cambiar('land_cost', v.trim() === '' ? 0 : Number(v.replace(',', '.')))}
               ayuda="compra, permuta valorizada o aporte" />
        <Campo label="Costo de obra por m²" valor={modelo.direct_cost_m2} editable={puesto}
               onGuardar={numero('direct_cost_m2')} heredado={s.costo_m2 == null ? 'sin cargar' : cantidad(s.costo_m2, 0)} />
        <Campo label="Indirectos" sufijo="%" valor={modelo.indirect_pct} editable={puesto}
               onGuardar={numero('indirect_pct')} heredado={pct(s.indirectos_pct)} />
        <Campo label="Gastos financieros" sufijo="%" valor={modelo.financial_pct} editable={puesto}
               onGuardar={numero('financial_pct')} heredado={pct(s.financieros_pct)} />
        <Campo label="Gastos comerciales" sufijo="%" valor={modelo.commercial_pct} editable={puesto}
               onGuardar={numero('commercial_pct')} heredado={pct(s.comerciales_pct)} />
        <Campo label="Tasa de descuento" sufijo="% EA" valor={modelo.discount_rate} editable={puesto}
               onGuardar={numero('discount_rate')} heredado={pct(s.wacc)} />
        <Campo label="Preventas exigidas" sufijo="%" valor={modelo.equilibrium_pct} editable={puesto}
               onGuardar={numero('equilibrium_pct')} heredado={pct(s.preventas_pct)} />
        <label className="grid gap-1.5 min-w-0">
          <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>Cada periodo es</span>
          <select className="campo" value={modelo.period_kind} disabled={!puesto}
                  onChange={e => cambiar('period_kind', e.target.value)}>
            <option value="mes">un mes</option>
            <option value="trimestre">un trimestre</option>
            <option value="semestre">un semestre</option>
            <option value="anio">un año</option>
          </select>
          <span className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
            con esto se anualiza la TIR
          </span>
        </label>
      </div>
    </section>
  );
}

/* El flujo. Se carga TODO EN POSITIVO —egresos e ingresos— y el signo lo pone
   el cálculo al armar el vector. Pedirle a quien carga que escriba negativos
   es pedirle que se equivoque, y un signo cambiado no se nota hasta que la TIR
   sale absurda. */
function Flujo({ d, modelo, companyId, editable, ocupado, setOcupado, setError, refrescar, curva }: {
  d: Datos; modelo: ModeloREI; companyId: string; editable: boolean; ocupado: boolean;
  setOcupado: (b: boolean) => void; setError: (s: string | null) => void;
  refrescar: () => Promise<void>; curva: () => Promise<void>;
}) {
  const moneda = d.modelo.moneda;
  const siguiente = d.flujo.length === 0 ? 0 : Math.max(...d.flujo.map(p => p.periodo)) + 1;

  async function guardar(periodo: number, egreso: number, ingreso: number) {
    setOcupado(true); setError(null);
    try {
      await guardarPeriodo(companyId, modelo.id, periodo, egreso, ingreso);
      await refrescar();
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo guardar el periodo.');
    } finally { setOcupado(false); }
  }

  async function quitar(periodo: number) {
    setOcupado(true); setError(null);
    try {
      await borrarPeriodo(modelo.id, periodo);
      await refrescar();
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo borrar el periodo.');
    } finally { setOcupado(false); }
  }

  return (
    <section className="tarjeta p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="rotulo">Flujo de caja</h2>
          <p className="mt-1 text-[12.5px] text-faint max-w-[76ch]">
            Egresos e ingresos por periodo, los dos en positivo. De aquí salen la TIR, el
            VAN y la cobertura. El periodo 0 es el arranque.
          </p>
        </div>
        {editable && (
          <div className="ml-auto flex gap-2 flex-wrap no-imprimir">
            <button className="b b-sec b-sm" onClick={curva} disabled={ocupado}>
              Sembrar curva estándar
            </button>
            <button className="b b-sec b-sm" disabled={ocupado}
                    onClick={() => guardar(siguiente, 0, 0)}>
              Agregar periodo
            </button>
          </div>
        )}
      </div>

      {d.flujo.length === 0
        ? <p className="mt-3 text-[13px] text-muted">
            Sin periodos no hay TIR, VAN ni cobertura: quedan las cifras estáticas y nada
            más. {editable && 'La curva estándar es un punto de partida razonable mientras no exista el cronograma real.'}
          </p>
        : <div className="desliza -mx-5 px-5 mt-3">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="ancla">Periodo</th>
                  <th className="num">Egresos</th>
                  <th className="num">Ingresos</th>
                  <th className="num">Neto</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {d.flujo.map(p => (
                  <FilaFlujo key={p.periodo} p={p} moneda={moneda} editable={editable}
                             ocupado={ocupado} guardar={guardar} quitar={quitar} />
                ))}
                <tr>
                  <td className="ancla principal">Total</td>
                  <td className="num cifra">{escribe(suma(d, 'egreso'), 'dinero', moneda)}</td>
                  <td className="num cifra">{escribe(suma(d, 'ingreso'), 'dinero', moneda)}</td>
                  <td className="num cifra">{escribe(suma(d, 'neto'), 'dinero', moneda)}</td>
                  {editable && <td />}
                </tr>
              </tbody>
            </table>
          </div>}
    </section>
  );
}

const suma = (d: Datos, k: 'egreso' | 'ingreso' | 'neto') =>
  d.flujo.reduce((t, p) => t + Number(p[k] ?? 0), 0);

function FilaFlujo({ p, moneda, editable, ocupado, guardar, quitar }: {
  p: { periodo: number; egreso: number; ingreso: number; neto: number };
  moneda: string; editable: boolean; ocupado: boolean;
  guardar: (periodo: number, egreso: number, ingreso: number) => void;
  quitar: (periodo: number) => void;
}) {
  const [egreso, setEgreso] = useState(String(p.egreso));
  const [ingreso, setIngreso] = useState(String(p.ingreso));
  useEffect(() => { setEgreso(String(p.egreso)); setIngreso(String(p.ingreso)); }, [p.egreso, p.ingreso]);

  const enviar = () => {
    const e = Number(egreso.replace(',', '.')) || 0;
    const i = Number(ingreso.replace(',', '.')) || 0;
    if (e !== Number(p.egreso) || i !== Number(p.ingreso)) guardar(p.periodo, e, i);
  };

  return (
    <tr>
      <td className="ancla principal">{p.periodo === 0 ? '0 · inicio' : p.periodo}</td>
      <td className="num">
        {editable
          ? <input className="campo" inputMode="decimal" value={egreso} disabled={ocupado}
                   aria-label={`Egresos del periodo ${p.periodo}`}
                   style={{ textAlign: 'right', minWidth: 120 }}
                   onChange={e => setEgreso(e.target.value)} onBlur={enviar} />
          : <span className="cifra">{escribe(p.egreso, 'dinero', moneda)}</span>}
      </td>
      <td className="num">
        {editable
          ? <input className="campo" inputMode="decimal" value={ingreso} disabled={ocupado}
                   aria-label={`Ingresos del periodo ${p.periodo}`}
                   style={{ textAlign: 'right', minWidth: 120 }}
                   onChange={e => setIngreso(e.target.value)} onBlur={enviar} />
          : <span className="cifra">{escribe(p.ingreso, 'dinero', moneda)}</span>}
      </td>
      <td className="num cifra"
          style={{ color: Number(p.neto) < 0 ? 'var(--color-danger)' : undefined }}>
        {escribe(p.neto, 'dinero', moneda)}
      </td>
      {editable && (
        <td className="no-imprimir">
          <button className="b b-fan b-sm" disabled={ocupado} onClick={() => quitar(p.periodo)}>
            Quitar
          </button>
        </td>
      )}
    </tr>
  );
}
