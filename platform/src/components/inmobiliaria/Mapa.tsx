import { useState } from 'react';
import { MapaColombia, type PuntoMapa } from '@/components/mapa/MapaColombia';
import type { MapaREI } from '@/services/inmobiliaria.service';

/* Dónde está el inventario y dónde está la demanda.
   ---------------------------------------------------------------------------
   Dos capas sobre el mismo mapa, y se miran de a una. Superponerlas —una
   burbuja de inventario y otra de demanda en el mismo municipio— produce dos
   círculos concéntricos que no se pueden comparar ni leer por separado; y en
   este negocio la pregunta interesante es justamente la resta entre las dos,
   que ya la contesta la lista de brecha por tipología del propio panel.

   Así que se alterna. La capa que se está mirando manda el tamaño de la
   burbuja, y al pasar por encima la otra aparece en el globo: en Pamplona hay
   200 inmuebles Y 162 compradores, y las dos cifras se ven sin cambiar de capa. */

type Capa = 'inmuebles' | 'disponibles' | 'compradores';

const CAPAS: { id: Capa; nombre: string; metrica: string }[] = [
  { id: 'inmuebles',   nombre: 'Inventario',  metrica: 'inmuebles' },
  { id: 'disponibles', nombre: 'Disponibles', metrica: 'disponibles' },
  { id: 'compradores', nombre: 'Demanda',     metrica: 'compradores' }
];

export function MapaMunicipios({ mapa }: { mapa: MapaREI | null }) {
  const [capa, setCapa] = useState<Capa>('inmuebles');
  if (!mapa || mapa.municipios.length === 0) return null;

  const def = CAPAS.find(c => c.id === capa)!;

  const puntos: PuntoMapa[] = mapa.municipios.map(m => ({
    lugar: m.municipio,
    /* El departamento de la empresa, no el del inmueble: la ficha no lo trae,
       y una firma de Pamplona que escribe «La Unión» habla de la de Norte de
       Santander. Es un supuesto, pero es el único que no inventa nada nuevo. */
    departamento: mapa.departamento,
    valor: m[capa],
    detalle: [
      { etiqueta: 'inmuebles',   valor: String(m.inmuebles) },
      { etiqueta: 'disponibles', valor: String(m.disponibles) },
      { etiqueta: 'vendidos',    valor: String(m.vendidos) },
      { etiqueta: 'compradores', valor: String(m.compradores) }
    ].filter(d => d.etiqueta !== def.metrica)
  }));

  const total = capa === 'compradores' ? mapa.total_compradores
              : capa === 'inmuebles'   ? mapa.total_inmuebles
              : mapa.municipios.reduce((s, m) => s + m.disponibles, 0);

  return (
    <section className="tarjeta p-5 grid gap-4 entra">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="rotulo">Dónde está el negocio</div>
          <p className="subtitulo mt-1.5">
            Cada burbuja es un municipio, en su sitio. El área es la cantidad.
          </p>
        </div>
        <div role="tablist" className="flex gap-1 flex-wrap no-imprimir">
          {CAPAS.map(c => (
            <button key={c.id} role="tab" aria-selected={c.id === capa}
                    onClick={() => setCapa(c.id)} className="pest">
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      <MapaColombia puntos={puntos} metrica={def.metrica} total={total} />
    </section>
  );
}
