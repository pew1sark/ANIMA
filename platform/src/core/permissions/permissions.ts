import { ROLE_LEVEL, type RoleSlug } from '@/types/core';

/* Ayuda de UI. La autoridad real está en las políticas RLS:
   esto solo evita mostrar botones que la base va a rechazar. */
export const levelOf = (slug: RoleSlug): number => ROLE_LEVEL[slug];
export const canManageCompany = (level: number) => level >= ROLE_LEVEL.admin;
export const canManageMembers = (level: number) => level >= ROLE_LEVEL.admin;
export const canSeeMoney      = (level: number) => level >= ROLE_LEVEL.manager;
export const canSeeAudit      = (level: number) => level >= ROLE_LEVEL.manager;
