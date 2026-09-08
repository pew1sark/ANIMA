import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { vieneDeInvitacion } from '@/services/acceso.service';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isPlatformAdmin: boolean;
  /** Volvió del correo de recuperación: hay sesión, pero para cambiar la clave. */
  recuperando: boolean;
  terminarRecuperacion: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  /* Arranca en true si se viene del correo de invitación. Ese enlace abre una
     sesión válida, así que sin esto la aplicación lo trataría como un ingreso
     normal y la persona entraría SIN HABER PUESTO CONTRASEÑA: la próxima vez
     no podría volver. Se lee de la query, que sobrevive a supabase-js. */
  const [recuperando, setRecuperando] = useState(vieneDeInvitacion);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    /* El enlace del correo abre una sesión de verdad, pero solo sirve para una
       cosa: poner una contraseña nueva. Si no se atiende este evento, la app
       lo trataría como un ingreso normal y la persona nunca la cambiaría. */
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* La condición de Super Admin la resuelve la base, no el frontend.
     Aquí solo se usa para decidir qué mostrar. */
  useEffect(() => {
    if (!session) { setIsPlatformAdmin(false); return; }
    supabase.rpc('is_platform_admin').then(({ data }) => setIsPlatformAdmin(data === true));
  }, [session]);

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    isPlatformAdmin,
    recuperando,
    terminarRecuperacion: () => setRecuperando(false),
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() { await supabase.auth.signOut(); }
  }), [session, loading, isPlatformAdmin, recuperando]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return v;
}
