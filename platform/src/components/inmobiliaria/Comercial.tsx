import { useEffect, useMemo, useState } from 'react';
import { cargarComercial, corredores, opcionesDeFiltro, cargarRegistros,
         type PanelComercial, type FiltrosComercial, type Corredor,
         type OpcionesFiltro, type PeldanoEmbudo, type Registros } from '@/services/inmobiliaria.service';
import { TarjetaCifra, Avisos, Elige, Cabecera } from '@/components/capital/Cifra';
import { Periodo, type Rango } from '@/components/capital/Periodo';
import { Grafico, Lista } from '@/components/panel/Cuadro';
import { cantidad, mesCorto, dinero, diaCorto } from '@/lib/formato';

/* EL PANEL COMERCIAL
   ---------------------------------------------------------------------------
   La pantalla de todos los días de una oficina de corretaje. El panel de al
   lado —Mercado— responde cómo está el inventario y la demanda, que se mira
   una vez por semana. Este responde tres preguntas que se hacen cada mañana:

     ¿qué se está cayendo?    las alertas, primero que nada
     ¿cómo va el mes?         comisión contra meta, y cuánto falta
     ¿qué hago hoy?           la agenda y lo que nadie se comprometió a tocar

   El orden no es estético. Un panel que abre con un gráfico de doce meses
   obliga a hacer scroll para llegar a «tres leads sin contactar desde el
   martes», y a la tercera vez ya nadie baja.

   Ninguna cifra se calcula aquí: todas vienen de `rei_comercial()` con su
   fórmula y sus insumos pegados, para que se puedan abrir y discutir. */

/* Las cuatro que responden «¿vamos bien?» sin abrir nada más. Comisión y meta
   juntas porque por separado no dicen nada: 7 millones es mucho o poco según
   contra qué. */
const HEROICAS = ['comision', 'meta', 'cumplimiento', 'forecast'];

/* Los nombres del embudo. Viven aquí y no en la base por lo mismo que las
   tipologías: son etiquetas de pantalla. Los VALORES sí los fija un check en
   PostgreSQL, porque de ellos cuelgan las fechas que estampa el trigger. */
/* Las cifras que tienen una lista de registros detrás. Las demás —cumplimiento,
   brecha, días hasta el primer contacto— son razones o promedios: no hay un
   conjunto de filas que las forme, y ofrecer un «ver los registros» que abre
   otra cosa es peor que no ofrecerlo. */
const CON_REGISTROS = new Set(['leads', 'cierres', 'comision', 'visitas',
                               'captaciones', 'forecast', 'sin_accion']);

const ETAPA: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', calificado: 'Calificado',
  con_inmueble: 'Con inmueble', visita_agendada: 'Visita agendada',
  visita_hecha: 'Visita hecha', oferta: 'Oferta', negociacion: 'En negociación',
  ganado: 'Ganado', perdido: 'Perdido'
};

