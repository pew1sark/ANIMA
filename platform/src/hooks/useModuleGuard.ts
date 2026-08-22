import { useTenant } from '@/core/tenant/TenantContext';
import { MODULES } from '@/core/modules/registry';
import type { ModuleSlug } from '@/types/core';

/* Un módulo se muestra si la empresa lo tiene encendido Y el rol alcanza.
   Si alguien salta esta comprobación, RLS lo detiene igual. */
export function useModuleGuard(slug: ModuleSlug) {
  const { hasModule, hasLevel, loading } = useTenant();
  const def = MODULES[slug];
  return { loading, allowed: !loading && hasModule(slug) && hasLevel(def.minLevel), definition: def };
}
