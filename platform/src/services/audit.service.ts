import { supabase } from '@/lib/supabase';
import type { AuditEntry } from '@/types/core';

/* El registro es inmutable: la base no tiene políticas de UPDATE ni DELETE
   sobre audit_logs. Escribir aquí es una decisión definitiva. */
export const auditService = {
  async record(entry: Omit<AuditEntry, 'user_id'>) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('audit_logs').insert({ ...entry, user_id: auth.user?.id });
    if (error) throw error;
  },

  async list(companyId: string, limit = 100) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
};
