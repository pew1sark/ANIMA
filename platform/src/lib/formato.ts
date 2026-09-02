/* Cómo se escribe un número en ANIMA.
   Estaba repetido en cada pantalla —`money`, `num`, `clp`, tres definiciones
   distintas de lo mismo— y bastaba con que una redondeara diferente para que
   dos pantallas dieran cifras distintas del mismo dato. */

const n = (v: unknown) => Number(v) || 0;

/** Dinero completo: $1.284.500. */
export const dinero = (v: unknown, moneda = 'CLP') =>
  moneda === 'CLP'
    ? '$' + Math.round(n(v)).toLocaleString('es-CL')
    : Math.round(n(v)).toLocaleString('es-CL') + ' ' + moneda;

/** Dinero abreviado, para ejes y cabeceras donde no cabe entero.
    1.284.500 → $1,3 M · 84.500 → $85 mil */
export function dineroCorto(v: unknown, moneda = 'CLP') {
  const x = Math.round(n(v));
  const s = x < 0 ? '-' : '';
  const a = Math.abs(x);
  const simbolo = moneda === 'CLP' ? '$' : '';
  if (a >= 1_000_000_000) return `${s}${simbolo}${(a / 1_000_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MM`;
  if (a >= 1_000_000)     return `${s}${simbolo}${(a / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  if (a >= 10_000)        return `${s}${simbolo}${Math.round(a / 1000).toLocaleString('es-CL')} mil`;
  return `${s}${simbolo}${a.toLocaleString('es-CL')}`;
}

/** Cantidades: 1.284 */
export const cantidad = (v: unknown, decimales = 0) =>
  n(v).toLocaleString('es-CL', { maximumFractionDigits: decimales });

/** Porcentaje con signo, para las comparaciones: +18% · −2% · = */
export function variacion(ahora: unknown, antes: unknown): { texto: string; signo: -1 | 0 | 1 } | null {
  const a = n(antes), b = n(ahora);
  if (a === 0) return null;                 // sin base no hay porcentaje honesto
  const p = Math.round(((b - a) / Math.abs(a)) * 100);
  if (p === 0) return { texto: 'igual', signo: 0 };
  return { texto: `${p > 0 ? '+' : '−'}${Math.abs(p)}%`, signo: p > 0 ? 1 : -1 };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-08' → 'ago 26' */
export function mesCorto(iso: string) {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1] ?? m} ${a?.slice(2)}`;
}

/** '2026-08-19' → '19 ago'. Sin `new Date()`: una fecha suelta no lleva zona
    horaria, y construir un Date con ella la corre un día en Chile. */
export function diaCorto(iso?: string | null) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m}`;
}

/** Cuántos días faltan o pasaron, dicho como se dice. */
export function cuando(iso?: string | null) {
  if (!iso) return '—';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  const dias = Math.round((new Date(a, m - 1, d).getTime() - hoy.getTime()) / 86400000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}
