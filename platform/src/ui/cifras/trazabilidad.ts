import type { Formato } from '@/services/resumen.service';

/* Trazabilidad de una cifra: el valor junto con la fórmula y los insumos que
   lo explican. Nació en Capital Intelligence y lo usan también Real Estate y
   las tarjetas de cualquier panel, por eso vive en la UI compartida y no en un
   módulo: un módulo no puede depender de otro. */

export interface Insumo { etiqueta: string; valor: number | null; formato: Formato }

/** Una cifra con su explicación pegada. Es lo que devuelven tanto los
 *  indicadores del modelo como las tarjetas del panel. */
export interface Indicador {
  clave: string;
  etiqueta: string;
  valor: number | null;
  formato: Formato;
  formula: string;
  insumos: Insumo[];
  /** Solo en el panel: cómo se pinta la tarjeta. */
  tono?: 'ok' | 'aviso' | 'malo';
  nota?: string | null;
}

export interface Aviso {
  clave: string;
  nivel: 'aviso' | 'bloqueante';
  titulo: string;
  detalle: string;
}
