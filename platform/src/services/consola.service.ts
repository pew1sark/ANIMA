import { supabase } from '@/lib/supabase';

/* La consola de plataforma: el centro de control de ANIMA TSC.
   ---------------------------------------------------------------------------
   Aquí se vigila el ESTADO de cada cliente —si entra, si usa, si le queda
   cupo, si su plan le sirve, si arrancó— y nada más.

   NO hay dinero en este archivo, y es a propósito. La relación comercial con
   un cliente vive en ANIMA COMPANY, con la misma ficha, los mismos documentos
   y los mismos vencimientos que cualquier otro cliente. Tener aquí una segunda
   contabilidad, paralela y solo para los clientes del software, era el enredo:
   dos sitios donde mirar lo mismo, y ninguno completo.

   Todo lo protege RLS con is_platform_admin(); este archivo solo pide. */

export interface DatosCliente {
  clientes: number; productos: number; pedidos: number; pedidos_30d: number;
}

export interface EstadoCliente {
  company_id: string;
  empresa: string;
  slug: string;
  /** El de la empresa: trial, active, suspended… */
  estado: string;
  linea: string | null;
  linea_slug: string | null;
  plan: string | null;
  suscripcion: string | null;
  desde: string | null;
  usuarios: number;
  usuarios_plan: number | null;
  /** Lo último que alguien hizo con impacto real dentro de ese cliente. */
  ultima_actividad: string | null;
  acciones_7d: number;
  datos: DatosCliente;
  modulos: number;
  modulos_plan: number;
  /** Módulos encendidos que su plan NO incluye: una promesa que RLS no cumple. */
  fuera_del_plan: number;
  levantamiento: 'sin abrir' | 'abierto' | 'enviado' | 'aplicado';
}

export interface PlanDisponible {
  slug: string; name: string; price_amount: number; linea: string | null; linea_slug: string | null;
}

export interface NuevoCliente {
  nombre: string; slug: string; plan: string; linea: string; mensualidad?: number | null;
}

export interface SolicitudAcceso {
  id: string;
  email: string;
  nombre: string | null;
  organizacion: string | null;
  linea: 'studio' | 'company';
  mensaje: string | null;
  status: 'pendiente' | 'invitada' | 'rechazada';
  created_at: string;
}

export const consolaService = {
  /* Quién pidió entrar. Se guardan desde el login sin crear ninguna cuenta:
     abrir la puerta sigue siendo un acto deliberado. */
  async solicitudes(): Promise<SolicitudAcceso[]> {
    const { data, error } = await supabase
      .from('access_requests')
      .select('id, email, nombre, organizacion, linea, mensaje, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as SolicitudAcceso[];
  },

  async resolverSolicitud(id: string, status: 'invitada' | 'rechazada') {
    const { error } = await supabase
      .from('access_requests')
      .update({ status, resuelta_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** El estado de todos los clientes, en una llamada. Lo arma la base. */
  async estado(): Promise<EstadoCliente[]> {
    const { data, error } = await supabase.rpc('estado_clientes');
    if (error) throw error;
    return (data ?? []) as EstadoCliente[];
  },

  async planes(): Promise<PlanDisponible[]> {
    const { data, error } = await supabase
      .from('plans')
      .select('slug, name, price_amount, product_line:product_lines(name, slug)')
      .eq('active', true)
      .order('sort');
    if (error) throw error;
    /* `product_line` es una relación a uno, pero el generador de tipos de
       supabase-js la declara como arreglo. Se normaliza aquí en vez de mentirle
       al compilador con un `any`. */
    return (data ?? []).map(p => {
      const fila = p as unknown as {
        slug: string; name: string; price_amount: number;
        product_line?: { name?: string; slug?: string } | { name?: string; slug?: string }[] | null;
      };
      const linea = Array.isArray(fila.product_line) ? fila.product_line[0] : fila.product_line;
      return {
        slug: fila.slug, name: fila.name, price_amount: fila.price_amount,
        linea: linea?.name ?? null, linea_slug: linea?.slug ?? null
      };
    });
  },

  /* El alta abre la cuenta y enciende lo que trae el plan. No emite ningún
     cobro: lo que se le facture al cliente se registra en ANIMA COMPANY. */
  async crearCliente(c: NuevoCliente): Promise<string> {
    const { data, error } = await supabase.rpc('crear_cliente', {
      p_nombre: c.nombre,
      p_slug: c.slug,
      p_plan: c.plan,
      p_linea: c.linea,
      p_mensualidad: c.mensualidad ?? null
    });
    if (error) throw error;
    return data as string;
  }
};

/* ------------------------------------------------------------------ señales

   Lo que hace que una lista de clientes sea un centro de control: no enseñar
   quince cifras iguales, sino decir cuál de ellos necesita algo hoy. */

export type Gravedad = 'malo' | 'aviso' | 'ok';
export interface Senal { tono: Gravedad; texto: string }

const DIA = 86400000;

export function senalesDe(c: EstadoCliente): Senal[] {
  const s: Senal[] = [];

  if (c.suscripcion && c.suscripcion !== 'activa') {
    s.push({ tono: c.suscripcion === 'prueba' ? 'aviso' : 'malo',
             texto: `Suscripción ${c.suscripcion}` });
  }
  if (c.usuarios === 0) {
    s.push({ tono: 'malo', texto: 'Nadie tiene acceso todavía' });
  } else if (c.usuarios_plan != null && c.usuarios >= c.usuarios_plan) {
    s.push({ tono: 'aviso', texto: `Cupo lleno: ${c.usuarios} de ${c.usuarios_plan}` });
  }
  if (c.fuera_del_plan > 0) {
    s.push({ tono: 'aviso', texto: `${c.fuera_del_plan} módulo(s) encendido(s) fuera del plan` });
  }
  if (c.levantamiento === 'sin abrir') {
    s.push({ tono: 'aviso', texto: 'Sin puesta en marcha' });
  } else if (c.levantamiento === 'enviado') {
    s.push({ tono: 'aviso', texto: 'Levantamiento enviado, sin aplicar' });
  }

  const vacio = c.datos.clientes === 0 && c.datos.productos === 0 && c.datos.pedidos === 0;
  if (vacio) {
    s.push({ tono: 'malo', texto: 'La cuenta está vacía' });
  } else if (c.datos.pedidos_30d === 0 && c.datos.pedidos > 0) {
    s.push({ tono: 'aviso', texto: 'Sin pedidos en 30 días' });
  }

  const dias = diasSin(c.ultima_actividad);
  if (dias == null) s.push({ tono: 'malo', texto: 'Nunca ha registrado actividad' });
  else if (dias > 14) s.push({ tono: 'aviso', texto: `Sin actividad hace ${dias} días` });

  if (s.length === 0) s.push({ tono: 'ok', texto: 'Todo en orden' });
  return s;
}

export function diasSin(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DIA);
}

/** La peor señal manda: es la que decide el color de la fila. */
export const gravedadDe = (s: Senal[]): Gravedad =>
  s.some(x => x.tono === 'malo') ? 'malo'
  : s.some(x => x.tono === 'aviso') ? 'aviso' : 'ok';
