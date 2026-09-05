import { supabase } from '@/lib/supabase';
import type { Cifra, ListaResumen, SerieResumen, Formato } from '@/services/resumen.service';

/* Capital Intelligence, del lado del navegador.

   Este archivo describe la FORMA de lo que devuelve la base y lo pide. No suma
   nada, y no es por pereza: el EBITDA de un mes tiene que dar lo mismo en el
   panel, en el modelo y en el informe, y la única manera de garantizarlo es que
   exista un solo lugar donde se calcule. Ese lugar es PostgreSQL —igual que en
   `analisis.service` y en `resumen.service`.

   Lo que sí es propio de aquí: cada cifra viene con su fórmula y sus insumos.
   La pantalla no reconstruye la explicación, la muestra. */

// ------------------------------------------------------------ trazabilidad

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

// ------------------------------------------------------------------ panel

export interface Filtros {
  portafolio?: string;
  proyecto?: string;
  unidad?: string;
  pais?: string;
  moneda?: string;
  estado?: string;
  /** Primer día del mes, en ISO. */
  desde?: string;
  hasta?: string;
}

export interface Panel {
  moneda: string;
  periodo: { desde: string; hasta: string };
  umbrales: { aviso: number; critico: number };
  cifras: Indicador[];
  series: SerieResumen[];
  listas: ListaResumen[];
  alertas: Aviso[];
}

/** Devuelve null cuando el nivel no llega al módulo: la base responde `{}`
 *  en vez de fallar, y la pantalla lo dice con calma. */
export async function cargarPanel(companyId: string, filtros: Filtros): Promise<Panel | null> {
  const { data, error } = await supabase.rpc('ci_resumen', {
    p_company: companyId, p_filtros: limpiar(filtros)
  });
  if (error) throw error;
  const d = data as Partial<Panel> | null;
  if (!d || !d.cifras) return null;
  return d as Panel;
}

// ------------------------------------------------------- modelo financiero

export type Naturaleza = 'ingreso' | 'costo_directo' | 'gasto_operativo' | 'depreciacion' | 'inversion';

export interface MesModelo {
  periodo: string;
  ingresos: number; cogs: number; margen_bruto: number; margen_pct: number | null;
  opex: number; ebitda: number; ebitda_pct: number | null;
  depreciacion: number; ebit: number; impuesto: number; capex: number;
  fco: number; fcl: number; caja_acumulada: number;
}

export interface Celda {
  monto: number;
  cantidad: number | null;
  precio: number | null;
  /** `manual` = alguien corrigió este mes a mano. La fórmula no lo pisa. */
  origen: 'formula' | 'manual';
}

export interface LineaModelo {
  id: string;
  kind: Naturaleza;
  category: string;
  name: string;
  unidad: string | null;
  unidad_id: string | null;
  driver: 'cantidad_precio' | 'monto' | 'pct_ingresos';
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  pct: number | null;
  growth_pct: number;
  frequency: 'mensual' | 'anual' | 'unica';
  sort: number;
  total: number;
  meses: Record<string, Celda>;
}

export interface ModeloCalculado {
  modelo: {
    id: string; version: number; label: string | null;
    estado: 'borrador' | 'validado' | 'archivado';
    moneda: string; inicio: string; meses: number;
    saldo_inicial: number | null;
    tasa_descuento: number | null; tasa_impuesto: number | null;
    validado_en: string | null; creado_en: string;
  };
  proyecto:  { id: string; nombre: string; codigo: string | null; moneda: string; estado: string };
  escenario: { id: string; nombre: string; tipo: string; supuestos: Record<string, unknown> };
  meses: MesModelo[];
  lineas: LineaModelo[];
  indicadores: Indicador[];
}

export async function cargarModelo(modelId: string): Promise<ModeloCalculado | null> {
  const { data, error } = await supabase.rpc('ci_modelo_calculado', { p_model: modelId });
  if (error) throw error;
  const d = data as Partial<ModeloCalculado> | null;
  return d && d.modelo ? (d as ModeloCalculado) : null;
}

export async function validarModelo(modelId: string): Promise<Aviso[]> {
  const { data, error } = await supabase.rpc('ci_validar_modelo', { p_model: modelId });
  if (error) throw error;
  return (data ?? []) as Aviso[];
}

