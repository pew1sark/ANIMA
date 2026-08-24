import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/auth/AuthContext';
import type { Membership, ModuleSlug } from '@/types/core';

const STORAGE_KEY = 'anima.company';

interface TenantValue {
  memberships: Membership[];
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
  const [loading, setLoading] = useState(true);

  /* Las empresas visibles las decide RLS: esta consulta no filtra por
     usuario, no hace falta — la base solo devuelve lo que corresponde. */
  useEffect(() => {
    if (!user) { setMemberships([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('company_members')
      .select('status, company:companies(*), role:roles(*)')
      .eq('status', 'active')
      .then(({ data }) => {
        const list = (data ?? []) as unknown as Membership[];
        setMemberships(list);
        // Con una sola organización se entra directo. Con varias, se elige.
        setCurrentId(prev => (prev && list.some(m => m.company.id === prev))
          ? prev
          : (list.length === 1 ? list[0]!.company.id : null));
        setLoading(false);
      });
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
    memberships, current, modules, loading,
    select: (id: string) => setCurrentId(id || null),
    hasModule: (m) => modules.has(m),
    hasLevel: (min) => (current?.role.level ?? 0) >= min
  }), [memberships, current, modules, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTenant debe usarse dentro de <TenantProvider>');
  return v;
}
