import { useState } from 'react';
import { dineroLlano, cantidad } from '@/lib/formato';
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

   DOS PESOS, no uno. `destacada` es la versión heroica: tres o cuatro por
   pantalla. Dieciséis tarjetas idénticas no son un panel, son una lista, y
   obligan a leerlas todas para encontrar la que importa.

   Un valor nulo no se dibuja como 0. «No se puede calcular» y «vale cero» son
   respuestas distintas, y confundirlas es justo el tipo de error que este
   módulo existe para no cometer. */

export function escribe(v: number | null | undefined, f?: Formato, moneda?: string): string {
  if (v == null) return '—';
  switch (f) {
    case 'dinero':     return dineroLlano(v, moneda);
    case 'porcentaje': return `${cantidad(v, 1)}%`;
    case 'numero':     return cantidad(v);
    case 'dias':       return `${cantidad(v)} días`;
    case 'meses':      return v === 0 ? 'inmediato' : `${cantidad(v)} ${v === 1 ? 'mes' : 'meses'}`;
    default:           return String(v);
  }
}

export const colorTono = (t?: string) =>
  t === 'malo'  ? 'var(--color-danger)'
: t === 'aviso' ? 'var(--color-aviso)'
: t === 'ok'    ? 'var(--color-ok)'
: undefined;

export function TarjetaCifra({ ind, moneda, destacada }:
  { ind: Indicador; moneda: string; destacada?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const nulo = ind.valor == null;

  return (
    <div className={`cifra-tarjeta ${destacada ? 'cifra-tarjeta-alta' : ''}`}
         data-abierta={abierta ? 'true' : 'false'}>
      <button type="button" onClick={() => setAbierta(a => !a)}
              aria-expanded={abierta} aria-label={`Ver cómo se calcula ${ind.etiqueta}`}
              className="porque no-imprimir">
        {abierta ? '×' : 'i'}
      </button>

      <button type="button" onClick={() => setAbierta(a => !a)}
              className="w-full text-left block" aria-expanded={abierta}>
        <span className="rotulo block pr-6" style={{ color: 'var(--color-muted)' }}>{ind.etiqueta}</span>
        <span className="valor block"
              style={{ color: nulo ? 'var(--color-faint)' : colorTono(ind.tono) }}
              title={escribe(ind.valor, ind.formato, moneda)}>
          {escribe(ind.valor, ind.formato, moneda)}
        </span>
        {ind.nota && (
          <span className="block text-[11.5px] mt-1.5" style={{ color: 'var(--color-faint)' }}>{ind.nota}</span>
        )}
      </button>

      {abierta && (
        <div className="formula entra">
          <p>{ind.formula}</p>
          {ind.insumos.length > 0 && (
            <dl>
              {ind.insumos.map((i: Insumo, n) => (
                <div key={`${i.etiqueta}-${n}`} className="insumo">
                  <dt>{i.etiqueta}</dt>
                  <dd>{escribe(i.valor, i.formato, moneda)}</dd>
                </div>
              ))}
            </dl>
          )}
          {nulo && (
            <p style={{ color: 'var(--color-faint)' }}>
              No se puede calcular con los datos que hay. No es cero: falta un dato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* Los avisos de validación. Los bloqueantes impiden marcar un modelo como
   validado; los otros solo se ven. La diferencia se dice con el color Y con la
   palabra: un tablero que solo habla en rojo y verde no se lee en gris. */
export function Avisos({ avisos, titulo }: { avisos: Aviso[]; titulo?: string }) {
  const [todos, setTodos] = useState(false);
  if (avisos.length === 0) return null;

  const bloq = avisos.filter(a => a.nivel === 'bloqueante');
  /* Con más de tres, se muestran los bloqueantes y el resto se pide. Nueve
     cajas de aviso apiladas empujan las cifras fuera de la pantalla, que es
     justo lo contrario de avisar. */
  const visibles = todos || avisos.length <= 3 ? avisos : [...bloq, ...avisos.filter(a => a.nivel !== 'bloqueante')].slice(0, 3);
  const ocultos = avisos.length - visibles.length;

  return (
    <section className="grid gap-2 aparece">
      {titulo && (
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="rotulo">{titulo}</h2>
          {bloq.length > 0 && (
            <span className="marca marca-malo">
              {bloq.length} {bloq.length === 1 ? 'bloquea' : 'bloquean'}
            </span>
          )}
          {avisos.length > bloq.length && (
            <span className="marca">{avisos.length - bloq.length} por revisar</span>
          )}
        </div>
      )}
      {visibles.map((a, i) => (
        <div key={`${a.clave}-${i}`} className="aviso-caja" data-nivel={a.nivel}>
          <span className={`marca ${a.nivel === 'bloqueante' ? 'marca-malo' : 'marca-aviso'} shrink-0 mt-0.5`}>
            {a.nivel === 'bloqueante' ? 'Bloquea' : 'Aviso'}
          </span>
          <div className="min-w-0">
            <b className="text-[13.5px] font-bold">{a.titulo}</b>
            <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{a.detalle}</p>
          </div>
        </div>
      ))}
      {ocultos > 0 && (
        <button className="b b-fan b-sm justify-self-start no-imprimir" onClick={() => setTodos(true)}>
          Ver {ocultos} aviso{ocultos === 1 ? '' : 's'} más
        </button>
      )}
    </section>
  );
}

/* Un desplegable con etiqueta. Se repite en las cuatro pantallas de capital y
   nunca merece copiarse cuatro veces. */
export function Elige<T extends { id: string }>({ label, valor, onChange, opciones, nombre, vacio, ancho }:
  { label: string; valor: string; onChange: (v: string) => void;
    opciones: T[]; nombre: (o: T) => string; vacio?: string; ancho?: number }) {
  return (
    <label className="grid gap-1.5 min-w-0" style={{ width: ancho, flex: ancho ? 'none' : '1 1 190px' }}>
      <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>{label}</span>
      <select className="campo" value={valor} onChange={e => onChange(e.target.value)}>
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map(o => <option key={o.id} value={o.id}>{nombre(o)}</option>)}
      </select>
    </label>
  );
}

/* La cabecera de una pantalla: qué estás mirando y qué puedes hacer con ello.
   Existe para que las cuatro empiecen igual — antes cada una inventaba su
   propia fila de título y las alturas no coincidían al cambiar de pestaña. */
export function Cabecera({ titulo, nota, marcas, acciones }: {
  titulo: string; nota?: string;
  marcas?: React.ReactNode; acciones?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[17px] font-extrabold tracking-tight">{titulo}</h1>
          {marcas}
        </div>
        {nota && <p className="text-[12.5px] text-muted mt-1 max-w-[70ch]">{nota}</p>}
      </div>
      {acciones && <div className="ml-auto flex gap-2 flex-wrap no-imprimir">{acciones}</div>}
    </div>
  );
}