/** Intenta marcar el modelo como validado. Si hay bloqueantes NO lo marca y
 *  devuelve cuáles: guardar un borrador nunca se impide, publicarlo sí. */
export async function marcarValidado(modelId: string):
  Promise<{ validado: boolean; bloqueantes: number; avisos: Aviso[] }> {
  const { data, error } = await supabase.rpc('ci_marcar_validado', { p_model: modelId });
  if (error) throw error;
  return data as { validado: boolean; bloqueantes: number; avisos: Aviso[] };
}

export async function nuevaVersion(modelId: string, etiqueta?: string): Promise<string> {
  const { data, error } = await supabase.rpc('ci_nueva_version', {
    p_model: modelId, p_label: etiqueta ?? null
  });
  if (error) throw error;
  return data as string;
}

/** Vuelve a expandir las líneas a sus meses. Respeta las celdas corregidas
 *  a mano: la fórmula no pisa lo que alguien escribió. */
export async function regenerar(modelId: string): Promise<number> {
  const { data, error } = await supabase.rpc('ci_generar_periodos', { p_model: modelId });
  if (error) throw error;
  return Number(data ?? 0);
}

// ------------------------------------------------ presupuesto contra real

export interface FilaPresupuesto {
  kind: Naturaleza;
  categoria: string;
  original: number; vigente: number;
  comprometido: number; pagado: number; real: number;
  diferencia: number;
  pct_ejecutado: number | null;
  proyeccion_cierre: number;
  semaforo: 'ok' | 'aviso' | 'malo' | 'neutro';
}

export interface Presupuesto {
  modelo: { id: string; version: number; label: string | null; estado: string; moneda: string };
  original_id: string | null;
  umbrales: { aviso: number; critico: number };
  desde: string; hasta: string;
  filas: FilaPresupuesto[];
  meses: { periodo: string; vigente: number; real: number }[];
  totales: {
    original: number; vigente: number; comprometido: number;
    pagado: number; real: number; diferencia: number;
  };
}

export async function cargarPresupuesto(
  projectId: string, modelId?: string, desde?: string, hasta?: string): Promise<Presupuesto | null> {
  const { data, error } = await supabase.rpc('ci_presupuesto_vs_real', {
    p_project: projectId, p_model: modelId ?? null,
    p_desde: desde ?? null, p_hasta: hasta ?? null
  });
  if (error) throw error;
  const d = data as Partial<Presupuesto> | null;
  return d && d.modelo ? (d as Presupuesto) : null;
}


// ------------------------------------------------- levantamiento y requisitos

/* El cuestionario y la lista de documentos no inventan tablas: se apoyan en
   `survey_templates` / `survey_sessions` / `survey_answers`, que existen desde
   la migración 0063 y hacen exactamente esto. Lo único propio de Capital
   Intelligence es la plantilla y `ci_requirements`. */

export interface Pregunta {
  id: string;
  q: string;
  /** Para qué sirve la respuesta. Un cuestionario que no lo dice se abandona. */
  why?: string;
  example?: string;
  priority?: string;
}

export interface Bloque { title: string; questions: Pregunta[] }
export interface Seccion { key: string; title: string; short: string; intro?: string; blocks: Bloque[] }

export interface Levantamiento {
  sesion: { id: string; estado: string; enviado_en: string | null;
            aplicado_en: string | null; actividad: string | null };
  plantilla: { nombre: string; descripcion: string | null; secciones: Seccion[] };
  respuestas: Record<string, string>;
  avance: { respondidas: number; total: number; pct: number };
}

export async function cargarLevantamiento(companyId: string): Promise<Levantamiento | null> {
  const { data, error } = await supabase.rpc('ci_levantamiento', { p_company: companyId });
  if (error) throw error;
  const d = data as Partial<Levantamiento> | null;
  return d && d.sesion ? (d as Levantamiento) : null;
}

export async function responder(companyId: string, pregunta: string, respuesta: string): Promise<void> {
  const { error } = await supabase.rpc('ci_responder', {
    p_company: companyId, p_pregunta: pregunta, p_respuesta: respuesta
  });
  if (error) throw error;
}

