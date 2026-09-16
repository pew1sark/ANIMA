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
     capital   — las pantallas de Capital Intelligence que el motor no sabe
                 dibujar: un panel con filtros, una MATRIZ de meses y una
                 comparación presupuesto/real. El motor dibuja filas con ficha;
                 estas son otra cosa, y forzarlas al motor habría sido
                 deformar el motor para que cupieran
     inmobiliaria — lo mismo en Real Estate Intelligence: el panel, la matriz
                 de calificación (oportunidades × criterios), la hoja de
                 prefactibilidad con su flujo de caja, el panel comercial, la
                 minuta semanal, el cuadro por municipio, la calidad de dato
                 y la ficha 360 de un cliente. El motor dibuja filas con
                 ficha; estas son cuadros, matrices y minutas, y forzarlas al
                 motor habría sido deformarlo para que cupieran

   Un módulo sin declaración cae en el comportamiento de siempre: una pestaña
   por entidad. Así, agregar una entidad nueva sigue sin obligar a tocar esto. */

export type Pestana =
  | { id: string; nombre: string; tipo: 'resumen' }
  | { id: string; nombre: string; tipo: 'datos'; esquema: Esquema }
  | { id: string; nombre: string; tipo: 'novedades' }
  | { id: string; nombre: string; tipo: 'analisis' }
  | { id: string; nombre: string; tipo: 'capital';
      vista: 'levantamiento' | 'panel' | 'modelo' | 'presupuesto' | 'ronda' }
  | { id: string; nombre: string; tipo: 'inmobiliaria';
      vista: 'comercial' | 'panel' | 'calificacion' | 'prefactibilidad'
           | 'semanal' | 'ciudades' | 'calidad' | 'cliente360' };

/** Los módulos cuyo resumen sabe calcular `resumen_modulo()`. */
export const CON_RESUMEN = new Set<string>([
  'crm', 'commerce', 'operations', 'delivery', 'finance', 'food', 'agenda', 'creator'
]);

/* Nombres cortos para la pestaña. El título del esquema es el de la pantalla
   —"Por cobrar (apertura)"— y en una fila de pestañas no cabe. */
const CORTO: Record<string, string> = {
  rei_leads:            'Leads',
  rei_deals:            'Negociaciones',
  rei_visits:           'Visitas',
  rei_activities:       'Bitácora',
  rei_contracts:        'Contratos',
  rei_targets:          'Metas',
  rei_developments:     'Desarrollos',
  rei_opportunities:    'Oportunidades',
  rei_properties:       'Inventario',
  rei_buyers:           'Demanda',
  rei_milestones:       'Hitos',
  rei_vehicles:         'Vehículos',
  rei_rental_advances:  'Adelanto de renta',
  rei_criteria:         'Criterios',
  rei_stages:           'Etapas',
  rei_parameters:       'Supuestos',
  ci_business_units: 'Unidades',
  ci_requirements: 'Requisitos',
  ci_capital_rounds: 'Rondas',
  ci_use_of_funds: 'Uso de fondos',
  ci_investors: 'Inversionistas',
  ci_investor_commitments: 'Pipeline',
  ci_investor_interactions: 'Bitácora',
  ci_shareholders: 'Cap table',
  ci_risks: 'Riesgos',
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

export function pestanasDe(
  slug: ModuleSlug,
  addons: string[] = [],
  /** Los módulos que la organización tiene disponibles. Una pestaña puede
   *  depender de OTRO módulo —la ficha 360 vive en Clientes y la alimenta el
   *  inmobiliario— y eso no es un addon: es una relación entre módulos. */
  modulos: string[] = []
): Pestana[] {
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
      { id: 'presupuesto', nombre: 'Presupuesto vs real', tipo: 'capital', vista: 'presupuesto' },
      { id: 'ronda',       nombre: 'Ronda de capital',    tipo: 'capital', vista: 'ronda' });
    for (const e of esquemas) {
      salida.push({ id: e.tabla, nombre: CORTO[e.tabla] ?? e.titulo, tipo: 'datos', esquema: e });
    }
    return salida;
  }

  /* Real Estate Intelligence abre por el panel, igual que su hermano, y por
     el mismo motivo: la pregunta del día es cómo va la comercialización, no
     qué hay en la tabla de inmuebles. Después vienen las dos pantallas de
     decisión —calificar y dictaminar— y recién entonces las entidades, que es
     donde se carga.

     El panel comercial se agrega DESPUÉS de esas tres y no antes, y el Panel
     conserva su nombre. Se probó al revés —Comercial primero, el otro
     renombrado a «Mercado»— y estaba mal: cambia de sitio y de nombre una
     pantalla que la gente ya usa todos los días, y mueve la portada del
     módulo por una decisión que no le toca tomar a quien agrega una
     pestaña. Lo nuevo se suma al final; lo que ya funciona no se desplaza. */
  if (slug === 'realestate') {
    salida.push(
      { id: 'panel',           nombre: 'Panel',           tipo: 'inmobiliaria', vista: 'panel' },
      { id: 'calificacion',    nombre: 'Calificación',    tipo: 'inmobiliaria', vista: 'calificacion' },
      { id: 'prefactibilidad', nombre: 'Prefactibilidad', tipo: 'inmobiliaria', vista: 'prefactibilidad' },
      { id: 'comercial',       nombre: 'Comercial',       tipo: 'inmobiliaria', vista: 'comercial' },
      { id: 'semanal',         nombre: 'Minuta semanal',  tipo: 'inmobiliaria', vista: 'semanal' },
      { id: 'ciudades',        nombre: 'Por municipio',   tipo: 'inmobiliaria', vista: 'ciudades' },
      { id: 'calidad',         nombre: 'Calidad de dato', tipo: 'inmobiliaria', vista: 'calidad' });
    for (const e of esquemas) {
      salida.push({ id: e.tabla, nombre: CORTO[e.tabla] ?? e.titulo, tipo: 'datos', esquema: e });
    }
    return salida;
  }

  if (CON_RESUMEN.has(slug)) {
    salida.push({ id: 'resumen', nombre: 'Resumen', tipo: 'resumen' });
  }

  /* La ficha 360 vive en Clientes y no en el módulo inmobiliario, aunque la
     alimente él: quien busca a una persona la busca en Clientes. Va detrás del
     resumen y delante de las entidades, que es el orden de siempre —primero la
     respuesta, después el detalle, al final la carga—.

     Solo aparece donde hay operación inmobiliaria que reunir. En una empresa
     que solo vende mercadería, la ficha no tendría inmuebles, ni visitas, ni
     contratos: sería la misma ficha de cliente con más pasos. */
  if (slug === 'crm' && modulos.includes('realestate')) {
    salida.push({ id: 'cliente360', nombre: 'Ficha 360', tipo: 'inmobiliaria', vista: 'cliente360' });
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
