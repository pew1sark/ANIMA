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
     analisis  — el análisis financiero, que es un addon: aparece solo si la
                 empresa lo tiene encendido en `company_features`
     capital   — las tres pantallas de Capital Intelligence que el motor no
                 sabe dibujar: un panel con filtros, una MATRIZ de meses y una
                 comparación presupuesto/real. El motor dibuja filas con ficha;
                 estas tres son otra cosa, y forzarlas al motor habría sido
                 deformar el motor para que cupieran

   Un módulo sin declaración cae en el comportamiento de siempre: una pestaña
   por entidad. Así, agregar una entidad nueva sigue sin obligar a tocar esto. */

export type Pestana =
  | { id: string; nombre: string; tipo: 'resumen' }
  | { id: string; nombre: string; tipo: 'datos'; esquema: Esquema }
  | { id: string; nombre: string; tipo: 'novedades' }
  | { id: string; nombre: string; tipo: 'analisis' }
  | { id: string; nombre: string; tipo: 'capital';
      vista: 'levantamiento' | 'panel' | 'modelo' | 'presupuesto' };

/** Los módulos cuyo resumen sabe calcular `resumen_modulo()`. */
export const CON_RESUMEN = new Set<string>([
  'crm', 'commerce', 'operations', 'delivery', 'finance', 'food', 'agenda', 'creator'
]);

/* Nombres cortos para la pestaña. El título del esquema es el de la pantalla
   —"Por cobrar (apertura)"— y en una fila de pestañas no cabe. */
const CORTO: Record<string, string> = {
  ci_business_units: 'Unidades',
  ci_requirements: 'Requisitos',
  ci_exchange_rates: 'Tipos de cambio',
  ci_actuals: 'Ejecución',
  opening_receivables: 'Por cobrar',
  opening_payables: 'Por pagar',
  customer_addresses: 'Direcciones',
  price_lists: 'Listas de precio',
  product_categories: 'Categorías',
  inventory_movements: 'Movimientos',
  processing_orders: 'Procesos'
};

export function pestanasDe(slug: ModuleSlug, addons: string[] = []): Pestana[] {
  const esquemas = ESQUEMAS_POR_MODULO[slug] ?? [];
  const salida: Pestana[] = [];

  /* Capital Intelligence abre por el panel y no por una tabla. El orden es el
     de una conversación: cómo va la cartera, de dónde salen esos números, y
     al final dónde se cargan. Las entidades siguen siendo del motor. */
  if (slug === 'capital') {
    salida.push(
      /* El levantamiento va PRIMERO mientras la organización se está poniendo
         en marcha: es lo que hay que hacer antes de que el resto sirva de algo.
         Cuando está completo se vuelve una pestaña de consulta y el Panel pasa
         a ser lo que se abre todos los días. */
      { id: 'levantamiento', nombre: 'Levantamiento',     tipo: 'capital', vista: 'levantamiento' },
      { id: 'panel',       nombre: 'Panel',               tipo: 'capital', vista: 'panel' },
      { id: 'modelo',      nombre: 'Modelo financiero',   tipo: 'capital', vista: 'modelo' },
      { id: 'presupuesto', nombre: 'Presupuesto vs real', tipo: 'capital', vista: 'presupuesto' });
    for (const e of esquemas) {
      salida.push({ id: e.tabla, nombre: CORTO[e.tabla] ?? e.titulo, tipo: 'datos', esquema: e });
    }
    return salida;
  }

  if (CON_RESUMEN.has(slug)) {
    salida.push({ id: 'resumen', nombre: 'Resumen', tipo: 'resumen' });
  }

  /* El análisis va inmediatamente después del resumen y antes de las
     entidades: primero la respuesta, después el detalle, al final la carga. */
  if (slug === 'finance' && addons.includes('analisis_financiero')) {
    salida.push({ id: 'analisis', nombre: 'Análisis', tipo: 'analisis' });
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
