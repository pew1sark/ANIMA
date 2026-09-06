import { useEffect, useState } from 'react';
import { cargarPresupuesto, listarModelos, listarProyectos,
         type Presupuesto as Datos, type FilaPresupuesto,
         type ModeloBreve, type ProyectoBreve, type Naturaleza } from '@/services/capital.service';
import { Elige, Cabecera, TarjetaCifra } from '@/components/capital/Cifra';
import { Periodo, type Rango } from '@/components/capital/Periodo';
import { Columnas } from '@/components/graficos/Columnas';
import { dineroLlano, dineroCorto, cantidad, mesCorto } from '@/lib/formato';
import type { Indicador } from '@/services/capital.service';

/* PRESUPUESTO CONTRA EJECUCIÓN REAL
   ---------------------------------------------------------------------------
   Cinco columnas de dinero y no dos, porque comparar solo presupuesto y real
   esconde la mitad de la historia:

     original     lo que se aprobó (la versión 1 del escenario)
     vigente      con lo que se trabaja hoy
     comprometido lo que ya está firmado aunque no se haya pagado
     pagado       lo que salió de la caja
     real         lo que se devengó

   Comprometido y pagado son distintos, y confundirlos es cómo un proyecto
   descubre en octubre que ya gastó el presupuesto de diciembre.

   La proyección al cierre mezcla lo real de los meses cerrados con lo vigente
   de los que faltan. Es la respuesta a "¿en cuánto vamos a terminar?", que es
   distinta de "¿cómo vamos?".

   El semáforo usa los umbrales de la organización (`ci_thresholds`), no unos
   fijos: un 10% de desviación es grave en una constructora y ruido en una
   campaña de marca. Y no se pinta solo con color — lleva también la palabra,
   porque un tablero que solo habla en rojo y verde no se lee en gris. */

const NOMBRE: Record<Naturaleza, string> = {
  ingreso: 'Ingresos',
  costo_directo: 'Costos directos',
  gasto_operativo: 'Gastos operativos',
  depreciacion: 'Depreciación',
  inversion: 'Inversión'
};

const ORDEN: Naturaleza[] = ['ingreso', 'costo_directo', 'gasto_operativo', 'depreciacion', 'inversion'];

const SEMAFORO: Record<string, { texto: string; color: string }> = {
  ok:     { texto: 'En rango',  color: 'var(--color-ok)' },
  aviso:  { texto: 'Desviado',  color: 'var(--color-aviso)' },
  malo:   { texto: 'Crítico',   color: 'var(--color-danger)' },
  neutro: { texto: 'Sin datos', color: 'var(--color-faint)' }
};

