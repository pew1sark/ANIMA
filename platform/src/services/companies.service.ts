import { supabase } from '@/lib/supabase';
import type { Company, ModuleSlug } from '@/types/core';

/* Ningún servicio envía company_id "de confianza" desde el navegador:
   se envía como dato, y PostgreSQL decide con RLS si es legítimo. */
export const companiesService = {
  async list(): Promise<Company[]> {
    const { data, error } = await supabase.from('companies').select('*').order('name');
    if (error) throw error;
    return data as Company[];
  },

  async create(input: { name: string; slug: string }): Promise<Company> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('companies')
      .insert({ ...input, created_by: auth.user?.id })
      .select()
      .single();
    if (error) throw error;
    return data as Company;   // el trigger deja al creador como owner
  },

  async setModule(companyId: string, module: ModuleSlug, enabled: boolean) {
    const { data: mod, error: e1 } = await supabase.from('modules').select('id').eq('slug', module).single();
    if (e1) throw e1;
    const { error } = await supabase
      .from('company_modules')
      .upsert({ company_id: companyId, module_id: mod.id, enabled }, { onConflict: 'company_id,module_id' });
    if (error) throw error;
  }
};
