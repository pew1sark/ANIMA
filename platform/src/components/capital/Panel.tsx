import { useEffect, useMemo, useState } from 'react';
import { cargarPanel, listarPortafolios, listarProyectos,
         type Panel as Datos, type Filtros,
         type PortafolioBreve, type ProyectoBreve } from '@/services/capital.service';
import { TarjetaCifra, Avisos, Elige, Cabecera, escribe } from '@/components/capital/Cifra';
import { Periodo, type Rango } from '@/components/capital/Periodo';
import { Columnas } from '@/components/graficos/Columnas';
import { dineroCorto, mesCorto, diaCorto } from '@/lib/formato';
import type { Formato, ListaResumen, SerieResumen } from '@/services/resumen.service';

/* EL PANEL EJECUTIVO
   ---------------------------------------------------------------------------
   Se lee en este orden, que es el orden en que se pregunta:

     1 · qué está torcido      las alertas, antes que cualquier cifra
     2 · las cuatro que mandan  capital, resultado, desviación — en grande
     3 · el resto del cuadro    compacto, para consultar
     4 · la curva               proyectado contra real, mes a mes
     5 · el detalle             los proyectos y los hitos que vienen

   Las alertas van PRIMERO y no al final. Un tablero que esconde el problema
   debajo de doce tarjetas verdes no está informando: está tranquilizando.

   Y las cifras tienen DOS PESOS. Con doce tarjetas idénticas hay que leerlas
   todas para encontrar la que importa; con cuatro grandes y ocho compactas, la
   pantalla se lee en dos segundos y el detalle sigue estando.

   Ninguna cifra se calcula aquí: todas vienen de `ci_resumen()`, con su
   fórmula pegada. */

