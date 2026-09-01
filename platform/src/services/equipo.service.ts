import { supabase } from '@/lib/supabase';

/* El equipo de una empresa: quién trabaja aquí y con qué rol.

   El correo vive en `auth.users`, que el cliente no puede leer, así que la
   lista llega de la función `equipo()` en vez de una consulta directa. */

export interface Miembro {
  id: string;
  user_id: string;
  correo: string;
  nombre: string | null;
  rol: string;
  rol_slug: string;
  nivel: number;
  estado: 'invited' | 'active' | 'suspended';
  desde: string;
  soy_yo: boolean;
}

export interface Invitacion {
  id: string;
  email: string;
  full_name: string | null;
  role_id: string | null;
  created_at: string;
  expires_at: string;
}

/** Los roles que se pueden asignar dentro de una empresa, de mayor a menor. */
export const ROLES = [
  { slug: 'owner',    nombre: 'Propietario',   nivel: 100, que: 'Todo, incluido cerrar la empresa' },
  { slug: 'admin',    nombre: 'Administrador', nivel: 80,  que: 'Configuración, equipo y marca' },
  { slug: 'manager',  nombre: 'Encargado',     nivel: 60,  que: 'Compras, pagos y cobranza' },
  { slug: 'employee', nombre: 'Empleado',      nivel: 40,  que: 'Trabajo del día: pedidos, clientes, stock' },
  { slug: 'viewer',   nombre: 'Lectura',       nivel: 20,  que: 'Mira y no toca' }
] as const;

export const equipoService = {
  async miembros(companyId: string): Promise<Miembro[]> {
    const { data, error } = await supabase.rpc('equipo', { p_company: companyId });
    if (error) throw error;
    return (data ?? []) as Miembro[];
  },

  async cambiarRol(memberId: string, rolSlug: string) {
    const { data: rol, error: e1 } = await supabase
      .from('roles').select('id').eq('slug', rolSlug).eq('scope', 'company').single();
    if (e1) throw e1;
    const { error } = await supabase
      .from('company_members').update({ role_id: rol.id }).eq('id', memberId);
    if (error) throw error;
  },

  async cambiarEstado(memberId: string, estado: 'active' | 'suspended') {
    const { error } = await supabase
      .from('company_members').update({ status: estado }).eq('id', memberId);
    if (error) throw error;
  },

  // --------------------------------------------------------- invitaciones

  async invitaciones(companyId: string): Promise<Invitacion[]> {
    const { data, error } = await supabase
      .from('user_invitations')
      .select('id, email, full_name, role_id, created_at, expires_at')
      .eq('company_id', companyId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Invitacion[];
  },

  async invitar(companyId: string, email: string, rolSlug: string, nombre?: string) {
    const { data: rol, error: e1 } = await supabase
      .from('roles').select('id').eq('slug', rolSlug).eq('scope', 'company').single();
    if (e1) throw e1;
    const { error } = await supabase.from('user_invitations').insert({
      company_id: companyId,
      email: email.trim().toLowerCase(),
      full_name: nombre?.trim() || null,
      role_id: rol.id
    });
    if (error) throw error;
  },

  async retirarInvitacion(id: string) {
    const { error } = await supabase.from('user_invitations').delete().eq('id', id);
    if (error) throw error;
  },

  /* Se llama al entrar. Si el correo de quien entra tiene invitaciones
     pendientes, se convierten en membresías. Devuelve cuántas. */
  async aceptarPendientes(): Promise<number> {
    const { data, error } = await supabase.rpc('aceptar_invitaciones');
    if (error) throw error;
    return Number(data ?? 0);
  }
};
