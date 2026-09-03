import { supabase } from '@/lib/supabase';

/* El análisis financiero, tal como lo devuelve `analisis_financiero()`.

   Aquí no se suma nada, igual que en informes: si el margen se calculara en la
   pantalla, el mismo mes daría dos cifras según por dónde se mire. Lo único
   que hace este archivo es describir la forma de la respuesta y pedirla. */

export interface Resultado {
  ingresos: number; costo_ventas: number; margen_bruto: number;
  margen_pct: number | null; compras: number; mermas: number; gastos: number;
  resultado_neto: number; pedidos: number; ticket: number;
}

export interface Antes {
  ingresos: number; margen_bruto: number; resultado_neto: number;
  gastos: number; compras: number; desde: string; hasta: string;
}

export interface Deuda {
  total: number; vencido: number; documentos: number;
  /** Días que tarda en cobrarse (o pagarse) lo del período. Sin base, null. */
  dias: number | null;
}

export interface MesResultado {
  mes: string; ingresos: number; costo: number; margen: number;
  gastos: number; resultado: number;
}
export interface MesCaja { mes: string; cobros: number; pagos: number; neto: number }

export interface Tramo { orden: number; tramo: string; monto: number; documentos: number }

export interface ClienteAnalisis {
  nombre: string; ventas: number; margen: number; margen_pct: number | null;
  participacion: number; deuda: number; pedidos: number;
}

export interface ProductoAnalisis {
  nombre: string; unidades: number; ventas: number; costo: number;
  margen: number; margen_pct: number | null;
}

export interface GastoCategoria {
  categoria: string; monto: number; participacion: number; movimientos: number;
}

export interface Alerta {
  clave: string; tono: 'malo' | 'aviso' | 'ok'; titulo: string; detalle: string;
}

export interface Analisis {
  periodo: { desde: string; hasta: string; dias: number; moneda: string };
  resultado: Resultado;
  antes: Antes;
  caja: { cobros: number; pagos: number; neto: number };
  cobrar: Deuda;
  pagar: Deuda;
  inventario: { valor: number; lotes: number };
  capital_trabajo: number;
  series: { mensual: MesResultado[]; caja: MesCaja[] };
  aging_cobros: Tramo[];
  aging_pagos: Tramo[];
  clientes: ClienteAnalisis[];
  productos: ProductoAnalisis[];
  gastos: GastoCategoria[];
  alertas: Alerta[];
}

/** Devuelve null cuando el nivel de la persona no llega a Finanzas: la base
 *  responde `{}` en vez de fallar, y la pantalla lo dice con calma. */
export async function cargarAnalisis(
  companyId: string, desde: string, hasta: string): Promise<Analisis | null> {
  const { data, error } = await supabase.rpc('analisis_financiero', {
    p_company: companyId, p_desde: desde, p_hasta: hasta
  });
  if (error) throw error;
  const d = data as Partial<Analisis> | null;
  if (!d || !d.periodo) return null;
  return d as Analisis;
}
