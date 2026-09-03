/* Cómo se escribe un número en ANIMA.
   Estaba repetido en cada pantalla —`money`, `num`, `clp`, tres definiciones
   distintas de lo mismo— y bastaba con que una redondeara diferente para que
   dos pantallas dieran cifras distintas del mismo dato.

   Y todas escribían pesos chilenos. Una empresa en México veía "$" con puntos
   de miles chilenos y dos decimales de menos; el dato era correcto y la cifra,
   ilegible. Ahora la moneda de la empresa manda: su símbolo, su separador y
   sus decimales. */

const n = (v: unknown) => Number(v) || 0;

export interface Moneda {
  codigo: string;
  nombre: string;
  /** Con qué convenciones se escribe: separadores y posición del símbolo. */
  locale: string;
  /** Cuántos decimales tiene de verdad. El peso chileno no tiene centavos. */
  decimales: number;
}

/* El catálogo. No pretende ser la ISO entera: son las monedas en las que hoy
   se puede facturar de verdad en los países donde ANIMA se vende, más las de
   reserva que cualquiera acepta. Agregar una es una línea. */
export const MONEDAS: Moneda[] = [
  { codigo: 'CLP', nombre: 'Peso chileno',        locale: 'es-CL', decimales: 0 },
  { codigo: 'ARS', nombre: 'Peso argentino',      locale: 'es-AR', decimales: 2 },
  { codigo: 'BOB', nombre: 'Boliviano',           locale: 'es-BO', decimales: 2 },
  { codigo: 'BRL', nombre: 'Real brasileño',      locale: 'pt-BR', decimales: 2 },
  { codigo: 'COP', nombre: 'Peso colombiano',     locale: 'es-CO', decimales: 0 },
  { codigo: 'CRC', nombre: 'Colón costarricense', locale: 'es-CR', decimales: 0 },
  { codigo: 'DOP', nombre: 'Peso dominicano',     locale: 'es-DO', decimales: 2 },
  { codigo: 'GTQ', nombre: 'Quetzal',             locale: 'es-GT', decimales: 2 },
  { codigo: 'MXN', nombre: 'Peso mexicano',       locale: 'es-MX', decimales: 2 },
  { codigo: 'PEN', nombre: 'Sol peruano',         locale: 'es-PE', decimales: 2 },
  { codigo: 'PYG', nombre: 'Guaraní',             locale: 'es-PY', decimales: 0 },
  { codigo: 'UYU', nombre: 'Peso uruguayo',       locale: 'es-UY', decimales: 2 },
  { codigo: 'USD', nombre: 'Dólar estadounidense',locale: 'en-US', decimales: 2 },
  { codigo: 'EUR', nombre: 'Euro',                locale: 'es-ES', decimales: 2 },
  { codigo: 'GBP', nombre: 'Libra esterlina',     locale: 'en-GB', decimales: 2 },
  { codigo: 'CAD', nombre: 'Dólar canadiense',    locale: 'en-CA', decimales: 2 },
  { codigo: 'AUD', nombre: 'Dólar australiano',   locale: 'en-AU', decimales: 2 },
  { codigo: 'CHF', nombre: 'Franco suizo',        locale: 'de-CH', decimales: 2 },
  { codigo: 'JPY', nombre: 'Yen',                 locale: 'ja-JP', decimales: 0 },
  { codigo: 'CNY', nombre: 'Yuan',                locale: 'zh-CN', decimales: 2 }
];

const PATRON: Moneda = { codigo: 'CLP', nombre: 'Peso chileno', locale: 'es-CL', decimales: 0 };

export const monedaDe = (codigo?: string | null): Moneda =>
  MONEDAS.find(m => m.codigo === (codigo ?? '').toUpperCase())
  /* Una moneda que no está en el catálogo se escribe igual, con su código:
     mejor "1.234 NOK" que fingir que son pesos. */
  ?? (codigo ? { codigo: codigo.toUpperCase(), nombre: codigo.toUpperCase(), locale: 'es-CL', decimales: 2 } : PATRON);

/* La moneda de la empresa abierta.
   ---------------------------------------------------------------------------
   El motor de datos dibuja celdas sin saber de qué empresa son —esa es toda su
   gracia— así que la moneda no puede viajar por props hasta cada celda. Vive
   aquí, la fija `Espacio` al abrir el espacio de trabajo, y se lee en cada
   render. Al cambiarla en Configuración, el espacio se recarga y todo pasa a
   escribirse en la moneda nueva. */
let ACTIVA = 'CLP';
export function fijarMoneda(codigo?: string | null) { ACTIVA = (codigo || 'CLP').toUpperCase(); }
export function monedaActiva() { return ACTIVA; }

const cache = new Map<string, Intl.NumberFormat>();
function formateador(m: Moneda, decimales = m.decimales) {
  const clave = `${m.codigo}:${m.locale}:${decimales}`;
  let f = cache.get(clave);
  if (!f) {
    f = new Intl.NumberFormat(m.locale, {
      style: 'currency', currency: m.codigo,
      minimumFractionDigits: decimales, maximumFractionDigits: decimales
    });
    cache.set(clave, f);
  }
  return f;
}

/** Dinero completo, en la moneda de la empresa: $1.284.500 · US$1,284.50 */
export function dinero(v: unknown, moneda: string = ACTIVA) {
  const m = monedaDe(moneda);
  try { return formateador(m).format(n(v)); }
  /* Un código raro hace saltar a Intl; la cifra sigue teniendo que salir. */
  catch { return `${n(v).toLocaleString(m.locale, { maximumFractionDigits: m.decimales })} ${m.codigo}`; }
}

/** Dinero abreviado, para ejes y cabeceras donde no cabe entero.
    1.284.500 → $1,3 M · 84.500 → $85 mil */
export function dineroCorto(v: unknown, moneda: string = ACTIVA) {
  const m = monedaDe(moneda);
  const x = Math.round(n(v));
  const s = x < 0 ? '-' : '';
  const a = Math.abs(x);
  /* El símbolo sale del propio formateador —así "US$" es "US$" y "€" va donde
     su idioma lo pone— y se le quita el número, que aquí lo ponemos nosotros. */
  let simbolo = '';
  try { simbolo = formateador(m, 0).format(0).replace(/[\d.,\s ]/g, ''); } catch { simbolo = m.codigo; }
  const corta = (x: number, sufijo: string) =>
    `${s}${simbolo}${x.toLocaleString(m.locale, { maximumFractionDigits: 1 })}${sufijo}`;
  if (a >= 1_000_000_000) return corta(a / 1_000_000_000, ' MM');
  if (a >= 1_000_000)     return corta(a / 1_000_000, ' M');
  if (a >= 10_000)        return `${s}${simbolo}${Math.round(a / 1000).toLocaleString(m.locale)} mil`;
  return `${s}${simbolo}${a.toLocaleString(m.locale)}`;
}

/** Cantidades: 1.284 */
export const cantidad = (v: unknown, decimales = 0) =>
  n(v).toLocaleString(monedaDe(ACTIVA).locale, { maximumFractionDigits: decimales });

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