export function PanelComercialInmobiliario({ companyId }: { companyId: string }) {
  const [rango, setRango] = useState<Rango>({});
  const [ciudad, setCiudad] = useState('');
  const [broker, setBroker] = useState('');
  const [d, setD] = useState<PanelComercial | null>(null);
  const [equipo, setEquipo] = useState<Corredor[]>([]);
  const [opciones, setOpciones] = useState<OpcionesFiltro>({ municipios: [], tipos: [], canales: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  /* §21 · los registros detrás de una cifra. Se piden al abrirla y no de
     antemano: traer las seis listas por si acaso sería pagar seis consultas
     para que casi siempre no se mire ninguna. */
  const [detalle, setDetalle] = useState<Registros | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const filtros: FiltrosComercial = useMemo(
    () => ({ ciudad: ciudad || undefined, broker: broker || undefined, ...rango }),
    [ciudad, broker, rango.desde, rango.hasta]);

  /* Las dos listas de opciones fallan en silencio a propósito: el panel entero
     no puede caerse porque un desplegable se quedó vacío. */
  useEffect(() => {
    let vivo = true;
    corredores(companyId).then(c => vivo && setEquipo(c)).catch(() => {});
    opcionesDeFiltro(companyId).then(o => vivo && setOpciones(o)).catch(() => {});
    return () => { vivo = false; };
  }, [companyId]);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null); setSinAcceso(false);
    cargarComercial(companyId, filtros)
      .then(r => { if (!vivo) return; if (!r) setSinAcceso(true); else setD(r); })
      .catch(e => vivo && setError((e as Error).message ?? 'No se pudo cargar el panel.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId, JSON.stringify(filtros)]);

  async function abrirDetalle(clave: string) {
    setCargandoDetalle(true); setDetalle(null);
    try {
      setDetalle(await cargarRegistros(companyId, clave, filtros));
    } catch (e) {
      setError((e as Error).message ?? 'No se pudieron cargar los registros.');
    } finally { setCargandoDetalle(false); }
  }

  if (sinAcceso) {
    return (
      <div className="tarjeta p-8 aparece">
        <p className="titular" style={{ fontSize: 20 }}>Este panel no es para tu nivel de acceso</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          El panel comercial consolida los leads, las negociaciones y las metas de la
          organización entera. Si entraste para trabajar tus leads, lo tuyo está en las
          pestañas <b>Leads</b> y <b>Negociaciones</b>.
        </p>
      </div>
    );
  }

  const heroicas = d?.cifras.filter(c => HEROICAS.includes(c.clave)) ?? [];
  const resto    = d?.cifras.filter(c => !HEROICAS.includes(c.clave)) ?? [];
  const vacio    = !!d && d.cifras.every(c => !Number(c.valor)) && !d.embudo.some(e => e.cantidad);

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Panel comercial"
        nota={d
          ? `Leads, visitas, negociaciones y metas, en ${d.moneda}. La comisión realizada y el pipeline ponderado van separados a propósito: sumarlos daría un número que no es ni lo que entró ni lo que va a entrar.`
          : undefined}
        marcas={d && <span className="marca marca-acento">{d.moneda}</span>}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <section className="tarjeta p-4 flex flex-wrap items-end gap-3">
        <Periodo valor={rango} onChange={setRango} etiqueta="Mes" />
        <Elige label="Ciudad" valor={ciudad} onChange={setCiudad} vacio="Todas"
               opciones={opciones.municipios.map(m => ({ id: m }))} nombre={m => m.id} />
        <Elige label="Responsable" valor={broker} onChange={setBroker} vacio="Toda la oficina"
               opciones={equipo} nombre={c => c.nombre} ancho={190} />
      </section>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && (
        <div className="grid gap-4" aria-busy="true" aria-label="Cargando el panel comercial">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 108 }} />)}
          </div>
          <div className="tarjeta" style={{ height: 200 }} />
        </div>
      )}

      {!cargando && d && (
        <>
          {/* Lo que se está cayendo, antes que cualquier cifra. */}
          <Avisos avisos={d.alertas} titulo={d.alertas.length ? 'Qué mirar primero' : undefined} />

          {vacio ? (
            <div className="tarjeta p-8">
              <p className="titular" style={{ fontSize: 19 }}>Todavía no hay operación que mirar</p>
              <p className="subtitulo mt-1.5 max-w-[64ch]">
                Este panel se arma solo a medida que se trabaja: un lead que entra, una
                visita que se agenda, una negociación que se abre. No hay nada que
                configurar aquí.
              </p>
              <p className="subtitulo mt-1.5 max-w-[64ch]">
                El orden que menos duele es <b>Leads</b> primero —basta el nombre y el
                teléfono—, y <b>Metas</b> cuando haya con qué compararse: sin meta cargada
                el panel puede decir cuánto se hizo, pero no si alcanza.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {heroicas.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={d.moneda} destacada
                                                 onDetalle={CON_REGISTROS.has(c.clave) ? abrirDetalle : undefined} />)}
              </div>

              <Embudo peldanos={d.embudo} />

              {(cargandoDetalle || detalle) && (
                <Registrados detalle={detalle} cargando={cargandoDetalle}
                             moneda={d.moneda} cerrar={() => setDetalle(null)} />
              )}

              <section className="grid gap-2.5">
                <h2 className="rotulo rotulo-tenue">
                  El resto del cuadro · {mesCorto(d.periodo.desde)} a {mesCorto(d.periodo.hasta)}
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {resto.map(c => <TarjetaCifra key={c.clave} ind={c} moneda={d.moneda}
                                                onDetalle={CON_REGISTROS.has(c.clave) ? abrirDetalle : undefined} />)}
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

/* EL EMBUDO
   ---------------------------------------------------------------------------
   Diez peldaños con su recuento. Se dibuja con barras proporcionales al mayor
   y no con un gráfico de embudo de verdad: en una oficina chica los números
   son de un dígito, y un embudo de trapecios sobre «3, 2, 1» es decoración
   que además miente sobre la precisión del dato.

   Ganado y perdido se pintan al lado y separados: no son peldaños por los que
   se pasa, son los dos finales. */
function Embudo({ peldanos }: { peldanos: PeldanoEmbudo[] }) {
  const abiertos = peldanos.filter(p => p.etapa !== 'ganado' && p.etapa !== 'perdido');
  const cerrados = peldanos.filter(p => p.etapa === 'ganado' || p.etapa === 'perdido');
  const tope = Math.max(1, ...abiertos.map(p => p.cantidad));
  const vivos = abiertos.reduce((a, p) => a + p.cantidad, 0);

  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">El embudo</h2>
      <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
        {vivos > 0
          ? <>Dónde están los {cantidad(vivos)} lead(s) vivos ahora mismo. Lo cerrado cuenta solo dentro del período.</>
          : <>No hay leads abiertos. Lo cerrado del período aparece al final.</>}
      </p>

      <div className="grid gap-1.5">
        {abiertos.map(p => (
          <div key={p.etapa} className="flex items-center gap-3">
            <span className="shrink-0" style={{ width: 130, fontSize: 'var(--texto-sm)',
                                                color: 'var(--color-muted)' }}>
              {ETAPA[p.etapa] ?? p.etapa}
            </span>
            <div className="flex-1 min-w-0 rounded-md overflow-hidden"
                 style={{ background: 'var(--color-sunk)', height: 18 }}>
              <div style={{ width: `${(p.cantidad / tope) * 100}%`, height: '100%',
                            background: p.cantidad ? 'var(--dato-1)' : 'transparent',
                            borderRadius: 6, transition: 'width .3s' }} />
            </div>
            <span className="shrink-0 cifra tabular-nums" style={{ width: 40, textAlign: 'right' }}>
              {cantidad(p.cantidad)}
            </span>
          </div>
        ))}
      </div>

      {cerrados.some(p => p.cantidad > 0) && (
        <div className="flex flex-wrap gap-2 mt-4 pt-3"
             style={{ borderTop: '1px solid var(--color-line)' }}>
          {cerrados.map(p => (
            <span key={p.etapa} className={`marca ${p.etapa === 'ganado' ? 'marca-ok' : 'marca-malo'}`}>
              <b className="tabular-nums">{cantidad(p.cantidad)}</b> {ETAPA[p.etapa]?.toLowerCase()}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* LOS REGISTROS DETRÁS DE UNA CIFRA · §21
   ---------------------------------------------------------------------------
   «34 leads → los 34 registros». Comparte clave y filtros con la cifra que se
   abrió, que es lo que garantiza que la lista sume exactamente el número. Un
   drill-down que devuelve una lista parecida es peor que no tenerlo: nadie
   vuelve a creer el número. */
function Registrados({ detalle, cargando, moneda, cerrar }:
  { detalle: Registros | null; cargando: boolean; moneda: string; cerrar: () => void }) {
  if (cargando) {
    return <section className="tarjeta p-5 entra" aria-busy="true"
                    style={{ minHeight: 120 }}><span className="rotulo">Buscando los registros…</span></section>;
  }
  if (!detalle) return null;

  const hayMonto = detalle.filas.some(f => f.monto != null);

  return (
    <section className="tarjeta p-5 entra">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="rotulo">{detalle.titulo ?? 'Registros'}</h2>
        {detalle.filas.length > 0 && (
          <span className="marca"><b className="tabular-nums">{cantidad(detalle.filas.length)}</b></span>
        )}
        <button className="b b-sec b-sm ml-auto no-imprimir" onClick={cerrar}>Cerrar</button>
      </div>

      {detalle.nota && (
        <p className="mt-2" style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
          {detalle.nota}
        </p>
      )}

      {!detalle.nota && detalle.filas.length === 0 && (
        <p className="mt-2" style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
          La cifra es cero y la lista también: no hay nada detrás que mirar.
        </p>
      )}

      {detalle.filas.length > 0 && (
        <div className="desliza -mx-5 px-5 mt-3">
          <table className="tabla">
            <thead>
              <tr>
                <th className="ancla">Código</th>
                <th>Nombre</th>
                <th>Etapa</th>
                <th>Ciudad</th>
                <th>Con quién</th>
                <th>Responsable</th>
                <th>Cuándo</th>
                {hayMonto && <th className="num">Monto</th>}
              </tr>
            </thead>
            <tbody>
              {detalle.filas.map((f, i) => (
                <tr key={`${f.codigo}-${i}`}>
                  <td className="ancla cifra" style={{ whiteSpace: 'nowrap' }}>{f.codigo}</td>
                  <td className="principal">{f.nombre}</td>
                  <td><span className="marca">{f.etapa}</span></td>
                  <td style={{ color: 'var(--color-muted)' }}>{f.ciudad}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{f.contacto}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{f.responsable}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{f.cuando ? diaCorto(f.cuando) : '—'}</td>
                  {hayMonto && (
                    <td className="num cifra">
                      {f.monto == null ? '—' : dinero(Number(f.monto), moneda)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
