import { useEffect, useMemo, useState } from 'react';
import { cargarPanel, type Panel } from '@/services/panel.service';
import { Serie } from '@/components/graficos/Serie';
import { Columnas } from '@/components/graficos/Columnas';
import { Tramos } from '@/components/graficos/Tramos';
import { MapaChile } from '@/components/mapa/MapaChile';
import { dinero, dineroCorto, cantidad, variacion, mesCorto, diaCorto, cuando } from '@/lib/formato';

/* La pantalla de inicio de ANIMA COMPANY.
   ---------------------------------------------------------------------------
   Antes eran ocho cifras en fila. Ocho cifras no son un panel: son ocho cifras.
   Ninguna decía si el número era bueno, contra qué, ni qué había que hacer.

   El orden de la pantalla es el orden en que se pregunta:
     1. ¿Cómo va el mes?          — una cifra grande y su tendencia
     2. ¿Qué tengo que mirar hoy? — las señales, ordenadas por gravedad
     3. ¿Y el resto del negocio?  — margen, cobro, compras
     4. ¿Va mejor o peor que antes? — doce meses
     5. ¿Quién me debe, y hace cuánto?
     6. ¿Qué sale ahora?          — los pedidos vivos
     7. ¿Qué se me está acabando o venciendo?
     8. ¿Dónde vendo?             — el mapa

   Nada de esto se calcula aquí: viene entero de `panel_inicio()`. */

interface Props { companyId: string; moneda: string; empresa: string; linea: string | null }

