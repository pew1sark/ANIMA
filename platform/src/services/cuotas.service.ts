import { supabase } from '@/lib/supabase';

/* Las cuotas del plan contratado.
   ---------------------------------------------------------------------------
   Quien decide es la base: `cuotas()` lee el plan de la suscripción activa y
   cuenta el uso real. Aquí no se calcula nada ni se guarda ningún tope — si
   una cifra se escribiera también en el front, tarde o temprano diría otra
   cosa que el disparador que bloquea de verdad. */

export interface Cuota {
  clave: string;
  etiqueta: string;
  uso: number;
  tope: number;
  /** 0–100. Lo calcula la base para que la barra y el bloqueo cuenten igual. */
  pct: number;
}

export const cuotasService = {
  /** Devuelve solo las cuotas que el plan limita. En Pro, Max y Enterprise
      no hay ninguna, así que la lista viene vacía y la tarjeta no se dibuja. */
  async del(companyId: string): Promise<Cuota[]> {
    const { data, error } = await supabase.rpc('cuotas', { p_company: companyId });
    if (error) throw error;
    return (data ?? []) as Cuota[];
  }
};

/* ¿Este error es un tope de plan y no un fallo? El disparador lo marca con
   SQLSTATE 45000 y con un mensaje ya escrito para mostrarse tal cual. */
export function esCupoAgotado(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err
    && String((err as { code: unknown }).code) === '45000';
}
