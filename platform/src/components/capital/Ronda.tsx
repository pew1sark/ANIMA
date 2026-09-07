import { useEffect, useState } from 'react';
import { cargarRonda, simularDilucion, listarRondas, listarProyectos,
         type Ronda as Datos, type Dilucion, type RondaBreve,
         type ProyectoBreve, ETAPAS } from '@/services/capital.service';
import { TarjetaCifra, Avisos, Elige, Cabecera, escribe } from '@/components/capital/Cifra';
import { Columnas } from '@/components/graficos/Columnas';
import { dineroLlano, dineroCorto, cantidad, diaCorto } from '@/lib/formato';

/* LA RONDA
   ---------------------------------------------------------------------------
   Todo lo que hay que saber de un levantamiento, en una pantalla, en el orden
   en que se pregunta:

     1 · qué está torcido        las validaciones de la ronda
     2 · cómo va                 objetivo, confirmado, pendiente, % levantado
     3 · qué puede entrar        el pipeline y su forecast ponderado
     4 · quién                   los inversionistas, uno por uno
     5 · en qué se usa           el uso de fondos, que tiene que cuadrar
     6 · cómo quedo              la simulación de dilución

   El bloque 6 es el que más se mira y el que ningún Excel resuelve bien: qué
   porcentaje le queda a cada socio actual si la ronda cierra. La fórmula es
   una división —pre-money ÷ post-money— y la conversación que abre es la más
   difícil de todas, así que conviene tenerla delante y no de memoria.

   Ninguna cifra se calcula aquí. Todas vienen de `ci_ronda_calculada()` y
   `ci_simular_dilucion()`, con su fórmula pegada. */

const HEROICOS = ['objetivo', 'confirmado', 'pendiente', 'levantado'];

export function RondaCapital({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [proyectos, setProyectos] = useState<ProyectoBreve[]>([]);
  const [proyecto, setProyecto] = useState('');
  const [rondas, setRondas] = useState<RondaBreve[]>([]);
  const [ronda, setRonda] = useState('');
  const [d, setD] = useState<Datos | null>(null);
  const [dil, setDil] = useState<Dilucion | null>(null);
  const [monto, setMonto] = useState('');
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
    if (!proyecto) { setRondas([]); setRonda(''); setD(null); return; }
    let vivo = true;
    listarRondas(proyecto)
      .then(r => { if (!vivo) return; setRondas(r); setRonda(r[0]?.id ?? ''); })
      .catch(e => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [proyecto]);

  useEffect(() => {
    if (!ronda) { setD(null); setDil(null); return; }
    let vivo = true;
    setCargando(true); setError(null); setMonto('');
    Promise.all([cargarRonda(ronda), simularDilucion(ronda)])
      .then(([r, s]) => { if (!vivo) return; setD(r); setDil(s); })
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar la ronda.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [ronda]);

  async function resimular() {
    if (!ronda) return;
    const n = Number(monto.replace(/[^\d.-]/g, ''));
    try { setDil(await simularDilucion(ronda, Number.isFinite(n) && n > 0 ? n : undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo simular.'); }
  }

  if (!cargando && proyectos.length === 0) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Todavía no hay proyectos</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Una ronda cuelga de un proyecto. Empieza creando el proyecto en la pestaña <b>Proyectos</b>.
        </p>
      </div>
    );
  }

  const moneda = d?.ronda.moneda ?? 'USD';
  const heroicos = d?.indicadores.filter(i => HEROICOS.includes(i.clave)) ?? [];
  const resto    = d?.indicadores.filter(i => !HEROICOS.includes(i.clave)) ?? [];

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo={d?.ronda.nombre ?? 'Ronda de capital'}
        nota={d ? `${d.proyecto.nombre}${d.ronda.instrumento ? ` · ${d.ronda.instrumento}` : ''}${d.ronda.cierre_objetivo ? ` · cierre objetivo ${diaCorto(d.ronda.cierre_objetivo)}` : ''}` : undefined}
        marcas={d && (
          <>
            <span className="marca marca-acento">{d.ronda.moneda}</span>
            <span className="marca">{ESTADO_RONDA[d.ronda.estado] ?? d.ronda.estado}</span>
          </>
        )}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <div className="filtros no-imprimir">
        <Elige label="Proyecto" valor={proyecto} onChange={setProyecto}
               opciones={proyectos} nombre={p => p.name} />
        <Elige label="Ronda" valor={ronda} onChange={setRonda}
               opciones={rondas}
               nombre={r => `${r.name} · ${dineroLlano(r.target_amount, r.currency)}`} />
      </div>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && <div className="tarjeta" style={{ height: 320 }} aria-busy="true" />}

      {!cargando && !ronda && proyecto && (
        <div className="tarjeta p-8">
          <p className="titular" style={{ fontSize: 20 }}>Este proyecto no tiene rondas</p>
          <p className="subtitulo mt-1.5 max-w-[58ch]">
            Créala en la pestaña <b>Rondas</b>: monto objetivo, fechas, instrumento y valoración.
            {puedeEditar ? '' : ' La crea quien administra la organización.'}
          </p>
        </div>
      )}

      {!cargando && d && (
        <>
          <Avisos avisos={d.avisos} titulo={d.avisos.length ? 'Qué revisar de esta ronda' : undefined} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heroicos.map(i => <TarjetaCifra key={i.clave} ind={i} moneda={moneda} destacada />)}
          </div>

          <section className="grid gap-2.5">
            <h2 className="rotulo rotulo-tenue">Valoración y uso de fondos</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {resto.map(i => <TarjetaCifra key={i.clave} ind={i} moneda={moneda} />)}
            </div>
          </section>

          <Pipeline etapas={d.pipeline} moneda={moneda} />
          <Inversionistas filas={d.inversionistas} moneda={moneda} />
          <UsoDeFondos filas={d.uso_de_fondos} moneda={moneda} />
          <Dilucion d={dil} moneda={moneda} monto={monto} setMonto={setMonto} resimular={resimular} />
        </>
      )}
    </div>
  );
}

