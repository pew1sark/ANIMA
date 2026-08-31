import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isPlatformAdmin: boolean;
  /** Tiene un Alma en ANIMA STUDIO. Decide si se le ofrece esa puerta. */
  tieneAlma: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [tieneAlma, setTieneAlma] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  /* La condición de Super Admin la resuelve la base, no el frontend.
     Aquí solo se usa para decidir qué mostrar. */
  useEffect(() => {
    if (!session) { setIsPlatformAdmin(false); return; }
    supabase.rpc('is_platform_admin').then(({ data }) => setIsPlatformAdmin(data === true));
  }, [session]);

  /* El Alma es lo que abre la puerta de STUDIO. Un Alma de la Alpha no tiene
     organización ninguna, y aun así ahí es donde vive. */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { setTieneAlma(false); return; }
    supabase.from('almas').select('id').eq('user_id', uid).limit(1)
      .then(({ data }) => setTieneAlma((data?.length ?? 0) > 0));
  }, [session?.user?.id]);

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    isPlatformAdmin,
    tieneAlma,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() { await supabase.auth.signOut(); }
  }), [session, loading, isPlatformAdmin, tieneAlma]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return v;
}
