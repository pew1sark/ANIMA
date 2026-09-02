import { supabase } from '@/lib/supabase';

/* El resumen de un módulo, tal como lo declara `resumen_modulo()`.

   Los tipos de aquí describen una FORMA, no un módulo: la pantalla dibuja
   cifras, series y listas sin saber si vienen de Clientes o de Reparto. Por eso
   agregar el resumen de un módulo nuevo es escribir SQL, no un componente. */

export type Formato = 'dinero' | 'numero' | 'porcentaje' | 'fecha' | 'dias' | 'mes' | 'texto';
export type Tono = 'ok' | 'aviso' | 'malo';

export interface Cifra {
  etiqueta: string;
  valor: number;
  formato?: Formato;
  nota?: string;
  tono?: Tono;
}

export interface PuntoSerie { x: string; y: number; y2?: number; formato_x?: Formato }

export interface SerieResumen {
  titulo: string;
  nota?: string;
  formato?: Formato;
  /** Nombre de cada medida. Con dos, el gráfico apila y pone leyenda. */
  leyenda?: string[];
  puntos: PuntoSerie[];
}

export interface ColumnaLista { k: string; t: string; formato?: Formato; tono?: Tono }

export interface ListaResumen {
  titulo: string;
  nota?: string;
  columnas: ColumnaLista[];
  filas: Record<string, unknown>[];
}

export interface Resumen {
  cifras: Cifra[];
  series: SerieResumen[];
  listas: ListaResumen[];
}

const VACIO: Resumen = { cifras: [], series: [], listas: [] };

export async function cargarResumen(companyId: string, modulo: string): Promise<Resumen> {
  const { data, error } = await supabase.rpc('resumen_modulo', {
    p_company: companyId, p_modulo: modulo
  });
  if (error) throw error;
  const d = (data ?? {}) as Partial<Resumen>;
  return { ...VACIO, ...d };
}
