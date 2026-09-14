import type { FilaComuna } from '@/components/mapa/MapaChile';

/* Dónde está el negocio, sin mapa.
   ---------------------------------------------------------------------------
   El mapa del panel dibuja las regiones de Chile y solo esas. Para una empresa
   de cualquier otro país no hay forma que dibujar, y enseñarle un país ajeno
   —o el suyo en blanco, porque sus departamentos no calzan con ninguna región
   chilena— es peor que no enseñar nada.

   Así que va la lista sola. No es un consuelo: el propio `MapaChile` dice en
   su cabecera que «la lista es la que da los números y el mapa es el que da la
   forma». Aquí simplemente falta la forma.

   Se ordena por venta y no alfabéticamente: la pregunta de esta tarjeta es
   dónde se vende más, y una lista alfabética obliga a leerla entera para
   contestarla. */

interface Props {
  filas: FilaComuna[];
  /** Cuántos clientes activos hay en total, tengan lugar anotado o no. */
  total: number;
  formato: (v: number) => string;
  /** Cómo se llama por allá la unidad territorial: municipio, distrito, cantón. */
  division: string;
}

const CUANTAS = 12;

export function ListaLugares({ filas, total, formato, division }: Props) {
  if (filas.length === 0) {
    return (
      <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
        {total === 0
          ? 'Todavía no hay clientes cargados. En cuanto los haya, aquí se ve dónde vende la empresa.'
          : `Ninguno de tus ${total} clientes tiene ${division.toLowerCase()} anotado en su ficha.`}
      </p>
    );
  }

  const ordenadas = [...filas].sort((a, b) =>
    (Number(b.ventas) || 0) - (Number(a.ventas) || 0) || b.clientes - a.clientes);
  const visibles = ordenadas.slice(0, CUANTAS);
  const ubicados = filas.reduce((s, f) => s + f.clientes, 0);

  return (
    <div className="grid gap-1.5">
      {visibles.map(c => (
        <div key={c.comuna + (c.region ?? '')} className="flex items-baseline gap-3"
             style={{ fontSize: 'var(--texto-md)' }}>
          <span className="flex-1 min-w-0 truncate">
            {c.comuna}
            {c.region && (
              <span style={{ color: 'var(--color-faint)', fontSize: 11 }}> · {c.region}</span>
            )}
          </span>
          <span className="tabular-nums shrink-0" style={{ color: 'var(--color-faint)', fontSize: 11 }}>
            {c.clientes} cli.
          </span>
          <span className="cifra shrink-0 text-right" style={{ width: 100 }}>
            {Number(c.ventas) > 0 ? formato(c.ventas) : '—'}
          </span>
        </div>
      ))}

      {ordenadas.length > CUANTAS && (
        <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-faint)' }}>
          y {ordenadas.length - CUANTAS} más.
        </p>
      )}

      {/* Los que no tienen el lugar anotado. Sin esto, la suma de la lista no
          cuadra con el total de clientes y no se sabe por qué. */}
      {total > ubicados && (
        <p className="pt-3 mt-1" style={{ fontSize: 11, color: 'var(--color-faint)',
                                          borderTop: '1px solid var(--color-line)' }}>
          {total - ubicados} cliente(s) sin {division.toLowerCase()} en su ficha: no entran en esta lista.
        </p>
      )}
    </div>
  );
}
