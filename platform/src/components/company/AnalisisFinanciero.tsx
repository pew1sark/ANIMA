import { useEffect, useMemo, useState } from 'react';
import { cargarAnalisis, type Analisis, type Tramo,
         type ClienteAnalisis, type ProductoAnalisis } from '@/services/analisis.service';
import { Columnas } from '@/components/graficos/Columnas';
import { Tramos } from '@/components/graficos/Tramos';
import { dinero, dineroCorto, cantidad, variacion, mesCorto } from '@/lib/formato';

/* ANÁLISIS FINANCIERO
   ---------------------------------------------------------------------------
   Informes responde "cuánto vendí". Esto responde lo otro, que es lo que se
   pregunta cuando la venta ya está: si el negocio gana plata, dónde se queda,
   quién le debe y a quién le debe, y qué mirar primero.

   Todo lo calcula `analisis_financiero()` en la base. Aquí no se suma: se
   ordena en el orden en que se responde una pregunta.

     1 · el resultado         ¿gané o perdí?
     2 · qué mirar primero    lo que está torcido, dicho sin rodeos
     3 · el resultado en el tiempo
     4 · la caja              ganar y tener plata no son lo mismo
     5 · quién debe y a quién, con antigüedad
     6 · de dónde sale el margen: clientes y productos
     7 · en qué se va: gastos

   El párrafo de "Lectura del período" existe porque una pantalla de cifras
   deja el trabajo a medias: la respuesta no es el número, es qué significa. */

