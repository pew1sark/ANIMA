import { useEffect, useState } from 'react';
import { cargarPanel, cargarMapa, opcionesDeFiltro, ponerEnMarcha,
         type PanelREI, type FiltrosREI, type OpcionesFiltro,
         type MapaREI } from '@/services/inmobiliaria.service';
import { TarjetaCifra, Avisos, Elige, Cabecera } from '@/components/capital/Cifra';
import { Periodo, type Rango } from '@/components/capital/Periodo';
import { Grafico, Lista } from '@/components/panel/Cuadro';
import { MapaMunicipios } from '@/components/inmobiliaria/Mapa';
import { mesCorto } from '@/lib/formato';

/* EL PANEL INMOBILIARIO
   ---------------------------------------------------------------------------
   Se lee en el mismo orden que el de Capital Intelligence, que es el orden en
   que se pregunta:

     1 · qué está torcido      las alertas, antes que cualquier cifra
     2 · las cuatro que mandan  inventario, cierre, brecha de demanda
     3 · el resto del cuadro    compacto, para consultar
     4 · las curvas             captación y ventas, mes a mes
     5 · el detalle             brecha por tipología, canales, pipeline
     6 · dónde                  el inventario y la demanda sobre el mapa

   Las alertas van PRIMERO, y aquí eso importa más que en el otro panel. La
   mitad de lo que se avisa son huecos de dato —ventas sin fecha, inmuebles sin
   área— y son justo lo que hace que una curva de evolución se lea como una
   caída de la actividad cuando en realidad nadie llenó una casilla.

   Ninguna cifra se calcula aquí: todas vienen de `rei_resumen()`, con su
   fórmula y sus insumos pegados. */

/* Las cuatro que responden «¿cómo vamos?» sin abrir nada más. */
const HEROICAS = ['disponibles', 'tasa_cierre', 'compradores', 'comision'];

