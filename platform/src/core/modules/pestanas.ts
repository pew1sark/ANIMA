import { ESQUEMAS_POR_MODULO } from '@/core/datos/esquemas';
import type { Esquema } from '@/core/datos/tipos';
import type { ModuleSlug } from '@/types/core';

/* Las sub-pestañas de un módulo.
   ---------------------------------------------------------------------------
   Antes, entrar a Operaciones era caer de golpe en la tabla de lotes: seis
   entidades una detrás de otra, sin nada que dijera cómo va el inventario. La
   pestaña es la unidad de navegación dentro de un módulo, y la primera casi
   siempre debería ser la respuesta, no la lista.

   Se declara, no se programa. Una pestaña es de uno de tres tipos:

     resumen   — cifras, series y listas que arma `resumen_modulo()` en la base
     datos     — una entidad dibujada por el motor (`Vista`)
     novedades — el registro de versiones de la plataforma, que es común a
                 todas las empresas y por eso no pasa por el motor

   Un módulo sin declaración cae en el comportamiento de siempre: una pestaña
   por entidad. Así, agregar una entidad nueva sigue sin obligar a tocar esto. */

export type Pestana =
  | { id: string; nombre: string; tipo: 'resumen' }
  | { id: string; nombre: string; tipo: 'datos'; esquema: Esquema }
  | { id: string; nombre: string; tipo: 'novedades' };

/** Los módulos cuyo resumen sabe calcular `resumen_modulo()`. */
export const CON_RESUMEN = new Set<string>([
  'crm', 'commerce', 'operations', 'delivery', 'finance', 'food', 'agenda', 'creator'
]);

/* Nombres cortos para la pestaña. El título del esquema es el de la pantalla
   —"Por cobrar (apertura)"— y en una fila de pestañas no cabe. */
const CORTO: Record<string, string> = {
  opening_receivables: 'Por cobrar',
  opening_payables: 'Por pagar',
  customer_addresses: 'Direcciones',
  price_lists: 'Listas de precio',
  product_categories: 'Categorías',
  inventory_movements: 'Movimientos',
  processing_orders: 'Procesos'
};

export function pestanasDe(slug: ModuleSlug): Pestana[] {
  const esquemas = ESQUEMAS_POR_MODULO[slug] ?? [];
  const salida: Pestana[] = [];

  if (CON_RESUMEN.has(slug)) {
    salida.push({ id: 'resumen', nombre: 'Resumen', tipo: 'resumen' });
  }

  for (const e of esquemas) {
    salida.push({ id: e.tabla, nombre: CORTO[e.tabla] ?? e.titulo, tipo: 'datos', esquema: e });
  }

  /* Soporte lleva además las novedades de la plataforma. No es una entidad de
     la empresa —es el mismo texto para todas—, así que no pasa por el motor. */
  if (slug === 'support') {
    salida.push({ id: 'novedades', nombre: 'Novedades', tipo: 'novedades' });
  }

  return salida;
}