const ESTADO_RONDA: Record<string, string> = {
  preparacion: 'Preparación', abierta: 'Abierta', comprometida_parcial: 'Capital parcial',
  cerrada: 'Cerrada', pausada: 'Pausada', cancelada: 'Cancelada'
};

/* El embudo. Solo se dibujan las etapas con alguien dentro: once columnas
   vacías no son un embudo, son una plantilla. */
function Pipeline({ etapas, moneda }: { etapas: Datos['pipeline']; moneda: string }) {
  const vivas = etapas.filter(e => e.inversionistas > 0);
  if (vivas.length === 0) {
    return (
      <section className="tarjeta p-5">
        <h2 className="rotulo">Pipeline</h2>
        <p className="text-[12.5px] text-muted mt-1.5 max-w-[62ch]">
          Todavía no hay inversionistas en esta ronda. Se agregan en la pestaña
          <b> Pipeline</b>: a quién, cuánto podría poner y con qué probabilidad.
          De ahí sale el forecast ponderado.
        </p>
      </section>
    );
  }
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">Pipeline</h2>
      <p className="text-[12.5px] text-faint mt-1 mb-3">
        Potencial contra potencial ponderado por la probabilidad de cierre.
      </p>
      <Columnas
        columnas={vivas.map(e => ({
          etiqueta: ETAPAS[e.etapa] ?? e.etapa,
          partes: { a: e.potencial, b: e.ponderado } as Record<string, number>
        }))}
        modo="agrupado"
        series={[{ clave: 'a', nombre: 'Potencial',  color: 'var(--dato-1)' },
                 { clave: 'b', nombre: 'Ponderado',  color: 'var(--dato-2)' }]}
        formato={v => dineroCorto(v, moneda)} />
    </section>
  );
}

