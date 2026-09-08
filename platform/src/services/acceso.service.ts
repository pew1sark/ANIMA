import { supabase } from '@/lib/supabase';
import { env } from '@/config/env';

/* Todo lo que ocurre antes de tener sesión: activar una invitación, recuperar
   la contraseña y pedir acceso. Son las tres únicas cosas que alguien sin
   sesión puede hacer aquí. */

export interface Solicitud {
  email: string;
  nombre?: string | null;
  organizacion?: string | null;
  telefono?: string | null;
  linea: 'studio' | 'company';
  mensaje?: string | null;
  /** Dónde se llenó el formulario. La portada tiene el suyo desde sep 2026. */
  fuente?: 'login' | 'portada';
  /** La oferta con la que entró, si entró con una. */
  promo?: 'mes-extra' | null;
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

  /* Convierte una invitación en cuenta. La invitación ya existe —alguien dio
     de alta a esta persona—; lo que falta es el usuario de `auth.users`, y eso
     solo lo crea la API de administración, con una clave que no puede vivir en
     el navegador. Por eso pasa por una función edge.

     Nunca falla hacia fuera ni distingue casos: haya invitación o no, la
     respuesta es la misma. Contestar distinto convertiría esta pantalla en un
     buscador de quién trabaja con ANIMA. */
  async activarInvitacion(email: string) {
    const { error } = await supabase.functions.invoke('activar-invitacion', {
      body: { email: email.trim().toLowerCase() }
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
      telefono: limpio(s.telefono),
      linea: s.linea,
      mensaje: limpio(s.mensaje),
      fuente: s.fuente ?? 'login',
      /* La oferta viaja con la fila. Un mes gratis prometido en una pantalla y
         no escrito en la base es un mes que nadie va a honrar. */
      promo: s.promo ?? null
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

/* ¿Volvió del correo de invitación? La marca va en la QUERY y no en el hash a
   propósito: supabase-js lee el fragmento del enlace al arrancar y lo borra,
   así que cualquier marcador puesto ahí sería una carrera contra la carga de
   la aplicación. La query sobrevive, y esto se puede leer cuando haga falta.

   Importa acertar: el enlace de invitación abre una sesión de verdad. Sin esta
   señal, alguien recién invitado entraría a ANIMA sin haber puesto nunca una
   contraseña —y no podría volver a entrar nunca más. */
export function vieneDeInvitacion(): boolean {
  return new URLSearchParams(location.search).get('activar') === '1';
}

/* Se llama al terminar de fijar la contraseña. Sin esto, recargar volvería a
   la misma pantalla porque la marca sigue en la barra de direcciones. */
export function limpiarMarcaDeInvitacion() {
  const q = new URLSearchParams(location.search);
  if (!q.has('activar')) return location.pathname + location.search;
  q.delete('activar');
  const s = q.toString();
  return location.pathname + (s ? '?' + s : '');
}