/* Las cuatro que responden «¿cómo vamos?» sin abrir nada más. */
const HEROICAS = ['capital_comprometido', 'capital_pendiente', 'ebitda_real', 'desviacion'];

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

  /* Las monedas salen de los proyectos que hay, no de un catálogo: ofrecer
     veinte cuando la firma opera en dos es ruido. */
  const monedas = useMemo(
    () => [...new Set(proyectos.map(p => p.currency))].sort(), [proyectos]);

  const heroicas = d?.cifras.filter(c => HEROICAS.includes(c.clave)) ?? [];
  const resto    = d?.cifras.filter(c => !HEROICAS.includes(c.clave)) ?? [];

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
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Panel ejecutivo"
        nota={d ? `Cartera consolidada en ${d.moneda}. Los proyectos en otra moneda se convierten con los tipos de cambio de la organización.` : undefined}
        marcas={d && <span className="marca marca-acento">{d.moneda}</span>}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <Filtrador filtros={filtros} setFiltros={setFiltros}
                 portafolios={portafolios} proyectos={proyectos} monedas={monedas} />

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && (
        <div className="grid gap-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 108 }} />)}
          </div>
          <div className="tarjeta" style={{ height: 240 }} />
        </div>
      )}

      {!cargando && d && (
        <>
          <Avisos avisos={d.alertas} titulo={d.alertas.length ? 'Qué mirar primero' : undefined} />

          {d.cifras.every(c => !Number(c.valor)) ? (
            <div className="tarjeta p-8">
              <p className="titular" style={{ fontSize: 19 }}>Todavía no hay nada que consolidar</p>
              <p className="subtitulo mt-1.5 max-w-[62ch]">
                El panel se llena a partir de los proyectos, sus modelos y la ejecución
                que se carga. Las pestañas de al lado son donde se construye; esta es
                donde se mira.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {heroicas.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={d.moneda} destacada />)}
              </div>

              <section className="grid gap-2.5">
                <h2 className="rotulo rotulo-tenue">
                  El resto del cuadro · {mesCorto(d.periodo.desde)} a {mesCorto(d.periodo.hasta)}
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {resto.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={d.moneda} />)}
                </div>
              </section>

              {d.series.map(s => <Grafico key={s.titulo} serie={s} moneda={d.moneda} />)}

              <div className="grid gap-4">
                {d.listas.map(l => <Lista key={l.titulo} lista={l} moneda={d.moneda} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* Los filtros del encargo: portafolio, proyecto, país, moneda, estado y
   período. La unidad de negocio y el escenario dependen de un proyecto
   concreto y viven en la pantalla del modelo, que es donde tienen sentido:
   filtrar la cartera entera por una unidad de un proyecto no responde ninguna
   pregunta.

   Todo en una tira, no en una tarjeta con seis campos apilados. Un panel de
   filtros que ocupa media pantalla compite con lo que vino a filtrarse. */
function Filtrador({ filtros, setFiltros, portafolios, proyectos, monedas }: {
  filtros: Filtros; setFiltros: (f: Filtros) => void;
  portafolios: PortafolioBreve[]; proyectos: ProyectoBreve[]; monedas: string[];
}) {
  const set = (k: keyof Filtros) => (v: string) => setFiltros({ ...filtros, [k]: v || undefined });
  /* El período no cuenta como filtro: tiene su propio «Limpiar» y decir
     «quitar 3 filtros» cuando dos de ellos son el mes de inicio y el de fin
     hace que el botón prometa más de lo que hace. */
  const puestos = Object.entries(filtros)
    .filter(([k, v]) => v && k !== 'desde' && k !== 'hasta').length;

  const visibles = filtros.portafolio
    ? proyectos.filter(p => p.portfolio_id === filtros.portafolio)
    : proyectos;

  const rango: Rango = { desde: filtros.desde, hasta: filtros.hasta };

  /* Todo en UNA tira. Dos cajas apiladas de filtros ocupan un tercio de la
     pantalla antes de mostrar una sola cifra; con `flex-wrap` el período baja
     solo a la segunda línea cuando no cabe. */
  return (
    <section className="no-imprimir">
      <div className="filtros">
        <Elige label="Portafolio" valor={filtros.portafolio ?? ''} onChange={set('portafolio')}
               opciones={portafolios} nombre={p => p.name} vacio="Todos" />
        <Elige label="Proyecto" valor={filtros.proyecto ?? ''} onChange={set('proyecto')}
               opciones={visibles} nombre={p => p.name} vacio="Todos" />
        <Elige label="Moneda" valor={filtros.moneda ?? ''} onChange={set('moneda')}
               opciones={monedas.map(m => ({ id: m }))} nombre={m => m.id} vacio="Todas" ancho={110} />
        <label style={{ width: 110, flex: 'none' }}>
          <span className="rotulo">País</span>
          <input className="campo" value={filtros.pais ?? ''} placeholder="CL, CO…"
                 onChange={e => set('pais')(e.target.value.toUpperCase())} />
        </label>
        {puestos > 0 && (
          <button type="button" className="b b-fan b-sm"
                  onClick={() => setFiltros({ desde: filtros.desde, hasta: filtros.hasta })}>
            Quitar {puestos} filtro{puestos === 1 ? '' : 's'}
          </button>
        )}

        <div className="w-full" style={{ borderTop: '1px solid var(--color-line)', paddingTop: 10, marginTop: 2 }}>
          <Periodo valor={rango} onChange={r => setFiltros({ ...filtros, ...r })} />
        </div>
      </div>
    </section>
  );
}

function Grafico({ serie, moneda }: { serie: SerieResumen; moneda: string }) {
  const dos = (serie.leyenda?.length ?? 1) > 1;
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{serie.titulo}</h2>
      {serie.nota && <p className="mt-1 mb-3 text-[12.5px] text-faint max-w-[70ch]">{serie.nota}</p>}
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
   pasa por el mismo `escribe` que las tarjetas —para que una cifra se vea
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
                    <th key={c.k} className={`${numerica(c.formato) ? 'num' : ''} ${i === 0 ? 'ancla' : ''}`}>{c.t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.filas.map((f, i) => (
                  <tr key={i}>
                    {lista.columnas.map((c, j) => (
                      <td key={c.k}
                          className={`${numerica(c.formato) ? 'num cifra' : ''} ${j === 0 ? 'ancla principal' : ''}`}>
                        {j === 0
                          ? <span className="recorta" title={String(f[c.k] ?? '')}>{celda(f[c.k], c.formato, moneda)}</span>
                          : celda(f[c.k], c.formato, moneda)}
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