export async function cerrarLevantamiento(companyId: string): Promise<Levantamiento> {
  const { data, error } = await supabase.rpc('ci_cerrar_levantamiento', { p_company: companyId });
  if (error) throw error;
  return data as Levantamiento;
}

export type EstadoRequisito =
  'pendiente' | 'solicitado' | 'recibido' | 'en_revision' | 'observado' | 'aprobado' | 'no_aplica';

export interface Requisito {
  id: string;
  area: string;
  name: string;
  why: string | null;
  format: string | null;
  required: boolean;
  status: EstadoRequisito;
  priority: string;
  owner: string | null;
  due_date: string | null;
  link: string | null;
  comment: string | null;
  sort: number;
}

export async function listarRequisitos(companyId: string): Promise<Requisito[]> {
  const { data, error } = await supabase
    .from('ci_requirements')
    .select('id, area, name, why, format, required, status, priority, owner, due_date, link, comment, sort')
    .eq('company_id', companyId)
    .eq('purpose', 'puesta_en_marcha')
    .order('sort');
  if (error) throw error;
  return (data ?? []) as Requisito[];
}

/** Siembra la lista estándar. No hace nada si ya hay requisitos cargados:
 *  la lista se adapta, no se duplica. */
export async function sembrarRequisitos(companyId: string): Promise<number> {
  const { data, error } = await supabase.rpc('ci_sembrar_requisitos', { p_company: companyId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function actualizarRequisito(id: string, cambios: Partial<Requisito>): Promise<void> {
  const { error } = await supabase.from('ci_requirements').update(cambios).eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------- selectores

export interface ProyectoBreve {
  id: string; name: string; code: string | null; status: string;
  currency: string; portfolio_id: string | null;
}

export async function listarProyectos(companyId: string): Promise<ProyectoBreve[]> {
  const { data, error } = await supabase
    .from('ci_projects')
    .select('id, name, code, status, currency, portfolio_id')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as ProyectoBreve[];
}

export interface PortafolioBreve { id: string; name: string }

export async function listarPortafolios(companyId: string): Promise<PortafolioBreve[]> {
  const { data, error } = await supabase
    .from('ci_portfolios').select('id, name').eq('company_id', companyId).order('name');
  if (error) throw error;
  return (data ?? []) as PortafolioBreve[];
}

export interface ModeloBreve {
  id: string; version: number; label: string | null; state: string;
  scenario_id: string; escenario: string; tipo: string; is_default: boolean;
}

/** Todos los modelos de un proyecto, agrupables por escenario. El orden es el
 *  que se lee: primero el escenario por defecto, y dentro, la versión más
 *  nueva arriba. */
export async function listarModelos(projectId: string): Promise<ModeloBreve[]> {
  const { data, error } = await supabase
    .from('ci_models')
    .select('id, version, label, state, scenario_id, escenario:ci_scenarios(name, kind, is_default)')
    .eq('project_id', projectId)
    .order('version', { ascending: false });
  if (error) throw error;

  const filas = (data ?? []) as unknown as {
    id: string; version: number; label: string | null; state: string; scenario_id: string;
    escenario: { name: string; kind: string; is_default: boolean } | null;
  }[];

  return filas
    .map(f => ({
      id: f.id, version: f.version, label: f.label, state: f.state,
      scenario_id: f.scenario_id,
      escenario: f.escenario?.name ?? '—',
      tipo: f.escenario?.kind ?? 'personalizado',
      is_default: f.escenario?.is_default ?? false
    }))
    .sort((a, b) => Number(b.is_default) - Number(a.is_default)
                 || a.escenario.localeCompare(b.escenario)
                 || b.version - a.version);
}

/* Un filtro vacío es "no filtres", no "filtra por nada". Mandar las claves con
   cadena vacía haría que la base buscara proyectos cuyo país es "". */
function limpiar(f: Filtros): Record<string, string> {
  return Object.fromEntries(
    Object.entries(f).filter(([, v]) => v != null && v !== '')) as Record<string, string>;
}

/** Reexportado para que las pantallas de capital no tengan que importar de dos
 *  sitios lo que es una sola forma. */
export type { Cifra, ListaResumen, SerieResumen, Formato };