export function PresupuestoVsReal({ companyId }: { companyId: string }) {
  const [proyectos, setProyectos] = useState<ProyectoBreve[]>([]);
  const [proyecto, setProyecto] = useState('');
  const [modelos, setModelos] = useState<ModeloBreve[]>([]);
  const [modelo, setModelo] = useState('');
  const [rango, setRango] = useState<Rango>({});
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarProyectos(companyId)
      .then(p => { if (!vivo) return; setProyectos(p); setProyecto(a => a || (p[0]?.id ?? '')); })
      .catch(e => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  useEffect(() => {
    if (!proyecto) { setModelos([]); setModelo(''); return; }
    let vivo = true;
    listarModelos(proyecto)
      .then(m => { if (vivo) { setModelos(m); setModelo(''); } })
      .catch(() => {});
    return () => { vivo = false; };
  }, [proyecto]);

  useEffect(() => {
    if (!proyecto) { setD(null); return; }
    let vivo = true;
    setCargando(true); setError(null);
    cargarPresupuesto(proyecto, modelo || undefined, rango.desde, rango.hasta)
      .then(r => vivo && setD(r))
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar la comparación.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [proyecto, modelo, rango.desde, rango.hasta]);

  if (!cargando && proyectos.length === 0) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Todavía no hay proyectos</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Esta pantalla compara el presupuesto de un proyecto con lo que se ejecutó.
          Sin proyecto no hay nada que comparar.
        </p>
      </div>
    );
  }

  const moneda = d?.modelo.moneda ?? 'USD';
  const plata = (v: number) => dineroLlano(v, moneda);

  /* Las filas agrupadas por naturaleza, en el orden del estado de resultados.
     Sin agrupar, ingresos y CAPEX salen intercalados por orden alfabético de
     categoría y la tabla deja de decir nada. */
  const grupos = ORDEN
    .map(k => ({ kind: k, filas: (d?.filas ?? []).filter(f => f.kind === k) }))
    .filter(g => g.filas.length > 0);

  const totales: Indicador[] = d ? [
    tarjeta('original', 'Presupuesto original', d.totales.original,
      'La versión 1 del escenario: lo que se aprobó antes de que la realidad opinara.',
      [['Versión vigente', d.totales.vigente]]),
    tarjeta('vigente', 'Presupuesto vigente', d.totales.vigente,
      `Con lo que se trabaja hoy: versión ${d.modelo.version}${d.modelo.label ? ` — ${d.modelo.label}` : ''}.`,
      [['Presupuesto original', d.totales.original]]),
    tarjeta('real', 'Ejecución real', d.totales.real,
      'Lo devengado en el período, cargado como movimientos reales.',
      [['Comprometido', d.totales.comprometido], ['Pagado', d.totales.pagado]]),
    { ...tarjeta('dif', 'Diferencia', d.totales.diferencia,
        'Ejecución real − presupuesto vigente. Negativo es por debajo de lo previsto.',
        [['Real', d.totales.real], ['Vigente', d.totales.vigente]]),
      tono: d.totales.diferencia < 0 ? 'malo' : 'ok',
      nota: d.totales.vigente
        ? `${cantidad(d.totales.diferencia / Math.abs(d.totales.vigente) * 100, 1)}% sobre el vigente`
        : undefined }
  ] : [];

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Presupuesto contra ejecución real"
        nota={d ? `${mesCorto(d.desde)} a ${mesCorto(d.hasta)} · umbrales de esta organización: aviso desde ${cantidad(d.umbrales.aviso, 1)}%, crítico desde ${cantidad(d.umbrales.critico, 1)}%.` : undefined}
        marcas={d && <span className="marca marca-acento">{d.modelo.moneda}</span>}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <section className="no-imprimir">
        <div className="filtros">
          <Elige label="Proyecto" valor={proyecto} onChange={setProyecto}
                 opciones={proyectos} nombre={p => p.name} />
          <Elige label="Presupuesto vigente" valor={modelo} onChange={setModelo}
                 opciones={modelos} vacio="El modelo vigente"
                 nombre={m => `${m.escenario} · v${m.version}${m.state === 'validado' ? '  ✓' : ''}`} />
          <div className="w-full" style={{ borderTop: '1px solid var(--color-line)', paddingTop: 10, marginTop: 2 }}>
            <Periodo valor={rango} onChange={setRango} etiqueta="Período de la comparación" />
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && <div className="tarjeta" style={{ height: 320 }} aria-busy="true" />}

      {!cargando && !d && proyecto && !error && (
        <div className="tarjeta p-8">
          <p className="titular" style={{ fontSize: 20 }}>Este proyecto no tiene presupuesto</p>
          <p className="subtitulo mt-1.5 max-w-[58ch]">
            El presupuesto es el modelo financiero. Créalo en la pestaña
            <b> Modelo financiero</b> y vuelve aquí a compararlo con la ejecución.
          </p>
        </div>
      )}

      {!cargando && d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {totales.map(t => <TarjetaCifra key={t.clave} ind={t} moneda={moneda} destacada />)}
          </div>

          <section className="tarjeta p-5">
            <h2 className="rotulo">Mes a mes</h2>
            <p className="text-[12.5px] text-faint mt-1 mb-3">
              El presupuesto vigente contra lo que se cargó como ejecución.
            </p>
            <Columnas
              columnas={d.meses.map(m => ({
                etiqueta: mesCorto(m.periodo),
                partes: { a: m.vigente, b: m.real } as Record<string, number>
              }))}
              modo="agrupado"
              series={[{ clave: 'a', nombre: 'Presupuesto', color: 'var(--dato-1)' },
                       { clave: 'b', nombre: 'Real',        color: 'var(--dato-2)' }]}
              formato={v => dineroCorto(v, moneda)} />
          </section>

          <section className="tarjeta p-5">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <h2 className="rotulo">Por categoría</h2>
                <p className="text-[12.5px] text-faint mt-1">
                  {d.filas.length} categoría{d.filas.length === 1 ? '' : 's'} ·
                  la tabla se desliza en horizontal
                </p>
              </div>
            </div>
            <div className="desliza -mx-5 px-5 mt-3">
              <table className="tabla tabla-densa">
                <thead>
                  <tr>
                    <th className="ancla" style={{ minWidth: 190 }}>Categoría</th>
                    <th className="num">Original</th>
                    <th className="num">Vigente</th>
                    <th className="num">Comprometido</th>
                    <th className="num">Pagado</th>
                    <th className="num">Real</th>
                    <th className="num">Diferencia</th>
                    <th className="num">% ejec.</th>
                    <th className="num">Al cierre</th>
                    <th style={{ minWidth: 110 }}>Semáforo</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(g => (
                    <Grupo key={g.kind} kind={g.kind} filas={g.filas} plata={plata} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* Un total con su explicación. Reusa la tarjeta trazable en vez de una propia:
   así una cifra de aquí se abre igual que una del panel o del modelo. */
function tarjeta(clave: string, etiqueta: string, valor: number,
                 formula: string, insumos: [string, number][]): Indicador {
  return {
    clave, etiqueta, valor, formato: 'dinero', formula,
    insumos: insumos.map(([e, v]) => ({ etiqueta: e, valor: v, formato: 'dinero' as const }))
  };
}

function Grupo({ kind, filas, plata }: {
  kind: Naturaleza; filas: FilaPresupuesto[]; plata: (v: number) => string;
}) {
  const suma = (k: keyof FilaPresupuesto) =>
    filas.reduce((s, f) => s + (Number(f[k]) || 0), 0);

  return (
    <>
      <tr className="grupo-fila">
        <td className="ancla"><span className="recorta">{NOMBRE[kind]}</span></td>
        <td className="num cifra">{plata(suma('original'))}</td>
        <td className="num cifra">{plata(suma('vigente'))}</td>
        <td className="num cifra">{plata(suma('comprometido'))}</td>
        <td className="num cifra">{plata(suma('pagado'))}</td>
        <td className="num cifra">{plata(suma('real'))}</td>
        <td className="num cifra">{plata(suma('diferencia'))}</td>
        <td className="num cifra">
          {suma('vigente') ? `${cantidad(suma('real') / suma('vigente') * 100, 1)}%` : '—'}
        </td>
        <td className="num cifra">{plata(suma('proyeccion_cierre'))}</td>
        <td />
      </tr>
      {filas.map(f => (
        <tr key={`${f.kind}-${f.categoria}`}>
          <td className="ancla" style={{ paddingLeft: 26 }}>
            <span className="recorta" title={f.categoria}>{f.categoria}</span>
          </td>
          <td className="num cifra">{plata(f.original)}</td>
          <td className="num cifra">{plata(f.vigente)}</td>
          <td className="num cifra">{plata(f.comprometido)}</td>
          <td className="num cifra">{plata(f.pagado)}</td>
          <td className="num cifra">{plata(f.real)}</td>
          <td className="num cifra" style={{ color: f.diferencia < 0 ? 'var(--color-danger)' : undefined }}>
            {plata(f.diferencia)}
          </td>
          <td className="num cifra">{f.pct_ejecutado == null ? '—' : `${cantidad(f.pct_ejecutado, 1)}%`}</td>
          <td className="num cifra">{plata(f.proyeccion_cierre)}</td>
          <td>
            <span className="semaforo" style={{ color: SEMAFORO[f.semaforo]?.color }}>
              <i style={{ background: SEMAFORO[f.semaforo]?.color }} />
              {SEMAFORO[f.semaforo]?.texto ?? f.semaforo}
            </span>
          </td>
        </tr>
      ))}
      <tr aria-hidden="true"><td colSpan={10} style={{ height: 8, borderTop: 0 }} /></tr>
    </>
  );
}
