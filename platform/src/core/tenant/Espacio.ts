import { supabase } from '@/lib/supabase';
import type { TenantType } from '@/types/core';

/* El espacio de trabajo de una organización: quién soy dentro, qué plan tiene,
   qué módulos puedo usar y qué se construyó a medida para ella. */
export interface Espacio {
  empresa: { id: string; nombre: string; slug: string; moneda: string;
             pais: string; estado: string; linea: string | null; linea_slug: string | null;
             /** operator: administra su propia data · advisor: la de sus clientes */
             tipo: TenantType };
  plan: { nombre: string; estado: string; precio: number } | null;
  modulos: { slug: string; encendido: boolean; en_el_plan: boolean; disponible: boolean }[];
  features: { slug: string; nombre: string; etapa: string; descripcion: string | null }[];
  mi_rol: { nombre: string; nivel: number; funcional: string | null } | null;
}

export async function cargarEspacio(companyId: string): Promise<Espacio> {
  const { data, error } = await supabase.rpc('mi_espacio', { p_company: companyId });
  if (error) throw error;
  return data as Espacio;
}

export async function cargarKpis(companyId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('dashboard_kpis', { p_company: companyId });
  if (error) throw error;
  return (data ?? {}) as Record<string, number>;
}
