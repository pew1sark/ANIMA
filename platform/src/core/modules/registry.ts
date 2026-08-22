import type { ModuleSlug } from '@/types/core';

/* Registro de módulos. Un módulo declara qué es y qué necesita;
   NO decide si está encendido: eso vive en company_modules. */
export interface ModuleDefinition {
  slug: ModuleSlug;
  name: string;
  /** Nivel mínimo de rol para entrar al módulo. */
  minLevel: number;
  /** Ruta base dentro de la app. */
  path: string;
}

export const MODULES: Record<ModuleSlug, ModuleDefinition> = {
  core:       { slug: 'core',       name: 'Core',        minLevel: 20, path: '/ajustes' },
  crm:        { slug: 'crm',        name: 'CRM',         minLevel: 40, path: '/clientes' },
  commerce:   { slug: 'commerce',   name: 'Commerce',    minLevel: 40, path: '/pedidos' },
  operations: { slug: 'operations', name: 'Operaciones', minLevel: 40, path: '/inventario' },
  delivery:   { slug: 'delivery',   name: 'Delivery',    minLevel: 40, path: '/repartos' },
  food:       { slug: 'food',       name: 'Food',        minLevel: 40, path: '/cocina' },
  creator:    { slug: 'creator',    name: 'Creator',     minLevel: 40, path: '/taller' },
  finance:    { slug: 'finance',    name: 'Finanzas',    minLevel: 60, path: '/finanzas' },
  agenda:     { slug: 'agenda',     name: 'Agenda',      minLevel: 40, path: '/agenda' },
  support:    { slug: 'support',    name: 'Soporte',     minLevel: 20, path: '/soporte' },
  ai:         { slug: 'ai',         name: 'IA',          minLevel: 60, path: '/ia' }
};
