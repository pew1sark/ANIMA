import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/auth/AuthContext';
import type { Membership, ModuleSlug, ProductLine } from '@/types/core';

const STORAGE_KEY = 'anima.company';

interface TenantValue {
  memberships: Membership[];
  /** Sub-plataformas a las que puede entrar. Lo decide el plan, en la base. */
  lineas: Set<ProductLine>;
  current: Membership | null;
  modules: Set<ModuleSlug>;
  loading: boolean;
  select: (companyId: string) => void;
  hasModule: (m: ModuleSlug) => boolean;
  hasLevel: (min: number) => boolean;
}

const Ctx = createContext<TenantValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [modules, setModules] = useState<Set<ModuleSlug>>(new Set());
  const [lineas, setLineas] = useState<Set<ProductLine>>(new Set());
  const [loading, setLoading] = useState(true);

  /* Filtra por usuario a propósito. RLS deja ver a TODOS los miembros de tus
     empresas —hace falta para el equipo—, así que sin este filtro la lista
     traería también las membresías de otros: la organización aparecería
     repetida y `current.role` podría ser el rol de otra persona. */
  useEffect(() => {
    if (!user) { setMemberships([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('company_members')
      .select('status, company:companies(*, linea:product_lines(slug,name)), role:roles(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const list = (data ?? []) as unknown as Membership[];
        setMemberships(list);
        // Con una sola organización se entra directo. Con varias, se elige.
        /* No se elige nada aquí. Con dos sub-plataformas, entrar directo a la
           única organización se saltaría la puerta. Solo se conserva la que ya
           estaba abierta, si sigue siendo válida. */
        setCurrentId(prev => (prev && list.some(m => m.company.id === prev)) ? prev : null);
        setLoading(false);
      });
  }, [user]);

  /* Qué puertas se abren no lo decide el frontend: lo devuelve `mis_lineas()`,
     que lo deduce del plan contratado (más el Alma, que es la entrada gratuita
     a STUDIO). Aquí solo se dibuja lo que la base ya resolvió. */
  useEffect(() => {
    if (!user) { setLineas(new Set()); return; }
    supabase.rpc('mis_lineas').then(({ data }) =>
      setLineas(new Set((data ?? []) as ProductLine[])));
  }, [user]);

  useEffect(() => {
    if (!currentId) { setModules(new Set()); localStorage.removeItem(STORAGE_KEY); return; }
    localStorage.setItem(STORAGE_KEY, currentId);
    supabase
      .from('company_modules')
      .select('enabled, module:modules(slug)')
      .eq('company_id', currentId)
      .eq('enabled', true)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { module: { slug: ModuleSlug } }[];
        setModules(new Set(rows.map(r => r.module.slug)));
      });
  }, [currentId]);

  const current = memberships.find(m => m.company.id === currentId) ?? null;

  const value = useMemo<TenantValue>(() => ({
    memberships, current, modules, lineas, loading,
    select: (id: string) => setCurrentId(id || null),
    hasModule: (m) => modules.has(m),
    hasLevel: (min) => (current?.role.level ?? 0) >= min
  }), [memberships, current, modules, lineas, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTenant debe usarse dentro de <TenantProvider>');
  return v;
}
