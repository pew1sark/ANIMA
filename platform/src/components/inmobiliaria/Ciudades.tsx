import { useEffect, useMemo, useState } from 'react';
import { cargarCiudades, type Ciudades } from '@/services/inmobiliaria.service';
import { Cabecera } from '@/components/capital/Cifra';
import { Periodo, type Rango } from '@/components/capital/Periodo';
import { dinero, cantidad, mesCorto } from '@/lib/formato';

/* PANEL CIUDAD POR CIUDAD · §14
   ---------------------------------------------------------------------------
   El mismo cuadro del panel comercial, abierto por municipio. Es lo que
   permite separar «va mal el mes» de «va mal Pamplona».

   LA LISTA SALE DE LOS DATOS, NO DE UN CATÁLOGO. El documento de auditoría
   propone cuatro municipios; el inventario real tiene otros, uno de los
   propuestos no tiene ni un inmueble, y el segundo mercado por tamaño no
   estaba en la lista. Un panel que enseña los municipios deseados en vez de
   los que existen no es un panel: es una intención.

   `canon / m²` es la columna que justifica la pantalla en un negocio de
   arriendo. Dos municipios con el mismo canon medio y áreas distintas no son
   el mismo mercado, y el canon a secas no lo dice. */

export function PanelCiudades({ companyId }: { companyId: string }) {
  const [rango, setRango] = useState<Rango>({});
  const [d, setD] = useState<Ciudades | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    cargarCiudades(companyId, rango)
      .then(r => vivo && setD(r))
      .catch(e => vivo && setError((e as Error).message ?? 'No se pudo cargar.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId, rango.desde, rango.hasta]);

  const moneda = d?.moneda ?? 'COP';
  const plata = (v: number | null) => (v == null ? '—' : dinero(v, moneda));

  /* El municipio más grande fija la escala de la barra. Comparar cada uno
     contra el mayor es lo que hace visible la concentración real. */
  const tope = useMemo(
    () => Math.max(1, ...(d?.ciudades ?? []).map(c => c.inventario)), [d]);

  const totales = useMemo(() => {
    const cs = d?.ciudades ?? [];
    return {
      inventario: cs.reduce((a, c) => a + c.inventario, 0),
      disponibles: cs.reduce((a, c) => a + c.disponibles, 0),
      captaciones: cs.reduce((a, c) => a + c.captaciones, 0),
      cierres: cs.reduce((a, c) => a + c.cierres, 0),
      comision: cs.reduce((a, c) => a + Number(c.comision || 0), 0),
      leads: cs.reduce((a, c) => a + c.leads, 0),
      visitas: cs.reduce((a, c) => a + c.visitas, 0),
      pipeline: cs.reduce((a, c) => a + Number(c.pipeline || 0), 0)
    };
  }, [d]);

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Por municipio"
        nota={d ? `Inventario, captación, cierre y demanda de cada municipio, en ${moneda}. La lista son los municipios que existen en el inventario, no una lista definida de antemano.` : undefined}
        marcas={d && <span className="marca marca-acento">{moneda}</span>}
        acciones={<button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      <section className="tarjeta p-4 flex flex-wrap items-end gap-3">
        <Periodo valor={rango} onChange={setRango} etiqueta="Mes" />
      </section>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && <div className="tarjeta" style={{ height: 300 }} aria-busy="true" />}

      {!cargando && d && (d.ciudades.length === 0 ? (
        <div className="tarjeta p-8">
          <p className="titular" style={{ fontSize: 19 }}>Todavía no hay inventario</p>
          <p className="subtitulo mt-1.5 max-w-[60ch]">
            Esta pantalla se arma sola a partir de la ciudad de cada inmueble. En cuanto
            haya inmuebles cargados, cada municipio aparece con su propio cuadro.
          </p>
        </div>
      ) : (
        <>
          <section className="tarjeta p-5">
            <h2 className="rotulo">
              El cuadro por municipio · {mesCorto(d.periodo.desde)}
              {d.periodo.desde !== d.periodo.hasta && ` a ${mesCorto(d.periodo.hasta)}`}
            </h2>
            <p className="mt-1 mb-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
              Inventario y disponibles son de hoy; captaciones, cierres y comisión son del
              tramo elegido. «Canon / m²» sale de cruzar el canon del contrato con el área
              del inmueble: es lo que distingue dos mercados de arriendo con el mismo canon.
            </p>

            <div className="desliza -mx-5 px-5">
              <table className="tabla">
                <thead>
                  <tr>
                    <th className="ancla">Municipio</th>
                    <th className="num">Inventario</th>
                    <th className="num">Disponibles</th>
                    <th className="num">Captaciones</th>
                    <th className="num">Leads</th>
                    <th className="num">Visitas</th>
                    <th className="num">Cierres</th>
                    <th className="num">Comisión</th>
                    <th className="num">Pipeline</th>
                    <th className="num">Precio / m²</th>
                    <th className="num">Canon / m²</th>
                    <th className="num">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {d.ciudades.map(c => (
                    <tr key={c.ciudad}>
                      <td className="ancla principal">
                        {c.ciudad}
                        {/* La barra pone en evidencia la concentración: casi
                            siempre un municipio es el negocio y el resto es
                            presencia. */}
                        <span className="block rounded-sm" style={{
                          height: 3, marginTop: 4, background: 'var(--dato-1)',
                          width: `${Math.max(2, (c.inventario / tope) * 100)}%` }} />
                      </td>
                      <td className="num cifra">{cantidad(c.inventario)}</td>
                      <td className="num">{cantidad(c.disponibles)}</td>
                      <td className="num">{c.captaciones ? cantidad(c.captaciones) : '—'}</td>
                      <td className="num">{c.leads ? cantidad(c.leads) : '—'}</td>
                      <td className="num">{c.visitas ? cantidad(c.visitas) : '—'}</td>
                      <td className="num cifra">{c.cierres ? cantidad(c.cierres) : '—'}</td>
                      <td className="num cifra">{Number(c.comision) ? plata(c.comision) : '—'}</td>
                      <td className="num">{Number(c.pipeline) ? plata(c.pipeline) : '—'}</td>
                      <td className="num">{plata(c.precio_m2)}</td>
                      <td className="num">{plata(c.canon_m2)}</td>
                      <td className="num" style={{ color: 'var(--color-muted)' }}>
                        {c.dias_mercado == null ? '—' : cantidad(c.dias_mercado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-line)' }}>
                    <td className="ancla principal">Total</td>
                    <td className="num cifra">{cantidad(totales.inventario)}</td>
                    <td className="num">{cantidad(totales.disponibles)}</td>
                    <td className="num">{totales.captaciones ? cantidad(totales.captaciones) : '—'}</td>
                    <td className="num">{totales.leads ? cantidad(totales.leads) : '—'}</td>
                    <td className="num">{totales.visitas ? cantidad(totales.visitas) : '—'}</td>
                    <td className="num cifra">{totales.cierres ? cantidad(totales.cierres) : '—'}</td>
                    <td className="num cifra">{totales.comision ? plata(totales.comision) : '—'}</td>
                    <td className="num">{totales.pipeline ? plata(totales.pipeline) : '—'}</td>
                    {/* Precio y canon por m² NO se suman ni se promedian aquí:
                        un promedio de promedios sin ponderar por área daría una
                        cifra que no es el precio de nada. */}
                    <td className="num" style={{ color: 'var(--color-faint)' }}>—</td>
                    <td className="num" style={{ color: 'var(--color-faint)' }}>—</td>
                    <td className="num" style={{ color: 'var(--color-faint)' }}>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <p style={{ fontSize: 11, color: 'var(--color-faint)' }}>
            El precio y el canon por m² del total quedan en blanco a propósito: promediar
            promedios de municipio sin ponderar por área daría una cifra que no es el
            precio de nada.
          </p>
        </>
      ))}
    </div>
  );
}
