import type { Campo, Opcion } from '@/core/datos/tipos';

/* Cómo se ve y cómo se escribe cada tipo de campo. Un solo lugar: si mañana
   las fechas se muestran distinto, cambian en toda la aplicación a la vez. */

export const money = (n: unknown) =>
  n == null || n === '' ? '—' : '$' + Math.round(Number(n)).toLocaleString('es-CL');

export const numero = (n: unknown) =>
  n == null || n === '' ? '—' : Number(n).toLocaleString('es-CL');

export const fecha = (v: unknown) => {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? s
    : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' });
};

const TONOS: Record<string, string> = {
  neutro: 'bg-sunk text-muted',
  acento: 'bg-accent/15 text-accent-deep',
  ok:     'bg-ok/12 text-ok',
  aviso:  'bg-accent/20 text-accent-deep',
  malo:   'bg-danger/12 text-danger'
};

export function Distintivo({ opcion }: { opcion: Opcion }) {
  return (
    <span className={`inline-block text-[10.5px] uppercase tracking-wider font-extrabold
                      px-2 py-0.5 rounded-full whitespace-nowrap ${TONOS[opcion.tono ?? 'neutro']}`}>
      {opcion.nombre}
    </span>
  );
}

/** Lo que se ve en una celda o en una tarjeta. */
export function Muestra({ campo, valor, opciones }:
  { campo: Campo; valor: unknown; opciones?: Opcion[] }) {
  if (valor == null || valor === '') return <span className="text-faint">—</span>;

  switch (campo.tipo) {
    case 'moneda':   return <span className="tabular-nums">{money(valor)}</span>;
    case 'numero':
    case 'entero':   return <span className="tabular-nums">{numero(valor)}</span>;
    case 'fecha':    return <span className="tabular-nums">{fecha(valor)}</span>;
    case 'booleano': return <span>{valor ? 'Sí' : 'No'}</span>;
    case 'seleccion':
    case 'relacion': {
      const lista = opciones ?? campo.opciones ?? [];
      const o = lista.find(x => x.valor === String(valor));
      if (!o) return <span className="truncate">{String(valor)}</span>;
      return campo.tipo === 'seleccion'
        ? <Distintivo opcion={o} />
        : <span className="truncate">{o.nombre}</span>;
    }
    default:         return <span className="truncate">{String(valor)}</span>;
  }
}

export const entrada = 'campo';

/** Un campo escribible. Lo usan la ficha y la edición en la propia celda. */
export function Editor({ campo, valor, opciones, onChange, onListo, compacto }: {
  campo: Campo; valor: unknown; opciones?: Opcion[];
  onChange: (v: unknown) => void; onListo?: () => void; compacto?: boolean;
}) {
  const cls = compacto
    ? 'w-full px-2 py-1 rounded-md border border-accent bg-surface text-[13px] outline-none font-[inherit]'
    : entrada;
  const cerrar = { onBlur: onListo, autoFocus: compacto };

  /* Un <label> dentro de otro <label> hace que pulsar el texto alterne dos
     veces la casilla. Va como <span>. */
  if (campo.tipo === 'booleano') return (
    <span className="flex items-center gap-2 text-[13.5px]">
      <input type="checkbox" checked={!!valor} onChange={e => { onChange(e.target.checked); onListo?.(); }}
             className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer" />
      <span className="text-muted">{valor ? 'Sí' : 'No'}</span>
    </span>
  );

  if (campo.tipo === 'seleccion' || campo.tipo === 'relacion') {
    const lista = opciones ?? campo.opciones ?? [];
    return (
      <select value={valor == null ? '' : String(valor)} className={cls} {...cerrar}
              onChange={e => { onChange(e.target.value || null); onListo?.(); }}>
        <option value="">—</option>
        {lista.map(o => <option key={o.valor} value={o.valor}>{o.nombre}</option>)}
      </select>
    );
  }

  if (campo.tipo === 'texto-largo') return (
    <textarea rows={3} value={String(valor ?? '')} className={cls + ' resize-y'} {...cerrar}
              onChange={e => onChange(e.target.value)} />
  );

  const numerico = campo.tipo === 'numero' || campo.tipo === 'entero' || campo.tipo === 'moneda';
  return (
    <input
      type={campo.tipo === 'fecha' ? 'date' : 'text'}
      inputMode={numerico ? 'decimal' : undefined}
      value={campo.tipo === 'fecha' ? String(valor ?? '').slice(0, 10) : String(valor ?? '')}
      className={cls} {...cerrar}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onListo?.(); }
                        if (e.key === 'Escape') onListo?.(); }}
      onChange={e => {
        const v = e.target.value;
        if (!numerico) { onChange(v); return; }
        /* Se limpia al escribir, no al guardar: así el campo nunca acepta algo
           que la base vaya a rechazar después. */
        const limpio = campo.tipo === 'entero'
          ? v.replace(/[^\d-]/g, '')
          : v.replace(/[^\d.,-]/g, '').replace(',', '.');
        onChange(limpio === '' ? null : Number(limpio));
      }} />
  );
}
