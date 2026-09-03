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
  /** Vuelve a leer las organizaciones. Se usa al cambiar la marca. */
  recargar: () => void;
  /** Sube uno con cada recarga. Quien tenga datos derivados del espacio
   *  —la moneda, los módulos encendidos— los vuelve a pedir mirando esto. */
  version: number;
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
  const [tic, setTic] = useState(0);

  /* Todo lo de la sesión se pide junto y en orden.

     Primero se cobran las invitaciones pendientes de este correo: invitar a
     alguien basta, entra y ya está dentro. Y tiene que ser ANTES de lo demás
     —no en paralelo—, porque `mis_lineas()` y las membresías dependen de que
     esa membresía ya exista. Cuando corrían a la vez, quien acababa de ser
     invitado veía "todavía no tienes acceso" pese a estar dentro.

     La consulta de membresías filtra por usuario a propósito: RLS deja ver a
     TODOS los miembros de tus empresas —hace falta para el equipo—, así que
     sin ese filtro la lista traería también las de otros, la organización
     saldría repetida y `current.role` podría ser el rol de otra persona. */
  useEffect(() => {
    if (!user) { setMemberships([]); setLineas(new Set()); setLoading(false); return; }
    const uid = user.id;
    let vivo = true;

    /* `loading` solo en la primera carga. Al recargar —por ejemplo tras
       cambiar el logo— levantarlo desmontaría el espacio entero y devolvería
       a la persona a Inicio, perdiendo la pantalla donde estaba. */
    if (tic === 0) setLoading(true);

    (async () => {
      try { await supabase.rpc('aceptar_invitaciones'); } catch { /* no bloquea la entrada */ }
      if (!vivo) return;

      const [{ data: filas }, { data: lin }] = await Promise.all([
        supabase
          .from('company_members')
          .select('status, company:companies(*, linea:product_lines(slug,name)), role:roles(*)')
          .eq('user_id', uid)
          .eq('status', 'active'),
        supabase.rpc('mis_lineas')
      ]);
      if (!vivo) return;

      const list = (filas ?? []) as unknown as Membership[];
      setMemberships(list);
      setLineas(new Set((lin ?? []) as ProductLine[]));
      /* No se elige nada aquí. Con dos sub-plataformas, entrar directo a la
         única organización se saltaría la puerta. Solo se conserva la que ya
         estaba abierta, si sigue siendo válida. */
      setCurrentId(prev => (prev && list.some(m => m.company.id === prev)) ? prev : null);
      setLoading(false);
    })();

    return () => { vivo = false; };
  }, [user, tic]);

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
    memberships, current, modules, lineas, loading, version: tic,
    select: (id: string) => setCurrentId(id || null),
    recargar: () => setTic(n => n + 1),
    hasModule: (m) => modules.has(m),
    hasLevel: (min) => (current?.role.level ?? 0) >= min
  }), [memberships, current, modules, lineas, loading, tic]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTenant debe usarse dentro de <TenantProvider>');
  return v;
}
