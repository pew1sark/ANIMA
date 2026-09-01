import { supabase } from '@/lib/supabase';
import { env } from '@/config/env';

/* Todo lo que ocurre antes de tener sesión: recuperar la contraseña y pedir
   acceso. Son las dos únicas cosas que alguien sin cuenta puede hacer aquí. */

export interface Solicitud {
  email: string;
  nombre?: string | null;
  organizacion?: string | null;
  linea: 'studio' | 'company';
  mensaje?: string | null;
}

export const accesoService = {
  /* Supabase manda el correo. Vuelve a esta misma app con una sesión de
     recuperación en la URL, y ahí se fija la contraseña nueva. */
  async pedirEnlace(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: location.origin + env.sitio + 'app/'
    });
    if (error) throw error;
  },

  async fijarContrasena(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  /* No crea cuenta: deja la petición anotada. Alguien la revisa en la consola
     y abre la puerta a mano. Es deliberado — el acceso es por invitación. */
  async pedirAcceso(s: Solicitud) {
    const limpio = (v?: string | null) => { const x = (v ?? '').trim(); return x === '' ? null : x; };
    const { error } = await supabase.from('access_requests').insert({
      email: s.email.trim().toLowerCase(),
      nombre: limpio(s.nombre),
      organizacion: limpio(s.organizacion),
      linea: s.linea,
      mensaje: limpio(s.mensaje)
    });
    /* Índice único sobre los pendientes: pedir dos veces no es un error que
       haya que mostrar en rojo, es que ya está pedido. */
    if (error && !/duplicate key|unique/i.test(error.message)) throw error;
  }
};

/* ¿Volvió del correo de recuperación? Supabase deja la sesión en el hash. */
export function vieneDeRecuperacion(): boolean {
  const h = location.hash || '';
  return /type=recovery/.test(h) || /access_token=/.test(h);
}
