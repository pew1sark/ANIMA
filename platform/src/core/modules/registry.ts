import type { ModuleSlug, ProductLine } from '@/types/core';

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
  /** Qué cubre el módulo, en una frase. Se muestra mientras la pantalla no
   *  esté construida, para que se sepa qué falta y no solo que falta. */
  cubre?: string;
  /** Las tablas de la arquitectura que lo sostienen. Sirve para saber, de un
   *  vistazo, qué hay ya en la base y qué queda por escribir encima. */
  tablas?: string[];
}

const AMBAS: ProductLine[] = ['studio', 'company'];
const SOLO_COMPANY: ProductLine[] = ['company'];

/* Los módulos de COMPANY están calcados de la arquitectura que trajo Bilagay:
   las tablas ya existen y están aisladas por empresa. Lo que falta es la
   pantalla encima. `cubre` y `tablas` dejan escrito qué es cada una, para que
   construirlas sea seguir una lista y no volver a decidirlo cada vez. */
export const MODULES: Record<ModuleSlug, ModuleDefinition> = {
  core: {
    slug: 'core', name: 'Core', minLevel: 20, path: '/ajustes', lines: AMBAS,
    cubre: 'Empresa, usuarios, roles, numeración de documentos y auditoría.',
    tablas: ['company_config', 'company_members', 'roles', 'counters', 'audit_logs']
  },
  crm: {
    slug: 'crm', name: 'Clientes', minLevel: 40, path: '/clientes', lines: AMBAS,
    cubre: 'Ficha de cliente, direcciones de despacho, listas de precio y precios especiales.',
    tablas: ['customers', 'customer_addresses', 'customer_special_prices', 'price_lists', 'price_list_items']
  },
  commerce: {
    slug: 'commerce', name: 'Ventas', minLevel: 40, path: '/pedidos', lines: AMBAS,
    cubre: 'Catálogo, pedidos y su historial de estados.',
    tablas: ['products', 'product_categories', 'orders', 'order_items', 'order_status_history', 'product_price_history']
  },
  creator: {
    slug: 'creator', name: 'Taller', minLevel: 40, path: '/taller', lines: AMBAS,
    cubre: 'Proyectos, cotizaciones y portafolio. El corazón de STUDIO.',
    tablas: ['projects', 'quotes', 'clients', 'tasks']
  },
  finance: {
    slug: 'finance', name: 'Finanzas', minLevel: 60, path: '/finanzas', lines: AMBAS,
    cubre: 'Cobranza, pagos, saldos de apertura y movimientos.',
    tablas: ['payments', 'opening_receivables', 'opening_payables', 'finance_entries']
  },
  agenda: {
    slug: 'agenda', name: 'Agenda', minLevel: 40, path: '/agenda', lines: AMBAS,
    cubre: 'Compromisos y recordatorios.',
    tablas: ['agenda', 'reminders']
  },
  support: {
    slug: 'support', name: 'Soporte', minLevel: 20, path: '/soporte', lines: AMBAS,
    cubre: 'Canal con quien mantiene el software y avisos de versión.',
    tablas: ['feedback', 'notifications', 'changelog']
  },

  // Operación física y escala: por ahora solo aparecen en planes de COMPANY.
  operations: {
    slug: 'operations', name: 'Operaciones', minLevel: 40, path: '/inventario', lines: SOLO_COMPANY,
    cubre: 'Inventario por lotes, mermas, bodegas, compras y proveedores.',
    tablas: ['inventory_lots', 'inventory_movements', 'stock_reservations', 'losses',
             'locations', 'purchases', 'purchase_items', 'suppliers', 'supplier_products']
  },
  delivery: {
    slug: 'delivery', name: 'Reparto', minLevel: 40, path: '/repartos', lines: SOLO_COMPANY,
    cubre: 'Rutas, entregas y seguimiento en terreno.',
    tablas: ['deliveries', 'routes']
  },
  food: {
    slug: 'food', name: 'Procesos', minLevel: 40, path: '/cocina', lines: SOLO_COMPANY,
    cubre: 'Órdenes de proceso, rendimientos y productos elaborados.',
    tablas: ['processing_orders', 'processing_outputs', 'processing_yields', 'fish_species']
  },
  ai: {
    slug: 'ai', name: 'IA', minLevel: 60, path: '/ia', lines: SOLO_COMPANY,
    cubre: 'Asistencia sobre los datos de la empresa.',
    tablas: []
  }
};

/** Los módulos que puede llegar a ver una línea. Para armar menús y catálogos,
 *  nunca para decidir acceso. */
export const modulesForLine = (line: ProductLine): ModuleDefinition[] =>
  Object.values(MODULES).filter(m => m.lines.includes(line));