function Inversionistas({ filas, moneda }: { filas: Datos['inversionistas']; moneda: string }) {
  if (filas.length === 0) return null;
  const plata = (v: number) => dineroLlano(v, moneda);
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">Quién está en la ronda</h2>
      <div className="desliza -mx-5 px-5 mt-3">
        <table className="tabla tabla-densa">
          <thead>
            <tr>
              <th className="ancla" style={{ minWidth: 190 }}>Inversionista</th>
              <th style={{ minWidth: 150 }}>Etapa</th>
              <th className="num">Potencial</th>
              <th className="num">Prob.</th>
              <th className="num">Ponderado</th>
              <th className="num">Comprometido</th>
              <th className="num">Invertido</th>
              <th style={{ minWidth: 160 }}>Qué sigue</th>
              <th className="num">Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id}>
                <td className="ancla principal">
                  <span className="recorta" title={`${f.nombre}${f.pais ? ` · ${f.pais}` : ''}`}>{f.nombre}</span>
                </td>
                <td><span className="recorta">{ETAPAS[f.etapa] ?? f.etapa}</span></td>
                <td className="num cifra">{plata(f.potencial)}</td>
                <td className="num cifra">{cantidad(f.probabilidad, 0)}%</td>
                <td className="num cifra">{plata(f.ponderado)}</td>
                <td className="num cifra">{plata(f.comprometido)}</td>
                <td className="num cifra">{plata(f.invertido)}</td>
                <td><span className="recorta" title={f.proxima_accion ?? ''}>{f.proxima_accion ?? '—'}</span></td>
                <td className="num cifra">{f.proxima_fecha ? diaCorto(f.proxima_fecha) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsoDeFondos({ filas, moneda }: { filas: Datos['uso_de_fondos']; moneda: string }) {
  const plata = (v: number) => dineroLlano(v, moneda);
  const total = filas.reduce((s, f) => s + f.presupuesto, 0);
  const usado = filas.reduce((s, f) => s + f.utilizado, 0);

  if (filas.length === 0) {
    return (
      <section className="tarjeta p-5">
        <h2 className="rotulo">Uso de fondos</h2>
        <p className="text-[12.5px] text-muted mt-1.5 max-w-[62ch]">
          La ronda no dice en qué se va a usar el dinero. Es la primera pregunta de
          cualquier inversionista, y sin el desglose no hay contra qué medir la
          ejecución después. Se carga en la pestaña <b>Uso de fondos</b>.
        </p>
      </section>
    );
  }

  return (
    <section className="tarjeta p-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h2 className="rotulo">Uso de fondos</h2>
          <p className="text-[12.5px] text-faint mt-1">
            {plata(usado)} ejecutados de {plata(total)} presupuestados
          </p>
        </div>
      </div>
      <div className="desliza -mx-5 px-5 mt-3">
        <table className="tabla tabla-densa">
          <thead>
            <tr>
              <th className="ancla" style={{ minWidth: 190 }}>Categoría</th>
              <th className="num">Presupuesto</th>
              <th className="num">% del total</th>
              <th className="num">Comprometido</th>
              <th className="num">Utilizado</th>
              <th className="num">Saldo</th>
              <th style={{ minWidth: 140 }}>Proveedor</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id}>
                <td className="ancla principal">
                  <span className="recorta" title={f.descripcion ?? f.categoria}>{f.categoria}</span>
                </td>
                <td className="num cifra">{plata(f.presupuesto)}</td>
                <td className="num cifra">{f.pct == null ? '—' : `${cantidad(f.pct, 1)}%`}</td>
                <td className="num cifra">{plata(f.comprometido)}</td>
                <td className="num cifra">{plata(f.utilizado)}</td>
                <td className="num cifra" style={{ color: f.saldo < 0 ? 'var(--color-danger)' : undefined }}>
                  {plata(f.saldo)}
                </td>
                <td><span className="recorta">{f.proveedor ?? '—'}</span></td>
              </tr>
            ))}
            <tr className="grupo-fila">
              <td className="ancla"><span className="recorta">Total</span></td>
              <td className="num cifra">{plata(total)}</td>
              <td className="num cifra">—</td>
              <td className="num cifra">{plata(filas.reduce((s, f) => s + f.comprometido, 0))}</td>
              <td className="num cifra">{plata(usado)}</td>
              <td className="num cifra">{plata(total - usado)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* LA SIMULACIÓN DE DILUCIÓN.
   Se puede escribir un monto distinto al de la ronda: es lo que se hace en una
   negociación real —«¿y si entran 800 en vez de 1.200?»— y tenerlo delante
   evita la respuesta de memoria. */
function Dilucion({ d, moneda, monto, setMonto, resimular }: {
  d: Dilucion | null; moneda: string;
  monto: string; setMonto: (v: string) => void; resimular: () => void;
}) {
  if (!d) return null;

  if (d.error) {
    return (
      <section className="tarjeta p-5">
        <h2 className="rotulo">Simulación de dilución</h2>
        <p className="text-[12.5px] text-muted mt-1.5 max-w-[64ch]">{d.error}</p>
      </section>
    );
  }

  return (
    <section className="tarjeta p-5 grid gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h2 className="rotulo">Simulación de dilución</h2>
          <p className="text-[12.5px] text-faint mt-1">
            Simulado con {dineroLlano(d.supuesto?.monto ?? 0, moneda)} · {d.supuesto?.origen}
          </p>
        </div>
        <div className="flex items-end gap-2 ml-auto no-imprimir">
          <label className="grid gap-1">
            <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>
              Probar con otro monto
            </span>
            <input className="campo" style={{ minHeight: 34, padding: '6px 10px', width: 150 }}
                   inputMode="decimal" value={monto} placeholder="800000"
                   onChange={e => setMonto(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') resimular(); }} />
          </label>
          <button className="b b-sec b-sm" onClick={resimular}>Simular</button>
        </div>
      </div>

      {d.indicadores && (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {d.indicadores.map(i => <TarjetaCifra key={i.clave} ind={i} moneda={moneda} />)}
        </div>
      )}

      {d.aviso && (
        <p className="text-[12.5px] rounded-xl px-3.5 py-2.5"
           style={{ color: 'var(--color-aviso)',
                    background: 'color-mix(in srgb, var(--color-aviso) 10%, transparent)' }}>
          {d.aviso}
        </p>
      )}

      {d.socios && d.socios.length > 0 && (
        <div className="desliza -mx-5 px-5">
          <table className="tabla tabla-densa">
            <thead>
              <tr>
                <th className="ancla" style={{ minWidth: 200 }}>Socio</th>
                <th style={{ minWidth: 130 }}>Tipo</th>
                <th className="num">Antes</th>
                <th className="num">Después</th>
                <th className="num">Se diluye</th>
                <th className="num">Inversión histórica</th>
              </tr>
            </thead>
            <tbody>
              {d.socios.map(s => (
                <tr key={s.socio}>
                  <td className="ancla principal">
                    <span className="recorta" title={s.derechos ?? s.socio}>{s.socio}</span>
                  </td>
                  <td><span className="recorta">{s.tipo}</span></td>
                  <td className="num cifra">{cantidad(s.antes, 2)}%</td>
                  <td className="num cifra" style={{ fontWeight: 800 }}>{cantidad(s.despues, 2)}%</td>
                  <td className="num cifra" style={{ color: 'var(--color-danger)' }}>
                    −{cantidad(s.dilucion, 2)}%
                  </td>
                  <td className="num cifra">{escribe(s.invertido, 'dinero', moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
