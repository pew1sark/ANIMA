import { supabase } from '@/lib/supabase';

/* El panel de inicio viene entero de `panel_inicio()`. Una llamada, una
   respuesta, un solo criterio: la pantalla dibuja y no suma.

   El molde de esto es `informe_ventas()`, por la misma razón que se escribió
   así: si la venta del mes se calculara aquí y en la base, tarde o temprano
   darían cifras distintas y no habría manera de saber cuál está mal. */

export interface PanelHoy {
  ventas: number; pedidos: number; entregados: number;
  en_reparto: number; por_preparar: number; sale_hoy: number;
}
export interface PanelMes {
  ventas: number; margen: number; pedidos: number;
  /** El mismo tramo del mes anterior, no el mes anterior entero. */
  ventas_antes: number; dia: number; dias: number;
}
export interface PanelCobro {
  por_cobrar: number; vencido: number; documentos: number; vencidos: number;
}
export interface PuntoDia   { dia: string; ventas: number; pedidos: number }
export interface PuntoMes   { mes: string; ventas: number; margen: number; pedidos: number }
export interface FilaPedido {
  id: string; codigo: string; cliente: string; comuna: string | null;
  estado: string; pago: string; entrega: string | null;
  total: number; saldo: number;
}
export interface FilaStock {
  nombre: string; unidad: string; disponible: number;
  minimo: number; falta: number; valor: number;
}
export interface FilaVence {
  lote: string; producto: string; cantidad: number; unidad: string;
  vence: string; dias: number; valor: number;
}
export interface FilaTramo { orden: number; tramo: string; monto: number; documentos: number }
export interface FilaComuna {
  comuna: string; region: string | null;
  clientes: number; pedidos: number; ventas: number;
}

export interface Panel {
  hoy: PanelHoy;
  mes: PanelMes;
  compras_mes: number;
  cobro: PanelCobro;
  dias: PuntoDia[];
  meses: PuntoMes[];
  pedidos: FilaPedido[];
  stock_critico: FilaStock[];
  por_vencer: FilaVence[];
  cobranza: FilaTramo[];
  mapa: { comunas: FilaComuna[]; ubicados: number; total: number };
  generado: string;
}

/* Un panel en blanco. La función devuelve `{}` cuando el rol no llega a nivel
   40 —lo mismo que hace `informe_ventas`—, así que la pantalla necesita algo
   que dibujar sin ramas `?.` en cada línea. */
const VACIO: Panel = {
  hoy: { ventas: 0, pedidos: 0, entregados: 0, en_reparto: 0, por_preparar: 0, sale_hoy: 0 },
  mes: { ventas: 0, margen: 0, pedidos: 0, ventas_antes: 0, dia: 1, dias: 30 },
  compras_mes: 0,
  cobro: { por_cobrar: 0, vencido: 0, documentos: 0, vencidos: 0 },
  dias: [], meses: [], pedidos: [], stock_critico: [], por_vencer: [], cobranza: [],
  mapa: { comunas: [], ubicados: 0, total: 0 },
  generado: ''
};

export async function cargarPanel(companyId: string): Promise<Panel> {
  const { data, error } = await supabase.rpc('panel_inicio', { p_company: companyId });
  if (error) throw error;
  const d = (data ?? {}) as Partial<Panel>;
  return { ...VACIO, ...d };
}
