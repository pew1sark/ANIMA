import type { ModuleSlug, ProductLine } from '@/types/core';

/* Las tres zonas del menú, en el orden en que se usan a lo largo del día:
   lo que se opera, lo que se administra, y lo que se toca de vez en cuando. */
export type Zona = 'operacion' | 'administracion' | 'sistema';

export const ZONAS: { id: Zona; nombre: string }[] = [
  { id: 'operacion',      nombre: 'Operación' },
  { id: 'administracion', nombre: 'Administración' },
  { id: 'sistema',        nombre: 'Sistema' }
];

/* Registro de módulos. Un módulo declara qué es y qué necesita;
   NO decide si está encendido: eso vive en company_modules. */
export interface ModuleDefinition {
  slug: ModuleSlug;
  name: string;
  /** Nivel mínimo de rol para entrar al módulo. */
  minLevel: number;
  /** Ruta base dentro de la app. */
  path: string;
  /** A qué sub-plataformas sirve. Es informativo —para agrupar el menú y saber
   *  de dónde viene cada cosa—, NO decide nada: la autoridad sobre qué ve una
   *  empresa está en `plan_modules` + `company_modules`. */
  lines: ProductLine[];
  /** En qué parte del menú vive. Un menú de once entradas planas obliga a
   *  leerlas todas cada vez; agrupadas se busca en el grupo y no en la lista.
   *  Es solo presentación: no decide ningún acceso. */
  zona: Zona;
  /** Qué cubre el módulo, en una frase. Se muestra mientras la pantalla no
   *  esté construida, para que se sepa qué falta y no solo que falta. */
  cubre?: string;
  /** Las tablas de la arquitectura que lo sostienen. Sirve para saber, de un
   *  vistazo, qué hay ya en la base y qué queda por escribir encima. */
  tablas?: string[];
}

/* ---------------------------------------------------------------------------
   El menú muestra únicamente lo contratado
   ---------------------------------------------------------------------------
   En `false` —como está— el menú lista solo los módulos que la empresa tiene
   encendidos Y su plan incluye. Es lo que corresponde frente a un cliente: si
   pagas Starter no ves once módulos con nueve marcados como ajenos.

   Estuvo en `true` durante la construcción de COMPANY, para poder ver y probar
   todo antes de organizar planes y accesos (01-09-2026, P0). Se deja como
   interruptor y no se borra porque sigue siendo útil en desarrollo: ponerlo en
   `true` enseña el catálogo completo con lo ajeno marcado.

   Esto cambia solo lo que se DIBUJA, en los dos sentidos. La autoridad sobre
   qué datos se devuelven es de RLS y del nivel de rol: un módulo visible sobre
   una tabla que no te corresponde no devuelve ni una fila, y uno oculto no
   protege nada por estar oculto. */
export const MOSTRAR_TODOS_LOS_MODULOS = false;

const AMBAS: ProductLine[] = ['studio', 'company'];
const SOLO_COMPANY: ProductLine[] = ['company'];

/* Los módulos de COMPANY están calcados de la arquitectura que trajo Bilagay:
   las tablas ya existen y están aisladas por empresa. Lo que falta es la
   pantalla encima. `cubre` y `tablas` dejan escrito qué es cada una, para que
   construirlas sea seguir una lista y no volver a decidirlo cada vez. */