export function PanelInmobiliario({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [filtros, setFiltros] = useState<FiltrosREI>({});
  const [d, setD] = useState<PanelREI | null>(null);
  const [opciones, setOpciones] = useState<OpcionesFiltro>({ municipios: [], tipos: [], canales: [] });
  const [mapa, setMapa] = useState<MapaREI | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [sembrando, setSembrando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    opcionesDeFiltro(companyId).then(o => vivo && setOpciones(o)).catch(() => {});
    return () => { vivo = false; };
  }, [companyId, recarga]);

  /* El mapa no depende de los filtros: es el recuento completo por municipio,
     y es donde se elige el municipio, no donde se sufre el ya elegido. Si
     falla, cae en silencio —el panel entero no se cae por una tarjeta— y
     `MapaMunicipios` dibuja su propio vacío. */
  useEffect(() => {
    let vivo = true;
    cargarMapa(companyId).then(m => vivo && setMapa(m)).catch(() => {});
    return () => { vivo = false; };
  }, [companyId, recarga]);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null); setSinAcceso(false);
    cargarPanel(companyId, filtros)
      .then(r => { if (!vivo) return; if (!r) setSinAcceso(true); else setD(r); })
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar el panel.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId, JSON.stringify(filtros), recarga]);

  async function arrancar() {
    setSembrando(true); setError(null);
    try {
      const r = await ponerEnMarcha(companyId);
      setRecarga(n => n + 1);
      if (r.supuestos + r.criterios + r.etapas === 0) {
        setError('Ya estaba todo cargado: no se tocó nada.');
      }
    } catch (e) {
      setError((e as Error).message ?? 'No se pudo poner en marcha el módulo.');
    } finally { setSembrando(false); }
  }

  if (sinAcceso) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Este panel no es para tu nivel de acceso</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          El panel consolida el inventario, la demanda y el pipeline de la organización
          entera. Si entraste para cargar inmuebles o compradores, lo tuyo está en las
          pestañas <b>Inventario</b> y <b>Demanda</b>.
        </p>
      </div>
    );
  }

  /* «Sin criterios» es la señal de que la organización no se ha puesto en
     marcha: es lo que siembra `rei_sembrar_base()` junto con las etapas y los
     supuestos. Con esa alerta en pantalla, ofrecer el botón vale más que
     repetir el aviso. */
  const sinArrancar = d?.alertas.some(a => a.clave === 'sin_criterios') ?? false;
  const heroicas = d?.cifras.filter(c => HEROICAS.includes(c.clave)) ?? [];
  const resto    = d?.cifras.filter(c => !HEROICAS.includes(c.clave)) ?? [];

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Panel inmobiliario"
        nota={d ? `Comercialización, demanda y desarrollo, en ${d.moneda}. Lo que está marcado como vendido sin fecha de venta queda fuera de las curvas y de la comisión del tramo: aparece en las alertas.` : undefined}
        marcas={d && <span className="marca marca-acento">{d.moneda}</span>}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <Filtrador filtros={filtros} setFiltros={setFiltros} opciones={opciones} />

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

          {sinArrancar && puedeEditar && (
            <section className="tarjeta p-5 entra">
              <p className="titular" style={{ fontSize: 17 }}>Poner el módulo en marcha</p>
              <p className="subtitulo mt-1.5 max-w-[64ch]">
                Carga los criterios de calificación, las trece etapas del proceso y los
                supuestos de referencia —costo de obra por m², WACC, margen mínimo,
                tarifas—. Es un punto de partida editable, no una verdad: cada cifra
                queda con su fuente anotada. Si la organización no está en Colombia, las
                tarifas locales se crean vacías en vez de sembrarse con un número que
                nadie tendría motivo para revisar.
              </p>
              <p className="subtitulo mt-1.5 max-w-[64ch]">
                Se puede volver a pulsar: completa lo que falte y no pisa lo que ya ajustaste.
              </p>
              <button className="b b-pri b-sm mt-4" onClick={arrancar} disabled={sembrando}>
                {sembrando ? 'Cargando…' : 'Poner en marcha'}
              </button>
            </section>
          )}

          {d.cifras.every(c => !Number(c.valor)) ? (
            <div className="tarjeta p-8">
              <p className="titular" style={{ fontSize: 19 }}>Todavía no hay nada que mirar</p>
              <p className="subtitulo mt-1.5 max-w-[62ch]">
                El panel se arma con el inventario, la demanda y los desarrollos que se
                cargan. Las pestañas de al lado son donde se construye; esta es donde se
                mira. La primera cifra que tiene sentido aparece en cuanto haya inmuebles
                con área y precio.
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

              {/* Dónde. Va al final porque contesta la última pregunta: con el
                  cuadro ya leído, en qué municipios está lo que se acaba de
                  ver. No lo filtra el Filtrador —el mapa ES el filtro por
                  municipio, y recortarlo a uno lo dejaría sin nada que decir. */}
              <MapaMunicipios mapa={mapa} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* Municipio, tipología y canal: las tres preguntas que se hacen sobre este
   panel. Salen de los datos que hay, no de un catálogo fijo, porque una
   inmobiliaria de Pamplona no quiere elegir entre veinte municipios donde no
   opera.

   Todo en una tira, no en una tarjeta con seis campos apilados: un panel de
   filtros que ocupa media pantalla compite con lo que vino a filtrarse. */
function Filtrador({ filtros, setFiltros, opciones }: {
  filtros: FiltrosREI; setFiltros: (f: FiltrosREI) => void; opciones: OpcionesFiltro;
}) {
  const set = (k: keyof FiltrosREI) => (v: string) => setFiltros({ ...filtros, [k]: v || undefined });
  /* El período no cuenta como filtro: tiene su propio control, y decir
     «quitar 3 filtros» cuando dos son el mes de inicio y el de fin hace que el
     botón prometa más de lo que hace. */
  const puestos = Object.entries(filtros)
    .filter(([k, v]) => v && k !== 'desde' && k !== 'hasta').length;

  const rango: Rango = { desde: filtros.desde, hasta: filtros.hasta };
  const lista = (xs: string[]) => xs.map(x => ({ id: x }));

  return (
    <section className="no-imprimir">
      <div className="filtros">
        <Elige label="Municipio" valor={filtros.municipio ?? ''} onChange={set('municipio')}
               opciones={lista(opciones.municipios)} nombre={o => o.id} vacio="Todos" />
        <Elige label="Tipología" valor={filtros.tipo ?? ''} onChange={set('tipo')}
               opciones={lista(opciones.tipos)} nombre={o => o.id} vacio="Todas" />
        <Elige label="Canal" valor={filtros.canal ?? ''} onChange={set('canal')}
               opciones={lista(opciones.canales)} nombre={o => o.id} vacio="Todos" />
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