export function Inicio({ companyId, moneda, empresa, linea }: Props) {
  const [p, setP] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    cargarPanel(companyId)
      .then(d => { if (vivo) setP(d); })
      .catch(e => { if (vivo) setError(e.message ?? 'No se pudo cargar el panel.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [companyId]);

  const plata = (v: number) => dinero(v, moneda);
  const corta = (v: number) => dineroCorto(v, moneda);

  const senales = useMemo(() => (p ? construyeSenales(p, plata) : []), [p, moneda]);

  const arranque = !!p && p.mes.pedidos === 0 && p.pedidos.length === 0
                        && p.meses.every(m => Number(m.ventas) === 0);

  if (cargando) return <Esqueleto />;

  if (error) {
    return (
      <p role="alert" className="entra tarjeta p-4"
         style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>
        {error}
      </p>
    );
  }
  if (!p) return null;

  const cambio = variacion(p.mes.ventas, p.mes.ventas_antes);

  return (
    <div className="grid gap-5">

      {/* ---------------------------------------------------------- cabecera */}
      <header className="aparece flex flex-wrap items-end gap-x-6 gap-y-3 min-w-0">
        <div className="min-w-0">
          <div className="rotulo rotulo-tenue">{linea ?? 'ANIMA COMPANY'}</div>
          <h1 className="titular mt-1">{empresa}</h1>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Chip n={p.hoy.sale_hoy}     texto="salen hoy"     tono={p.hoy.sale_hoy ? 'acento' : undefined} />
          <Chip n={p.hoy.en_reparto}   texto="en reparto"    tono={p.hoy.en_reparto ? 'aviso' : undefined} />
          <Chip n={p.hoy.por_preparar} texto="por preparar" />
          <Chip n={p.hoy.entregados}   texto="entregados hoy" tono={p.hoy.entregados ? 'ok' : undefined} />
        </div>
      </header>

      {/* ------------------------------------------------ el mes y las señales */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
        <section className="tarjeta p-5 aparece aparece-1">
          <h2 className="rotulo">Ventas del mes</h2>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2">
            <span className="cifra-heroe">{plata(p.mes.ventas)}</span>
            {cambio && (
              <span className="marca" style={{
                background: cambio.signo > 0 ? 'color-mix(in srgb, var(--color-ok) 13%, transparent)'
                          : cambio.signo < 0 ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)'
                          : 'var(--color-sunk)',
                color: cambio.signo > 0 ? '#2c6b49' : cambio.signo < 0 ? 'var(--color-danger)' : 'var(--color-ink-2)'
              }}>
                {cambio.texto}
              </span>
            )}
          </div>
          <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
            {cambio
              ? <>Contra los mismos {p.mes.dia} días del mes pasado — no contra el mes cerrado, que a esta altura siempre parece un desastre.</>
              : <>Día {p.mes.dia} de {p.mes.dias}. Sin mes anterior con qué comparar todavía.</>}
          </p>

          <div className="mt-5">
            <h3 className="rotulo rotulo-tenue mb-2">Últimos 30 días</h3>
            <Serie puntos={p.dias.map(d => ({
                     etiqueta: diaCorto(d.dia),
                     valor: Number(d.ventas) || 0,
                     nota: Number(d.pedidos) ? `${cantidad(d.pedidos)} pedido(s)` : undefined }))}
                   formato={corta} />
          </div>
        </section>

        <section className="tarjeta p-5 aparece aparece-2">
          <h2 className="rotulo">Señales</h2>
          <p style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }} className="mt-1 mb-3">
            Lo que pide atención, de lo más grave a lo menos.
          </p>
          {senales.length === 0
            ? <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
                Nada urgente. No es que no haya nada que hacer: es que nada se está poniendo feo.
              </p>
            : <div className="grid gap-2">
                {senales.map((s, i) => (
                  <div key={i} className="flex gap-2.5 items-start rounded-xl px-3 py-2.5"
                       style={{ background: 'var(--color-sunk)' }}>
                    <span className="rounded-full shrink-0 mt-1.5"
                          style={{ width: 6, height: 6, background: TONO[s.tono] }} />
                    <span style={{ fontSize: 'var(--texto-md)', lineHeight: 1.4 }}>
                      {s.texto}
                      {s.detalle && (
                        <span className="block" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                          {s.detalle}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>}
        </section>
      </div>

      {/* ------------------------------------------------------ puesta en marcha */}
      {arranque && (
        <section className="tarjeta p-6 aparece aparece-2">
          <h2 className="titular" style={{ fontSize: 20 }}>Todavía no hay un solo pedido</h2>
          <p className="subtitulo mt-1.5">
            El panel está entero y funcionando: son las cifras las que están en cero.
            Se llena solo a medida que se opera — no hay nada que configurar aquí.
            El orden que menos duele es clientes, productos y después el primer pedido.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------------ el resto */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 aparece aparece-2">
        <Dato l="Margen del mes" v={plata(p.mes.margen)}
              n={p.mes.ventas > 0 ? `${Math.round((p.mes.margen / p.mes.ventas) * 100)}% sobre la venta` : undefined} />
        <Dato l="Por cobrar" v={plata(p.cobro.por_cobrar)}
              n={`${cantidad(p.cobro.documentos)} documento(s)`}
              alerta={p.cobro.vencido > 0 ? `${plata(p.cobro.vencido)} vencido` : undefined} />
        <Dato l="Compras del mes" v={plata(p.compras_mes)} n="recibidas" />
        <Dato l="Pedidos del mes" v={cantidad(p.mes.pedidos)}
              n={p.mes.pedidos > 0 ? `ticket ${plata(p.mes.ventas / p.mes.pedidos)}` : undefined} />
      </div>

      {/* ------------------------------------------------- doce meses y cobranza */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
        <Bloque titulo="Doce meses"
                nota="Lo apilado suma la venta: abajo el costo, arriba lo que quedó.">
          <Columnas
            columnas={p.meses.map(m => ({
              etiqueta: mesCorto(m.mes),
              partes: {
                margen: Math.max(0, Number(m.margen) || 0),
                costo: Math.max(0, (Number(m.ventas) || 0) - (Number(m.margen) || 0))
              },
              nota: Number(m.pedidos) ? `${cantidad(m.pedidos)} pedido(s)` : undefined
            }))}
            /* Margen arriba y en el tono fuerte; el costo debajo, en un paso
               claro del MISMO tono. Son dos partes de una venta, no dos cosas
               distintas: con dos colores plenos el costo —que casi siempre es
               el trozo grande— gritaba más que el dato que importa. */
            series={[
              { clave: 'margen', nombre: 'Margen', color: 'var(--dato-1)' },
              { clave: 'costo',  nombre: 'Costo',  color: 'var(--rampa-1)' }
            ]}
            formato={corta} />
        </Bloque>

        <Bloque titulo="Lo que te deben"
                nota="No es lo mismo deber hace tres días que hace tres meses.">
          <Tramos formato={plata}
                  tramos={p.cobranza.map(t => ({
                    clave: String(t.orden), nombre: t.tramo,
                    monto: Number(t.monto) || 0, documentos: Number(t.documentos) || 0 }))} />
        </Bloque>
      </div>

      {/* --------------------------------------------------------- qué sale ahora */}
      <Bloque titulo="Qué sale ahora"
              nota="Los pedidos vivos, primero los que están más cerca de la puerta.">
        {p.pedidos.length === 0
          ? <Nada texto="No hay pedidos abiertos. Todo lo que entró está entregado o cancelado." />
          : <div className="desliza -mx-5 px-5">
              <table className="tabla">
                <thead>
                  <tr>
                    <th className="ancla">Pedido</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Entrega</th>
                    <th className="num">Total</th>
                    <th className="num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {p.pedidos.map(o => (
                    <tr key={o.id}>
                      <td className="ancla principal">{o.codigo}</td>
                      <td>
                        {o.cliente}
                        {o.comuna && <span style={{ color: 'var(--color-faint)' }}> · {o.comuna}</span>}
                      </td>
                      <td><span className={`marca ${MARCA_ESTADO[o.estado] ?? ''}`}>{ESTADO[o.estado] ?? o.estado}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {diaCorto(o.entrega)}
                        <span style={{ color: 'var(--color-faint)' }}> · {cuando(o.entrega)}</span>
                      </td>
                      <td className="num cifra">{plata(o.total)}</td>
                      <td className="num cifra" style={{ color: Number(o.saldo) > 0 ? 'var(--color-danger)' : 'var(--color-faint)' }}>
                        {Number(o.saldo) > 0 ? plata(o.saldo) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </Bloque>

      {/* ----------------------------------------------------- stock y vencimientos */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Bloque titulo="Bajo el mínimo" nota="Productos activos con menos stock del que definiste.">
          {p.stock_critico.length === 0
            ? <Nada texto="Nada bajo mínimo. O el stock está sano, o falta definir mínimos en el catálogo." />
            : <div className="desliza -mx-5 px-5">
                <table className="tabla">
                  <thead>
                    <tr><th className="ancla">Producto</th><th className="num">Hay</th>
                        <th className="num">Mínimo</th><th className="num">Falta</th></tr>
                  </thead>
                  <tbody>
                    {p.stock_critico.map(s => (
                      <tr key={s.nombre}>
                        <td className="ancla principal">{s.nombre}</td>
                        <td className="num cifra">{cantidad(s.disponible, 1)} {s.unidad}</td>
                        <td className="num" style={{ color: 'var(--color-muted)' }}>{cantidad(s.minimo, 1)}</td>
                        <td className="num cifra text-danger">{cantidad(s.falta, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </Bloque>

        <Bloque titulo="Vence esta semana"
                nota="Un negocio de fresco no pierde por vender poco: pierde por botar.">
          {p.por_vencer.length === 0
            ? <Nada texto="Nada vence en los próximos siete días." />
            : <div className="desliza -mx-5 px-5">
                <table className="tabla">
                  <thead>
                    <tr><th className="ancla">Producto</th><th>Lote</th>
                        <th className="num">Cantidad</th><th>Vence</th><th className="num">Valor</th></tr>
                  </thead>
                  <tbody>
                    {p.por_vencer.map(v => (
                      <tr key={v.lote}>
                        <td className="ancla principal">{v.producto}</td>
                        <td style={{ color: 'var(--color-muted)' }}>{v.lote}</td>
                        <td className="num cifra">{cantidad(v.cantidad, 1)} {v.unidad}</td>
                        <td style={{ whiteSpace: 'nowrap', color: v.dias <= 2 ? 'var(--color-danger)' : undefined }}>
                          {cuando(v.vence)}
                        </td>
                        <td className="num cifra">{plata(v.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </Bloque>
      </div>

      {/* ------------------------------------------------------------------ mapa */}
      <Bloque titulo="Dónde vendes"
              nota="Clientes activos por región, y las comunas con más venta en 180 días.">
        <MapaChile comunas={p.mapa.comunas} total={p.mapa.total} formato={plata} />
      </Bloque>

      <p style={{ fontSize: 11, color: 'var(--color-faint)' }}>
        Todo lo de esta pantalla lo calcula la base en una sola consulta, y solo devuelve
        lo de tu empresa. Otro usuario, con esta misma pantalla, vería lo suyo.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ señales */

type Tono = 'malo' | 'aviso' | 'ok' | 'neutro';
interface Senal { tono: Tono; texto: React.ReactNode; detalle?: string }

const TONO: Record<Tono, string> = {
  malo: 'var(--color-danger)', aviso: 'var(--color-aviso)',
  ok: 'var(--color-ok)', neutro: 'var(--color-faint)'
};
const PESO: Record<Tono, number> = { malo: 0, aviso: 1, neutro: 2, ok: 3 };

/* Las señales se derivan de lo que ya vino: no hay una consulta más. Se ordenan
   por gravedad, porque una lista donde lo urgente aparece tercero se lee como
   si nada fuera urgente. */
function construyeSenales(p: Panel, plata: (v: number) => string): Senal[] {
  const s: Senal[] = [];

  if (p.cobro.vencido > 0) s.push({
    tono: 'malo',
    texto: <><b>{plata(p.cobro.vencido)}</b> vencido sin cobrar</>,
    detalle: `${p.cobro.vencidos} documento(s) pasados de fecha.`
  });

  const viejo = p.cobranza.find(t => t.orden === 5 && Number(t.monto) > 0);
  if (viejo) s.push({
    tono: 'malo',
    texto: <><b>{plata(viejo.monto)}</b> lleva más de 90 días</>,
    detalle: 'A esa altura ya no es cobranza, es una pérdida que todavía no se anotó.'
  });

  if (p.por_vencer.length > 0) {
    const valor = p.por_vencer.reduce((a, v) => a + (Number(v.valor) || 0), 0);
    s.push({
      tono: 'malo',
      texto: <><b>{p.por_vencer.length} lote(s)</b> vencen esta semana</>,
      detalle: `${plata(valor)} en bodega con fecha encima.`
    });
  }

  if (p.stock_critico.length > 0) s.push({
    tono: 'aviso',
    texto: <><b>{p.stock_critico.length} producto(s)</b> bajo el mínimo</>,
    detalle: p.stock_critico.slice(0, 3).map(x => x.nombre).join(' · ')
  });

  const cambio = variacion(p.mes.ventas, p.mes.ventas_antes);
  if (cambio && cambio.signo < 0) s.push({
    tono: 'aviso',
    texto: <>El mes va <b>{cambio.texto}</b> respecto al anterior</>,
    detalle: `Comparado con los mismos ${p.mes.dia} días de hace un mes.`
  });

  if (p.mes.ventas > 0 && p.mes.margen <= 0) s.push({
    tono: 'malo',
    texto: <>Se vendió con <b>margen cero o negativo</b> este mes</>,
    detalle: 'O los costos de los pedidos están mal cargados, o se está vendiendo a pérdida.'
  });

  if (p.hoy.en_reparto > 0) s.push({
    tono: 'neutro',
    texto: <><b>{p.hoy.en_reparto} pedido(s)</b> en la calle ahora mismo</>
  });

  if (cambio && cambio.signo > 0) s.push({
    tono: 'ok',
    texto: <>El mes va <b>{cambio.texto}</b> sobre el anterior</>
  });

  return s.sort((a, b) => PESO[a.tono] - PESO[b.tono]).slice(0, 5);
}

/* ---------------------------------------------------------------- piezas */

const Bloque = ({ titulo, nota, children }:
  { titulo: string; nota?: string; children: React.ReactNode }) => (
  <section className="tarjeta p-5 aparece aparece-3">
    <h2 className="rotulo">{titulo}</h2>
    {nota && <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>{nota}</p>}
    <div className={nota ? '' : 'mt-3'}>{children}</div>
  </section>
);

const Nada = ({ texto }: { texto: string }) => (
  <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>{texto}</p>
);

const Dato = ({ l, v, n, alerta }: { l: string; v: string; n?: string; alerta?: string }) => (
  <div className="tarjeta p-4 toque">
    <div className="rotulo">{l}</div>
    <div className="cifra-grande mt-2">{v}</div>
    {alerta && <div className="mt-1.5 text-danger" style={{ fontSize: 11.5, fontWeight: 'var(--peso-fuerte)' }}>{alerta}</div>}
    {n && !alerta && <div className="mt-1.5" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>{n}</div>}
  </div>
);

const Chip = ({ n, texto, tono }: { n: number; texto: string; tono?: 'ok' | 'aviso' | 'acento' }) => (
  <span className={`marca ${tono ? 'marca-' + tono : ''}`}>
    <b className="tabular-nums">{cantidad(n)}</b> {texto}
  </span>
);

const ESTADO: Record<string, string> = {
  nuevo: 'Nuevo', confirmado: 'Confirmado', en_preparacion: 'En preparación',
  preparado: 'Preparado', en_reparto: 'En reparto', entregado: 'Entregado', cancelado: 'Cancelado'
};
const MARCA_ESTADO: Record<string, string> = {
  nuevo: '', confirmado: 'marca-acento', en_preparacion: 'marca-acento',
  preparado: 'marca-acento', en_reparto: 'marca-aviso', entregado: 'marca-ok'
};

/* Mientras carga se dibuja la forma de la pantalla, no un «Cargando…». Así no
   salta el contenido cuando llega, que es lo que hace que una app se sienta
   lenta aunque tarde lo mismo. */
const Esqueleto = () => (
  <div className="grid gap-5" aria-busy="true" aria-label="Cargando el panel">
    <div className="h-9 w-64 rounded-lg" style={{ background: 'var(--color-sunk)' }} />
    <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      <div className="tarjeta" style={{ height: 300 }} />
      <div className="tarjeta" style={{ height: 300 }} />
    </div>
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 94 }} />)}
    </div>
  </div>
);
