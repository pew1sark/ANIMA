import { supabase } from '@/lib/supabase';

/* La consola de plataforma: el negocio del software, no la operación del cliente.
   Todo lo de aquí lo protege RLS con is_platform_admin(); este archivo solo pide. */

export interface ClienteCartera {
  company_id: string;
  empresa: string;
  slug: string;
  estado_empresa: string;
  linea: string | null;
  plan: string | null;
  suscripcion: string | null;
  mensualidad: number | null;
  total_cobrado: number;
  total_pagado: number;
  saldo: number;
  vencidos: number | null;
}

export interface Concepto {
  slug: string; name: string; description: string | null; recurrente: boolean;
}

export interface Pago {
  id: string; amount: number; paid_at: string; method: string | null; reference: string | null;
}

export interface Cobro {
  id: string;
  company_id: string;
  concept: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  currency: string;
  issued_at: string;
  due_date: string | null;
  status: 'pendiente' | 'pagado' | 'anulado';
  notes: string | null;
  platform_payments: Pago[];
}

export interface PlanDisponible {
  slug: string; name: string; price_amount: number; linea: string | null; linea_slug: string | null;
}

export interface NuevoCliente {
  nombre: string; slug: string; plan: string; linea: string;
  mensualidad?: number | null; implementacion?: number | null;
}

export interface NuevoCobro {
  company_id: string; concept: string; description?: string | null;
  amount: number; due_date?: string | null;
  period_start?: string | null; period_end?: string | null;
}

export const consolaService = {
  async cartera(): Promise<ClienteCartera[]> {
    const { data, error } = await supabase
      .from('v_cartera_plataforma')
      .select('*')
      .order('empresa');
    if (error) throw error;
    return (data ?? []) as ClienteCartera[];
  },

  async conceptos(): Promise<Concepto[]> {
    const { data, error } = await supabase
      .from('platform_charge_concepts')
      .select('slug, name, description, recurrente')
      .eq('active', true)
      .order('sort');
    if (error) throw error;
    return (data ?? []) as Concepto[];
  },

  async planes(): Promise<PlanDisponible[]> {
    const { data, error } = await supabase
      .from('plans')
      .select('slug, name, price_amount, product_line:product_lines(name, slug)')
      .eq('active', true)
      .order('sort');
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      slug: p.slug, name: p.name, price_amount: p.price_amount,
      linea: p.product_line?.name ?? null, linea_slug: p.product_line?.slug ?? null
    }));
  },

  async cobros(companyId: string): Promise<Cobro[]> {
    const { data, error } = await supabase
      .from('platform_charges')
      .select('*, platform_payments(id, amount, paid_at, method, reference)')
      .eq('company_id', companyId)
      .order('issued_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Cobro[];
  },

  async crearCliente(c: NuevoCliente): Promise<string> {
    const { data, error } = await supabase.rpc('crear_cliente', {
      p_nombre: c.nombre,
      p_slug: c.slug,
      p_plan: c.plan,
      p_linea: c.linea,
      p_mensualidad: c.mensualidad ?? null,
      p_implementacion: c.implementacion ?? null
    });
    if (error) throw error;
    return data as string;
  },

  async crearCobro(c: NuevoCobro): Promise<void> {
    const { error } = await supabase.from('platform_charges').insert({
      company_id: c.company_id,
      concept: c.concept,
      description: c.description ?? null,
      amount: c.amount,
      due_date: c.due_date ?? null,
      period_start: c.period_start ?? null,
      period_end: c.period_end ?? null
    });
    if (error) throw error;
  },

  /* El estado del cobro no se toca a mano: lo recalcula un disparador
     a partir de lo pagado. */
  async registrarPago(chargeId: string, amount: number, method?: string, reference?: string): Promise<void> {
    const { error } = await supabase.from('platform_payments').insert({
      charge_id: chargeId, amount, method: method || null, reference: reference || null
    });
    if (error) throw error;
  },

  async anularCobro(id: string): Promise<void> {
    const { error } = await supabase.from('platform_charges').update({ status: 'anulado' }).eq('id', id);
    if (error) throw error;
  }
};

export const pagado = (c: Cobro) =>
  (c.platform_payments ?? []).reduce((s, p) => s + p.amount, 0);
