import { useState } from 'react';
import { dinero, cantidad } from '@/lib/formato';
import type { Indicador, Insumo, Formato, Aviso } from '@/services/capital.service';

/* Una cifra que se puede abrir.
   ---------------------------------------------------------------------------
   El encargo es explícito: ninguna cifra calculada sin trazabilidad. Esta
   tarjeta es dónde se cumple. Se pulsa y se despliega la fórmula con la que se
   obtuvo y los datos que entraron en ella —los mismos que usó PostgreSQL, no
   una reconstrucción.

   Eso importa más de lo que parece. Una cifra sin origen se discute a ciegas:
   quien la mira solo puede creerla o no. Con la fórmula a la vista, la
   conversación pasa a ser sobre el supuesto, que es donde debería estar.

   Un valor nulo no se dibuja como 0. «No se puede calcular» y «vale cero» son
   respuestas distintas, y confundirlas es justo el tipo de error que este
   módulo existe para no cometer. */

export function escribe(v: number | null | undefined, f?: Formato, moneda?: string): string {
  if (v == null) return '—';
  switch (f) {
    case 'dinero':     return dinero(v, moneda);
    case 'porcentaje': return `${cantidad(v, 1)}%`;
    case 'numero':     return cantidad(v);
    case 'dias':       return `${cantidad(v)} días`;
    case 'meses':      return v === 0 ? 'inmediato' : `${cantidad(v)} ${v === 1 ? 'mes' : 'meses'}`;
    default:           return String(v);
  }
}

const tono = (t?: string) =>
  t === 'malo'  ? 'var(--color-danger)'
: t === 'aviso' ? 'var(--color-aviso)'
: t === 'ok'    ? 'var(--color-ok)'
: undefined;

export function TarjetaCifra({ ind, moneda, ancha }:
  { ind: Indicador; moneda: string; ancha?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const nulo = ind.valor == null;

  return (
    <div className={`tarjeta p-4 ${ancha ? 'sm:col-span-2' : ''}`}>
      <button type="button" onClick={() => setAbierta(a => !a)}
              aria-expanded={abierta}
              className="w-full text-left"
              title="Ver de dónde sale esta cifra">
        <div className="flex items-baseline gap-2">
          <span className="rotulo">{ind.etiqueta}</span>
          <span className="ml-auto text-[11px] text-faint shrink-0" aria-hidden="true">
            {abierta ? '−' : '?'}
          </span>
        </div>
        <div className="cifra-grande mt-2"
             style={{ color: nulo ? 'var(--color-faint)' : tono(ind.tono) }}>
          {escribe(ind.valor, ind.formato, moneda)}
        </div>
        {ind.nota && <div className="mt-1.5 text-[11.5px] text-faint">{ind.nota}</div>}
      </button>

      {abierta && (
        <div className="entra mt-3 pt-3 border-t border-line grid gap-2">
          <p className="text-[12.5px] text-muted leading-snug">{ind.formula}</p>
          {ind.insumos.length > 0 && (
            <dl className="grid gap-1">
              {ind.insumos.map((i: Insumo, n) => (
                <div key={`${i.etiqueta}-${n}`} className="flex items-baseline gap-2 text-[12.5px]">
                  <dt className="text-faint truncate">{i.etiqueta}</dt>
                  <dd className="ml-auto tabular-nums font-bold shrink-0">
                    {escribe(i.valor, i.formato, moneda)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {nulo && (
            <p className="text-[12px] text-faint">
              No se puede calcular con los datos que hay. No es cero: falta un dato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* Los avisos de validación. Los bloqueantes impiden marcar un modelo como
   validado; los otros solo se ven. La diferencia se dice con el color y con la
   palabra, no solo con el color. */
export function Avisos({ avisos, titulo }: { avisos: Aviso[]; titulo?: string }) {
  if (avisos.length === 0) return null;
  const bloq = avisos.filter(a => a.nivel === 'bloqueante');

  return (
    <section className="grid gap-2 aparece">
      {titulo && (
        <h2 className="rotulo">
          {titulo}
          {bloq.length > 0 && (
            <span className="marca marca-malo ml-2">{bloq.length} bloquea{bloq.length === 1 ? '' : 'n'}</span>
          )}
        </h2>
      )}
      {avisos.map((a, i) => (
        <div key={`${a.clave}-${i}`}
             className="rounded-xl border p-3.5 flex gap-3 items-start"
             style={{
               borderColor: a.nivel === 'bloqueante' ? 'var(--color-danger)' : 'var(--color-line)',
               background: a.nivel === 'bloqueante' ? 'color-mix(in srgb, var(--color-danger) 7%, transparent)'
                                                    : 'var(--color-surface)'
             }}>
          <span className={`marca ${a.nivel === 'bloqueante' ? 'marca-malo' : 'marca-aviso'} shrink-0 mt-0.5`}>
            {a.nivel === 'bloqueante' ? 'Bloquea' : 'Aviso'}
          </span>
          <div className="min-w-0">
            <b className="text-[13.5px] font-bold">{a.titulo}</b>
            <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{a.detalle}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/* Un desplegable con etiqueta. Se repite en las tres pantallas de capital y
   nunca merece copiarse cuatro veces. */
export function Elige<T extends { id: string }>({ label, valor, onChange, opciones, nombre, vacio }:
  { label: string; valor: string; onChange: (v: string) => void;
    opciones: T[]; nombre: (o: T) => string; vacio?: string }) {
  return (
    <label className="grid gap-1 min-w-0">
      <span className="rotulo">{label}</span>
      <select className="campo" value={valor} onChange={e => onChange(e.target.value)}>
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map(o => <option key={o.id} value={o.id}>{nombre(o)}</option>)}
      </select>
    </label>
  );
}
