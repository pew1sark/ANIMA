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
}

const AMBAS: ProductLine[] = ['studio', 'company'];
const SOLO_COMPANY: ProductLine[] = ['company'];

export const MODULES: Record<ModuleSlug, ModuleDefinition> = {
  core:       { slug: 'core',       name: 'Core',        minLevel: 20, path: '/ajustes',    lines: AMBAS },
  crm:        { slug: 'crm',        name: 'CRM',         minLevel: 40, path: '/clientes',   lines: AMBAS },
  commerce:   { slug: 'commerce',   name: 'Commerce',    minLevel: 40, path: '/pedidos',    lines: AMBAS },
  creator:    { slug: 'creator',    name: 'Creator',     minLevel: 40, path: '/taller',     lines: AMBAS },
  finance:    { slug: 'finance',    name: 'Finanzas',    minLevel: 60, path: '/finanzas',   lines: AMBAS },
  agenda:     { slug: 'agenda',     name: 'Agenda',      minLevel: 40, path: '/agenda',     lines: AMBAS },
  support:    { slug: 'support',    name: 'Soporte',     minLevel: 20, path: '/soporte',    lines: AMBAS },

  // Operación física y escala: por ahora solo aparecen en planes de COMPANY.
  operations: { slug: 'operations', name: 'Operaciones', minLevel: 40, path: '/inventario', lines: SOLO_COMPANY },
  delivery:   { slug: 'delivery',   name: 'Delivery',    minLevel: 40, path: '/repartos',   lines: SOLO_COMPANY },
  food:       { slug: 'food',       name: 'Food',        minLevel: 40, path: '/cocina',     lines: SOLO_COMPANY },
  ai:         { slug: 'ai',         name: 'IA',          minLevel: 60, path: '/ia',         lines: SOLO_COMPANY }
};

/** Los módulos que puede llegar a ver una línea. Para armar menús y catálogos,
 *  nunca para decidir acceso. */
export const modulesForLine = (line: ProductLine): ModuleDefinition[] =>
  Object.values(MODULES).filter(m => m.lines.includes(line));