export const MODULES: Record<ModuleSlug, ModuleDefinition> = {
  core: {
    slug: 'core', name: 'Core', minLevel: 20, path: '/ajustes', lines: AMBAS, zona: 'sistema',
    cubre: 'Empresa, usuarios, roles, numeración de documentos y auditoría.',
    tablas: ['company_config', 'company_members', 'roles', 'counters', 'audit_logs']
  },
  crm: {
    slug: 'crm', name: 'Clientes', minLevel: 40, path: '/clientes', lines: AMBAS, zona: 'operacion',
    cubre: 'Ficha de cliente, direcciones de despacho, listas de precio y precios especiales.',
    tablas: ['customers', 'customer_addresses', 'customer_special_prices', 'price_lists', 'price_list_items']
  },
  commerce: {
    slug: 'commerce', name: 'Ventas', minLevel: 40, path: '/pedidos', lines: AMBAS, zona: 'operacion',
    cubre: 'Catálogo, pedidos y su historial de estados.',
    tablas: ['products', 'product_categories', 'orders', 'order_items', 'order_status_history', 'product_price_history']
  },
  creator: {
    slug: 'creator', name: 'Taller', minLevel: 40, path: '/taller', lines: AMBAS, zona: 'operacion',
    cubre: 'Proyectos, cotizaciones y portafolio. El corazón de STUDIO.',
    tablas: ['projects', 'quotes', 'clients', 'tasks']
  },
  finance: {
    slug: 'finance', name: 'Finanzas', minLevel: 60, path: '/finanzas', lines: AMBAS, zona: 'administracion',
    cubre: 'Cobranza, pagos, saldos de apertura y movimientos.',
    tablas: ['payments', 'opening_receivables', 'opening_payables', 'finance_entries']
  },
  agenda: {
    slug: 'agenda', name: 'Agenda', minLevel: 40, path: '/agenda', lines: AMBAS, zona: 'operacion',
    cubre: 'Compromisos y recordatorios.',
    tablas: ['agenda', 'reminders']
  },
  support: {
    slug: 'support', name: 'Soporte', minLevel: 20, path: '/soporte', lines: AMBAS, zona: 'sistema',
    cubre: 'Canal con quien mantiene el software y avisos de versión.',
    tablas: ['feedback', 'notifications', 'changelog']
  },

  // Operación física y escala: por ahora solo aparecen en planes de COMPANY.
  operations: {
    slug: 'operations', name: 'Operaciones', minLevel: 40, path: '/inventario', lines: SOLO_COMPANY, zona: 'administracion',
    cubre: 'Inventario por lotes, mermas, bodegas, compras y proveedores.',
    tablas: ['inventory_lots', 'inventory_movements', 'stock_reservations', 'losses',
             'locations', 'purchases', 'purchase_items', 'suppliers', 'supplier_products']
  },
  delivery: {
    slug: 'delivery', name: 'Reparto', minLevel: 40, path: '/repartos', lines: SOLO_COMPANY, zona: 'operacion',
    cubre: 'Rutas, entregas y seguimiento en terreno.',
    tablas: ['deliveries', 'routes']
  },
  food: {
    slug: 'food', name: 'Procesos', minLevel: 40, path: '/cocina', lines: SOLO_COMPANY, zona: 'operacion',
    cubre: 'Órdenes de proceso, rendimientos y productos elaborados.',
    tablas: ['processing_orders', 'processing_outputs', 'processing_yields', 'fish_species']
  },
  ai: {
    slug: 'ai', name: 'IA', minLevel: 60, path: '/ia', lines: SOLO_COMPANY, zona: 'sistema',
    cubre: 'Asistencia sobre los datos de la empresa.',
    tablas: []
  },

  /* Capital Intelligence. Es el único módulo cuyo `minLevel` es 60 y no 40, y
     no es un detalle: aquí viven valoraciones, rondas y modelos financieros.
     Debajo de ese nivel se entra por invitación a UN proyecto —lo decide
     `ci_project_members`, no el menú— y esa es toda la diferencia entre un
     socio de la firma y un inversionista al que se le abrió una carpeta. */
  capital: {
    slug: 'capital', name: 'Capital Intelligence', minLevel: 60, path: '/capital',
    lines: SOLO_COMPANY, zona: 'administracion',
    cubre: 'Portafolios, proyectos, modelos financieros por escenario, presupuesto contra real y levantamiento de capital.',
    tablas: ['ci_portfolios', 'ci_projects', 'ci_business_units', 'ci_project_members',
             'ci_scenarios', 'ci_models', 'ci_model_lines', 'ci_model_periods',
             'ci_actuals', 'ci_milestones', 'ci_exchange_rates', 'ci_thresholds']
  }
};

/** Los módulos que puede llegar a ver una línea. Para armar menús y catálogos,
 *  nunca para decidir acceso. */
export const modulesForLine = (line: ProductLine): ModuleDefinition[] =>
  Object.values(MODULES).filter(m => m.lines.includes(line));