const PERIODOS = [
  { dias: 30,  nombre: '30 días' },
  { dias: 90,  nombre: '90 días' },
  { dias: 180, nombre: '6 meses' },
  { dias: 365, nombre: '1 año' }
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function AnalisisFinanciero({ companyId, moneda }:
  { companyId: string; moneda: string }) {
  const [dias, setDias] = useState<number>(180);
  const [a, setA] = useState<Analisis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null); setSinAcceso(false);
    cargarAnalisis(companyId, iso(new Date(Date.now() - dias * 86400000)), iso(new Date()))
      .then(d => { if (!vivo) return; if (!d) setSinAcceso(true); else setA(d); })
      .catch(e => { if (vivo) setError(e.message ?? 'No se pudo cargar el análisis.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [companyId, dias]);

  const plata  = (v: unknown) => dinero(v, moneda);
  const corta  = (v: number) => dineroCorto(v, moneda);

  const lectura = useMemo(() => (a ? leerElPeriodo(a, moneda) : []), [a, moneda]);

  if (cargando) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 94 }} />)}
        </div>
        <div className="tarjeta" style={{ height: 240 }} />
      </div>
    );
  }

  if (sinAcceso) {
    return (
      <div className="tarjeta p-6">
        <p className="titular" style={{ fontSize: 19 }}>El análisis es de Finanzas</p>
        <p className="subtitulo mt-1.5">
          Esta pantalla muestra resultado, deuda y márgenes de toda la empresa.
          Se abre desde el nivel de Finanzas hacia arriba; quien administra tu
          empresa puede darte ese rol.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="entra tarjeta p-4"
         style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
    );
  }
  if (!a) return null;

  const r = a.resultado;
  const sinNada = !r.ingresos && !r.gastos && !a.cobrar.total && !a.pagar.total && !a.caja.cobros;

  return (
    <div className="grid gap-4 aparece">
      {/* ---------- período ---------- */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="rotulo">Análisis financiero</div>
          <p className="subtitulo mt-1.5 max-w-[62ch]">
            Del {fecha(a.periodo.desde)} al {fecha(a.periodo.hasta)}. Se compara con
            los {a.periodo.dias} días anteriores ({fecha(a.antes.desde)} a {fecha(a.antes.hasta)}).
          </p>
        </div>
        <div role="tablist" className="ml-auto flex gap-1 flex-wrap">
          {PERIODOS.map(p => (
            <button key={p.dias} role="tab" aria-selected={dias === p.dias}
                    onClick={() => setDias(p.dias)} className="pest">
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {sinNada && (
        <div className="tarjeta p-6">
          <p className="titular" style={{ fontSize: 19 }}>Todavía no hay movimiento que analizar</p>
          <p className="subtitulo mt-1.5">
            En este período no hay pedidos, gastos ni cobros registrados. El análisis
            se llena solo a medida que se opera; prueba con un período más largo.
          </p>
        </div>
      )}

      {/* ---------- 1 · el resultado ---------- */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Ingresos" valor={plata(r.ingresos)}
               nota={`${plural(r.pedidos, 'pedido')} · ticket ${plata(r.ticket)}`}
               cambio={variacion(r.ingresos, a.antes.ingresos)} />
        <Cifra etiqueta="Margen bruto" valor={plata(r.margen_bruto)}
               nota={r.margen_pct != null ? `${cantidad(r.margen_pct, 1)}% de la venta` : 'sin costo cargado'}
               cambio={variacion(r.margen_bruto, a.antes.margen_bruto)} />
        <Cifra etiqueta="Gastos y mermas" valor={plata(r.gastos + r.mermas)}
               nota={r.mermas > 0 ? `${plata(r.mermas)} en mermas` : 'sin mermas registradas'}
               cambio={variacion(r.gastos, a.antes.gastos)} invertido />
        <Cifra etiqueta="Resultado del período" valor={plata(r.resultado_neto)}
               nota="margen menos gastos y mermas"
               tono={r.resultado_neto < 0 ? 'malo' : r.resultado_neto > 0 ? 'ok' : undefined}
               cambio={variacion(r.resultado_neto, a.antes.resultado_neto)} />
      </div>

      {/* ---------- 2 · qué mirar primero ---------- */}
      {a.alertas.length > 0 && (
        <section className="grid gap-2">
          <h2 className="rotulo">Qué mirar primero</h2>
          {a.alertas.map(al => (
            <div key={al.clave}
                 className={`rounded-xl border p-4 ${
                   al.tono === 'malo' ? 'border-danger/25 bg-danger/8' : 'border-accent/30 bg-accent/8'}`}>
              <b className="text-[14px] font-bold"
                 style={{ color: al.tono === 'malo' ? 'var(--color-danger)' : 'var(--color-accent-deep)' }}>
                {al.titulo}
              </b>
              <p className="text-[12.5px] text-muted mt-1">{al.detalle}</p>
            </div>
          ))}
        </section>
      )}

      {/* ---------- la lectura ---------- */}
      {lectura.length > 0 && (
        <section className="tarjeta p-5">
          <h2 className="rotulo">Lectura del período</h2>
          <ul className="grid gap-2 mt-3">
            {lectura.map((l, i) => (
              <li key={i} className="text-[13.5px] leading-relaxed flex gap-2.5">
                <span className="shrink-0" style={{ color: 'var(--color-accent-deep)' }}>·</span>
                <span dangerouslySetInnerHTML={{ __html: l }} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- 3 · el resultado en el tiempo ---------- */}
      {a.series.mensual.length > 0 && (
        <section className="tarjeta p-5">
          <h2 className="rotulo">Mes a mes</h2>
          <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
            Costo y margen suman la venta del mes. Los gastos van aparte porque no
            se restan de una venta concreta.
          </p>
          <Columnas
            columnas={a.series.mensual.map(m => ({
              etiqueta: mesCorto(m.mes),
              partes: { costo: Number(m.costo) || 0, margen: Number(m.margen) || 0 }
            }))}
            series={[{ clave: 'costo',  nombre: 'Costo',  color: 'var(--dato-2)' },
                     { clave: 'margen', nombre: 'Margen', color: 'var(--dato-1)' }]}
            modo="apilado" formato={corta} />
        </section>
      )}

      {/* ---------- 4 · la caja ---------- */}
      <section className="tarjeta p-5">
        <h2 className="rotulo">Caja del período</h2>
        <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
          Lo que entró y salió de verdad, por cobros y pagos registrados. Ganar y
          tener plata no son lo mismo: esta es la segunda pregunta.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Cifra etiqueta="Cobrado" valor={plata(a.caja.cobros)} tono="ok" />
          <Cifra etiqueta="Pagado"  valor={plata(a.caja.pagos)} />
          <Cifra etiqueta="Diferencia" valor={plata(a.caja.neto)}
                 tono={a.caja.neto < 0 ? 'malo' : 'ok'}
                 nota={a.caja.neto < 0 ? 'salió más de lo que entró' : 'entró más de lo que salió'} />
        </div>
        {a.series.caja.length > 0 && (
          <div className="mt-4">
            <Columnas
              columnas={a.series.caja.map(m => ({
                etiqueta: mesCorto(m.mes),
                partes: { cobros: Number(m.cobros) || 0, pagos: Number(m.pagos) || 0 }
              }))}
              series={[{ clave: 'cobros', nombre: 'Cobros', color: 'var(--dato-1)' },
                       { clave: 'pagos',  nombre: 'Pagos',  color: 'var(--dato-2)' }]}
              modo="agrupado" formato={corta} />
          </div>
        )}
      </section>

      {/* ---------- 5 · quién debe y a quién ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Posicion titulo="Te deben" deuda={a.cobrar} tramos={a.aging_cobros}
                  etiquetaDias="Días en cobrar" plata={plata}
                  vacio="No te deben nada. Todo lo facturado está pagado." />
        <Posicion titulo="Debes" deuda={a.pagar} tramos={a.aging_pagos}
                  etiquetaDias="Días en pagar" plata={plata}
                  vacio="No debes nada. Todo lo comprado está pagado." />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <Cifra etiqueta="Inventario" valor={plata(a.inventario.valor)}
               nota={`${plural(a.inventario.lotes, 'lote')} disponibles`} />
        <Cifra etiqueta="Compras del período" valor={plata(r.compras)}
               cambio={variacion(r.compras, a.antes.compras)} invertido />
        <Cifra etiqueta="Capital de trabajo" valor={plata(a.capital_trabajo)}
               nota="por cobrar + inventario − por pagar"
               tono={a.capital_trabajo < 0 ? 'malo' : undefined} />
      </div>

      {/* ---------- 6 · de dónde sale el margen ---------- */}
      {a.clientes.length > 0 && <TablaClientes filas={a.clientes} plata={plata} />}
      {a.productos.length > 0 && <TablaProductos filas={a.productos} plata={plata} />}

      {/* ---------- 7 · en qué se va ---------- */}
      {a.gastos.length > 0 && (
        <section className="tarjeta p-5">
          <h2 className="rotulo">En qué se va el gasto</h2>
          <div className="desliza -mx-5 px-5 mt-3">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="ancla">Categoría</th>
                  <th className="num">Monto</th>
                  <th className="num">Peso</th>
                  <th className="num">Movimientos</th>
                </tr>
              </thead>
              <tbody>
                {a.gastos.map(g => (
                  <tr key={g.categoria}>
                    <td className="ancla principal">{g.categoria}</td>
                    <td className="num cifra">{plata(g.monto)}</td>
                    <td className="num cifra">{cantidad(g.participacion, 1)}%</td>
                    <td className="num cifra">{cantidad(g.movimientos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- piezas ---------- */

function Cifra({ etiqueta, valor, nota, tono, cambio, invertido }: {
  etiqueta: string; valor: string; nota?: string;
  tono?: 'ok' | 'malo' | 'aviso';
  cambio?: { texto: string; signo: -1 | 0 | 1 } | null;
  /** En gastos y compras, subir es malo: el color se da vuelta. */
  invertido?: boolean;
}) {
  const color = tono === 'malo' ? 'var(--color-danger)'
              : tono === 'ok' ? 'var(--color-ok)'
              : tono === 'aviso' ? 'var(--color-aviso)' : undefined;
  const bueno = cambio ? (invertido ? cambio.signo < 0 : cambio.signo > 0) : false;
  const malo  = cambio ? (invertido ? cambio.signo > 0 : cambio.signo < 0) : false;

  return (
    <div className="tarjeta p-4 toque">
      <div className="rotulo">{etiqueta}</div>
      <div className="cifra-grande mt-2" style={{ color }}>{valor}</div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {cambio && (
          <span className="text-[11.5px] font-bold"
                style={{ color: bueno ? 'var(--color-ok)' : malo ? 'var(--color-danger)' : 'var(--color-faint)' }}>
            {cambio.texto} vs. antes
          </span>
        )}
        {nota && <span style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>{nota}</span>}
      </div>
    </div>
  );
}

function Posicion({ titulo, deuda, tramos, etiquetaDias, plata, vacio }: {
  titulo: string; deuda: { total: number; vencido: number; documentos: number; dias: number | null };
  tramos: Tramo[]; etiquetaDias: string; plata: (v: unknown) => string; vacio: string;
}) {
  const pctVencido = deuda.total > 0 ? Math.round((deuda.vencido / deuda.total) * 100) : 0;
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">{titulo}</h2>
      {deuda.total <= 0 ? (
        <p className="mt-3" style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>{vacio}</p>
      ) : (
        <>
          <div className="cifra-grande mt-2">{plata(deuda.total)}</div>
          <p className="mt-1.5" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>
            {plural(deuda.documentos, 'documento')}
            {deuda.vencido > 0 && (
              <> · <b style={{ color: 'var(--color-danger)' }}>{plata(deuda.vencido)} vencido ({pctVencido}%)</b></>
            )}
            {deuda.dias != null && <> · {etiquetaDias.toLowerCase()}: {cantidad(deuda.dias)}</>}
          </p>
          <div className="mt-4">
            <Tramos formato={plata}
                    tramos={tramos.map(t => ({ clave: String(t.orden), nombre: t.tramo,
                                               monto: Number(t.monto) || 0, documentos: t.documentos }))} />
          </div>
        </>
      )}
    </section>
  );
}

function TablaClientes({ filas, plata }:
  { filas: ClienteAnalisis[]; plata: (v: unknown) => string }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">Rentabilidad por cliente</h2>
      <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
        Un cliente que pesa mucho no es solo una buena noticia: es el riesgo con
        nombre. La columna «peso» es cuánto de tu venta depende de él.
      </p>
      <div className="desliza -mx-5 px-5 mt-3">
        <table className="tabla">
          <thead>
            <tr>
              <th className="ancla">Cliente</th>
              <th className="num">Ventas</th>
              <th className="num">Margen</th>
              <th className="num">Margen %</th>
              <th className="num">Peso</th>
              <th className="num">Debe</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(c => (
              <tr key={c.nombre}>
                <td className="ancla principal">{c.nombre}</td>
                <td className="num cifra">{plata(c.ventas)}</td>
                <td className="num cifra">{plata(c.margen)}</td>
                <td className="num cifra"
                    style={{ color: (c.margen_pct ?? 100) < 15 ? 'var(--color-danger)' : undefined }}>
                  {c.margen_pct != null ? `${cantidad(c.margen_pct, 1)}%` : '—'}
                </td>
                <td className="num cifra"
                    style={{ color: c.participacion >= 30 ? 'var(--color-aviso)' : undefined }}>
                  {cantidad(c.participacion, 1)}%
                </td>
                <td className="num cifra"
                    style={{ color: c.deuda > 0 ? 'var(--color-danger)' : undefined }}>
                  {c.deuda > 0 ? plata(c.deuda) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TablaProductos({ filas, plata }:
  { filas: ProductoAnalisis[]; plata: (v: unknown) => string }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="rotulo">Rentabilidad por producto</h2>
      <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
        Lo que más se vende no siempre es lo que más deja. Aquí se ven las dos
        cosas juntas.
      </p>
      <div className="desliza -mx-5 px-5 mt-3">
        <table className="tabla">
          <thead>
            <tr>
              <th className="ancla">Producto</th>
              <th className="num">Unidades</th>
              <th className="num">Ventas</th>
              <th className="num">Costo</th>
              <th className="num">Margen</th>
              <th className="num">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(p => (
              <tr key={p.nombre}>
                <td className="ancla principal">{p.nombre}</td>
                <td className="num cifra">{cantidad(p.unidades, 1)}</td>
                <td className="num cifra">{plata(p.ventas)}</td>
                <td className="num cifra">{plata(p.costo)}</td>
                <td className="num cifra"
                    style={{ color: p.margen < 0 ? 'var(--color-danger)' : undefined }}>
                  {plata(p.margen)}
                </td>
                <td className="num cifra"
                    style={{ color: (p.margen_pct ?? 100) < 0 ? 'var(--color-danger)'
                                   : (p.margen_pct ?? 100) < 15 ? 'var(--color-aviso)' : undefined }}>
                  {p.margen_pct != null ? `${cantidad(p.margen_pct, 1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- la lectura ----------
   Las mismas cifras, dichas en frases. No es adorno: quien mira esto una vez
   al mes necesita saber qué cambió y qué hacer, y eso no está en una tabla.
   Cada frase sale de un dato; ninguna se inventa una tendencia que no hay. */
function leerElPeriodo(a: Analisis, moneda: string): string[] {
  const f: string[] = [];
  const p = (v: unknown) => `<b class="tabular-nums">${dinero(v, moneda)}</b>`;
  const r = a.resultado;

  if (!r.ingresos && !r.gastos) return f;

  if (r.ingresos > 0) {
    const v = variacion(r.ingresos, a.antes.ingresos);
    f.push(`Vendiste ${p(r.ingresos)} en ${plural(r.pedidos, 'pedido')}` +
           (v ? `, ${v.texto} respecto del período anterior.` : '.'));
  }

  if (r.margen_pct != null) {
    f.push(`De cada 100 que vendes te quedan <b>${cantidad(r.margen_pct, 1)}</b> antes de gastos.` +
           (r.margen_pct < 15 ? ' Es poco margen para absorber un imprevisto.' : ''));
  }

  if (r.gastos > 0 || r.mermas > 0) {
    const gasto = r.gastos + r.mermas;
    const peso = r.margen_bruto > 0 ? Math.round((gasto / r.margen_bruto) * 100) : null;
    f.push(`Gastos y mermas suman ${p(gasto)}` +
           (peso != null ? `, que es el <b>${peso}%</b> de tu margen.` : '.'));
  }

  f.push(r.resultado_neto >= 0
    ? `El período cierra con ${p(r.resultado_neto)} a favor.`
    : `El período cierra con ${p(Math.abs(r.resultado_neto))} en contra: el margen no cubrió los gastos.`);

  if (a.cobrar.total > 0) {
    const venc = a.cobrar.vencido > 0
      ? ` De eso, ${p(a.cobrar.vencido)} ya está vencido.` : ' Nada está vencido todavía.';
    f.push(`Te deben ${p(a.cobrar.total)} en ${plural(a.cobrar.documentos, 'documento')}.${venc}`);
  }

  if (a.caja.cobros > 0 || a.caja.pagos > 0) {
    f.push(a.caja.neto >= 0
      ? `En caja entró ${p(a.caja.neto)} más de lo que salió.`
      : `En caja salió ${p(Math.abs(a.caja.neto))} más de lo que entró.`);
  }

  const mayor = a.clientes[0];
  if (mayor && mayor.participacion >= 30) {
    f.push(`<b>${escapa(mayor.nombre)}</b> es el ${cantidad(mayor.participacion, 1)}% de tu venta. ` +
           `Si se va, se va esa parte del negocio.`);
  }

  const perdida = a.productos.filter(x => (x.margen ?? 0) < 0);
  if (perdida.length > 0) {
    f.push(`${perdida.length === 1 ? 'Un producto se vende' : `${perdida.length} productos se venden`} ` +
           `bajo su costo: ${perdida.slice(0, 3).map(x => escapa(x.nombre)).join(', ')}.`);
  }

  return f;
}

/* "38 documentos" y "1 documento". El paréntesis del plural —documento(s)— es
   de formulario, no de alguien contándote cómo va tu negocio. */
const plural = (n: number, uno: string, muchos = uno + 's') =>
  `${cantidad(n)} ${n === 1 ? uno : muchos}`;

/* Los nombres vienen de la base y se insertan como HTML para poder poner una
   cifra en negrita en medio de la frase. Lo que viene de datos, escapado. */
const escapa = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fecha = (iso: string) => {
  const [a, m, d] = iso.split('-');
  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m} ${a?.slice(2)}`;
};
