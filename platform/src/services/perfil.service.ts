import { supabase } from '@/lib/supabase';

/* Quién eres dentro de ANIMA, más allá de la empresa en la que estés parado.
   El perfil es de la persona y viaja con ella entre organizaciones. */

export interface Perfil {
  id: string;
  email: string | null;
  full_name: string | null;
  /** Guardado en `profiles.locale`. Hoy solo hay español traducido. */
  locale: string | null;
}

export interface Aviso {
  id: string; title: string; body: string | null;
  kind: string | null; link: string | null; created_at: string; read_at: string | null;
}

export const perfilService = {
  async mio(): Promise<Perfil | null> {
    const { data: sesion } = await supabase.auth.getUser();
    const id = sesion.user?.id;
    if (!id) return null;
    const { data } = await supabase
      .from('profiles').select('id, email, full_name, locale').eq('id', id).maybeSingle();
    return (data as Perfil) ?? { id, email: sesion.user?.email ?? null, full_name: null, locale: null };
  },

  async fijarIdioma(locale: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const id = sesion.user?.id;
    if (!id) return;
    const { error } = await supabase.from('profiles').update({ locale }).eq('id', id);
    if (error) throw error;
  },

  async fijarNombre(full_name: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const id = sesion.user?.id;
    if (!id) return;
    const { error } = await supabase.from('profiles').update({ full_name }).eq('id', id);
    if (error) throw error;
  },

  /* Los avisos de la empresa que todavía no se han leído. La política de la
     tabla pide nivel 40 o más: quien no llega, no ve nada y no pasa nada —
     por eso el error se traga y se devuelve una lista vacía. */
  async avisos(companyId: string, limite = 5): Promise<Aviso[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, body, kind, link, created_at, read_at')
      .eq('company_id', companyId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) return [];
    return (data ?? []) as Aviso[];
  },

  async marcarLeido(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  }
};

/** Los idiomas del sistema. Solo se ofrece lo que de verdad está traducido. */
export const IDIOMAS = [
  { codigo: 'es', nombre: 'Español', listo: true },
  { codigo: 'en', nombre: 'English', listo: false }
] as const;
