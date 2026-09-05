import { useEffect, useMemo, useState } from 'react';
import { cargarPanel, listarPortafolios, listarProyectos,
         type Panel as Datos, type Filtros,
         type PortafolioBreve, type ProyectoBreve } from '@/services/capital.service';
import { TarjetaCifra, Avisos, Elige, escribe } from '@/components/capital/Cifra';
import { Columnas } from '@/components/graficos/Columnas';
import { dineroCorto, mesCorto, diaCorto } from '@/lib/formato';
import type { Formato, ListaResumen, SerieResumen } from '@/services/resumen.service';

/* EL PANEL EJECUTIVO
   ---------------------------------------------------------------------------
   Se lee en este orden, que es el orden en que se pregunta:

     1 · qué está torcido           las alertas, antes que cualquier cifra
     2 · el capital                 cuánto se pidió, cuánto hay, cuánto queda
     3 · cómo va la operación       ingresos, EBITDA, desviación
     4 · la curva                   proyectado contra real, mes a mes
     5 · el detalle                 los proyectos y los hitos que vienen

   Las alertas van PRIMERO y no al final. Un tablero que esconde el problema
   debajo de doce tarjetas verdes no está informando: está tranquilizando.

   Cada tarjeta se abre y muestra su fórmula. Ninguna cifra se calcula aquí:
   todas vienen de `ci_resumen()`, con su explicación pegada. */

const mesISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export function PanelCapital({ companyId }: { companyId: string }) {
  const [filtros, setFiltros] = useState<Filtros>({});
  const [d, setD] = useState<Datos | null>(null);
  const [portafolios, setPortafolios] = useState<PortafolioBreve[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoBreve[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([listarPortafolios(companyId), listarProyectos(companyId)])
      .then(([pf, pr]) => { if (vivo) { setPortafolios(pf); setProyectos(pr); } })
      .catch(() => {});
    return () => { vivo = false; };
  }, [companyId]);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null); setSinAcceso(false);
    cargarPanel(companyId, filtros)
      .then(r => { if (!vivo) return; if (!r) setSinAcceso(true); else setD(r); })
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar el panel.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId, JSON.stringify(filtros)]);

  /* El país y la moneda salen de los proyectos que hay, no de un catálogo:
     ofrecer veinte países cuando la firma opera en dos es ruido. */
  const monedas = useMemo(
    () => [...new Set(proyectos.map(p => p.currency))].sort(), [proyectos]);

  const capital = d?.cifras.filter(c => c.clave.startsWith('capital_')) ?? [];
  const operacion = d?.cifras.filter(c => !c.clave.startsWith('capital_')) ?? [];

  if (sinAcceso) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Este panel no es para tu nivel de acceso</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          El panel consolida la cartera entera de la organización. Si entraste invitado
          a un proyecto, lo tuyo está en la pestaña <b>Modelo financiero</b>: ahí ves
          los indicadores de los proyectos a los que te dieron acceso.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 aparece">
      <Filtrador filtros={filtros} setFiltros={setFiltros}
                 portafolios={portafolios} proyectos={proyectos} monedas={monedas} />

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && (
        <div className="grid gap-4" aria-busy="true">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 100 }} />)}
          </div>
          <div className="tarjeta" style={{ height: 240 }} />
        </div>
      )}

      {!cargando && d && (
        <>
          <Avisos avisos={d.alertas} titulo={d.alertas.length ? 'Qué mirar primero' : undefined} />

          {d.cifras.every(c => !Number(c.valor)) && (
            <div className="tarjeta p-6">
              <p className="titular" style={{ fontSize: 19 }}>Todavía no hay nada que consolidar</p>
              <p className="subtitulo mt-1.5 max-w-[62ch]">
                El panel se llena a partir de los proyectos, sus modelos y la ejecución
                que se carga. Las pestañas de al lado son donde se construye; esta es
                donde se mira.
              </p>
            </div>
          )}

          <section className="grid gap-2.5">
            <h2 className="rotulo">Capital · en {d.moneda}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {capital.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={d.moneda} />)}
            </div>
          </section>

          <section className="grid gap-2.5">
            <h2 className="rotulo">
              Operación · {mesCorto(d.periodo.desde.slice(0, 7))} a {mesCorto(d.periodo.hasta.slice(0, 7))}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {operacion.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={d.moneda} />)}
            </div>
          </section>

          {d.series.map(s => <Grafico key={s.titulo} serie={s} moneda={d.moneda} />)}

          <div className="grid gap-4">
            {d.listas.map(l => <Lista key={l.titulo} lista={l} moneda={d.moneda} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* Los filtros del encargo: organización (la que ya está abierta), portafolio,
   proyecto, unidad, país, moneda, período y escenario. La unidad y el escenario
   dependen del proyecto elegido y viven en la pantalla del modelo, que es
   donde tienen sentido: filtrar la cartera entera por una unidad de un proyecto
   no responde ninguna pregunta. */
function Filtrador({ filtros, setFiltros, portafolios, proyectos, monedas }: {
  filtros: Filtros; setFiltros: (f: Filtros) => void;
  portafolios: PortafolioBreve[]; proyectos: ProyectoBreve[]; monedas: string[];
}) {
  const set = (k: keyof Filtros) => (v: string) => setFiltros({ ...filtros, [k]: v || undefined });
  const hay = Object.values(filtros).some(Boolean);

  const visibles = filtros.portafolio
    ? proyectos.filter(p => p.portfolio_id === filtros.portafolio)
    : proyectos;

  const hoy = new Date();
  const atras = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
  const adelante = new Date(hoy.getFullYear(), hoy.getMonth() + 11, 1);

  return (
    <section className="tarjeta p-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Elige label="Portafolio" valor={filtros.portafolio ?? ''} onChange={set('portafolio')}
               opciones={portafolios} nombre={p => p.name} vacio="Todos" />
        <Elige label="Proyecto" valor={filtros.proyecto ?? ''} onChange={set('proyecto')}
               opciones={visibles} nombre={p => p.name} vacio="Todos" />
        <Elige label="Moneda del proyecto" valor={filtros.moneda ?? ''} onChange={set('moneda')}
               opciones={monedas.map(m => ({ id: m }))} nombre={m => m.id} vacio="Todas" />
        <label className="grid gap-1">
          <span className="rotulo">País</span>
          <input className="campo" value={filtros.pais ?? ''} placeholder="CL, CO, CR…"
                 onChange={e => set('pais')(e.target.value.toUpperCase())} />
        </label>
        <label className="grid gap-1">
          <span className="rotulo">Desde</span>
          <input className="campo" type="month" value={(filtros.desde ?? mesISO(atras)).slice(0, 7)}
                 onChange={e => set('desde')(e.target.value ? `${e.target.value}-01` : '')} />
        </label>
        <label className="grid gap-1">
          <span className="rotulo">Hasta</span>
          <input className="campo" type="month" value={(filtros.hasta ?? mesISO(adelante)).slice(0, 7)}
                 onChange={e => set('hasta')(e.target.value ? `${e.target.value}-01` : '')} />
        </label>
      </div>
      {hay && (
        <button type="button" onClick={() => setFiltros({})} className="b b-sec b-sm justify-self-start">
          Quitar filtros
        </button>
      )}
    </section>
  );
}

function Grafico({ serie, moneda }: { serie: SerieResumen; moneda: string }) {
  const dos = (serie.leyenda?.length ?? 1) > 1;
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{serie.titulo}</h2>
      {serie.nota && <p className="mt-1 mb-3 text-[12.5px] text-faint">{serie.nota}</p>}
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
        /* Proyectado y real no se apilan: su suma no es ninguna cifra. */
        modo="agrupado"
        series={dos
          ? [{ clave: 'a', nombre: serie.leyenda![0]!, color: 'var(--dato-1)' },
             { clave: 'b', nombre: serie.leyenda![1]!, color: 'var(--dato-2)' }]
          : [{ clave: 'a', nombre: serie.titulo, color: 'var(--dato-1)' }]}
        formato={v => dineroCorto(v, moneda)} />
    </section>
  );
}

/* Una celda de lista. El formato manda: `fecha` se escribe corta, lo numérico
   pasa por el mismo `escribe` que las tarjetas —para que 1.284.500 se vea
   igual en los dos sitios— y el resto es texto tal cual. */
function celda(v: unknown, f: Formato | undefined, moneda: string): string {
  if (v == null || v === '') return '—';
  if (f === 'fecha') return diaCorto(String(v).slice(0, 10));
  if (numerica(f)) return escribe(Number(v), f, moneda);
  return String(v);
}

const numerica = (f?: string) =>
  f === 'dinero' || f === 'numero' || f === 'porcentaje' || f === 'dias' || f === 'meses';

function Lista({ lista, moneda }: { lista: ListaResumen; moneda: string }) {
  const num = numerica;
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
                    <th key={c.k} className={`${num(c.formato) ? 'num' : ''} ${i === 0 ? 'ancla' : ''}`}>{c.t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.filas.map((f, i) => (
                  <tr key={i}>
                    {lista.columnas.map((c, j) => (
                      <td key={c.k}
                          className={`${num(c.formato) ? 'num cifra' : ''} ${j === 0 ? 'ancla principal' : ''}`}
                          style={{ whiteSpace: c.formato === 'fecha' ? 'nowrap' : undefined }}>
                        {celda(f[c.k], c.formato, moneda)}
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
