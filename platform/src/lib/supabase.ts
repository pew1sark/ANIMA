import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

/* Cliente único. La seguridad no vive aquí: vive en las políticas RLS
   de PostgreSQL. Este cliente solo transporta el JWT del usuario. */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
