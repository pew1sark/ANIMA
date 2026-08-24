import { supabase } from '@/lib/supabase';

/* Todo lo que el panel necesita para mostrar cómo quedó configurada una
   empresa. Cada consulta pasa el company_id explícito: no se confía en un
   estado de sesión del servidor. */

export interface ModuloEstado {
  modulo: string; encendido: boolean; en_el_plan: boolean; disponible: boolean;
}
export interface CampoPersonalizado {
  key: string; label: string; field_type: string; options: string[]; required: boolean; help: string | null;
}
export interface EstadoFlujo {
  key: string; label: string; color: string | null; sort: number;
  is_initial: boolean; is_final: boolean; is_cancel: boolean;
}
export interface Flujo { id: string; entity: string; name: string; estados: EstadoFlujo[] }
export interface FeatureTenant { slug: string; name: string; description: string | null; stage: string }
export interface Suscripcion { plan: string; estado: string; precio: number; moneda: string; linea: string | null }

export const platformService = {
  async modulos(companyId: string): Promise<ModuloEstado[]> {
    const { data, error } = await supabase.rpc('company_plan_state', { p_company: companyId });
    if (error) throw error;
    return (data ?? []) as ModuloEstado[];
  },

  async campos(companyId: string, entidad = 'products'): Promise<CampoPersonalizado[]> {
    const { data, error } = await supabase.rpc('custom_fields_for', { p_entity: entidad, p_company: companyId });
    if (error) throw error;
    return (data ?? []) as CampoPersonalizado[];
  },

  async flujos(companyId: string): Promise<Flujo[]> {
    const { data, error } = await supabase
      .from('workflows')
      .select('id, entity, name, workflow_states(key,label,color,sort,is_initial,is_final,is_cancel)')
      .eq('company_id', companyId).eq('active', true);
    if (error) throw error;
    return (data ?? []).map((w: any) => ({
      id: w.id, entity: w.entity, name: w.name,
      estados: (w.workflow_states ?? []).sort((a: EstadoFlujo, b: EstadoFlujo) => a.sort - b.sort)
    }));
  },

  async features(companyId: string): Promise<FeatureTenant[]> {
    const { data, error } = await supabase
      .from('company_features')
      .select('enabled, feature:features(slug,name,description,stage)')
      .eq('company_id', companyId).eq('enabled', true);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.feature).filter(Boolean) as FeatureTenant[];
  },

  async suscripcion(companyId: string): Promise<Suscripcion | null> {
    const { data } = await supabase
      .from('subscriptions')
      .select('status, price_amount, currency, plan:plans(name, product_line:product_lines(name))')
      .eq('company_id', companyId).maybeSingle();
    if (!data) return null;
    const d = data as any;
    return {
      plan: d.plan?.name ?? '—', estado: d.status, precio: d.price_amount,
      moneda: d.currency, linea: d.plan?.product_line?.name ?? null
    };
  },

  async levantamiento(companyId: string) {
    const { data } = await supabase
      .from('survey_sessions')
      .select('client_name, business_name, submitted_at, applied_at, template:survey_templates(name)')
      .eq('company_id', companyId).maybeSingle();
    return data as any;
  }
};
