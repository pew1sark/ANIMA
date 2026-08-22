import { supabase } from '@/lib/supabase';
import type { CompanyMember, RoleSlug } from '@/types/core';

export const membersService = {
  async listByCompany(companyId: string): Promise<CompanyMember[]> {
    const { data, error } = await supabase
      .from('company_members')
      .select('*, role:roles(*)')
      .eq('company_id', companyId);
    if (error) throw error;
    return data as unknown as CompanyMember[];
  },

  async setRole(memberId: string, roleSlug: RoleSlug) {
    const { data: role, error: e1 } = await supabase.from('roles').select('id').eq('slug', roleSlug).single();
    if (e1) throw e1;
    const { error } = await supabase.from('company_members').update({ role_id: role.id }).eq('id', memberId);
    if (error) throw error;
  }
};
