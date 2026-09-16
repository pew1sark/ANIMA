import { supabase } from '@/lib/supabase';
import type { Indicador, Aviso } from '@/services/capital.service';
import type { ListaResumen, SerieResumen } from '@/services/resumen.service';

/* Real Estate Intelligence, del lado del navegador.

   Este archivo describe la FORMA de lo que devuelve la base y lo pide. No suma
   nada, igual que `capital.service`, y por el mismo motivo: el margen de un
   proyecto tiene que dar lo mismo en la hoja de prefactibilidad, en el panel y
   en el informe que se imprime para el comité, y la única forma de
   garantizarlo es que exista un solo lugar donde se calcule. Ese lugar es
   PostgreSQL.

   Los tipos `Indicador` y `Aviso` se importan de `capital.service` a
   propósito. No es pereza: la base devuelve LITERALMENTE el mismo objeto
   —`ci_indicador()` construye las cifras de los dos módulos— y declararlo dos
   veces habría creado dos verdades para una sola forma. */

export type { Indicador, Insumo, Aviso } from '@/services/capital.service';

// ------------------------------------------------------------------ panel

export interface FiltrosREI {
  municipio?: string;
  tipo?: string;
  canal?: string;
  /** Primer día del mes, en ISO. */
  desde?: string;
  hasta?: string;
}

export interface PanelREI {
  moneda: string;
  periodo: { desde: string; hasta: string };
  cifras: Indicador[];
  series: SerieResumen[];
  listas: ListaResumen[];
  alertas: Aviso[];
}

/** Devuelve null cuando el nivel no llega al módulo: la base responde `{}`
 *  en vez de fallar, y la pantalla lo dice con calma. */
export async function cargarPanel(companyId: string, filtros: FiltrosREI): Promise<PanelREI | null> {
  const { data, error } = await supabase.rpc('rei_resumen', {
    p_company: companyId, p_filtros: limpiar(filtros)
  });
  if (error) throw error;
  const d = data as Partial<PanelREI> | null;
  if (!d || !d.cifras) return null;
  return d as PanelREI;
}

/* El inventario y la demanda por municipio, para el mapa.
   ---------------------------------------------------------------------------
   Va aparte de `cargarPanel` a propósito. El panel es una llamada porque es
   una pantalla; el mapa es otra cosa —se dibuja o no según el país— y meterlo
   en `rei_resumen()` habría hecho que toda empresa pague el recuento por
   municipio para no usarlo. */
export interface MunicipioREI {
  municipio: string;
  inmuebles: number; disponibles: number; vendidos: number;
  compradores: number; compradores_activos: number;
}

export interface MapaREI {
  /** El departamento de la empresa. Desata homónimos: hay cuatro «La Unión». */
  departamento: string | null;
  municipios: MunicipioREI[];
  total_inmuebles: number;
  total_compradores: number;
}

export async function cargarMapa(companyId: string): Promise<MapaREI | null> {
  const { data, error } = await supabase.rpc('rei_mapa', { p_company: companyId });
  if (error) throw error;
  const d = data as Partial<MapaREI> | null;
  if (!d || !d.municipios) return null;
  return d as MapaREI;
}

/** Pone en marcha el módulo: supuestos, criterios y etapas de referencia.
 *  Es idempotente —completa lo que falte y no pisa lo ajustado—, así que se
 *  puede volver a llamar sin pensarlo. */
export async function ponerEnMarcha(companyId: string): Promise<{ supuestos: number; criterios: number; etapas: number }> {
  const { data, error } = await supabase.rpc('rei_sembrar_base', { p_company: companyId });
  if (error) throw error;
  return data as { supuestos: number; criterios: number; etapas: number };
}

/* Las opciones de los filtros salen de los datos que hay, no de un catálogo:
   ofrecer veinte municipios cuando la firma opera en tres es ruido. Se
   deduplican aquí porque PostgREST no expone `distinct` y, a esta escala
   —cientos de filas—, traer la columna y agrupar en memoria cuesta menos que
   una función en la base para cada lista. */
export interface OpcionesFiltro { municipios: string[]; tipos: string[]; canales: string[] }

export async function opcionesDeFiltro(companyId: string): Promise<OpcionesFiltro> {
  const [inmuebles, desarrollos] = await Promise.all([
    supabase.from('rei_properties').select('city, property_type, channel')
      .eq('company_id', companyId).is('deleted_at', null).limit(5000),
    supabase.from('rei_developments').select('municipality')
      .eq('company_id', companyId).is('deleted_at', null).limit(1000)
  ]);
  if (inmuebles.error) throw inmuebles.error;
  if (desarrollos.error) throw desarrollos.error;

  const filas = (inmuebles.data ?? []) as { city: string | null; property_type: string | null; channel: string | null }[];
  const munis = (desarrollos.data ?? []) as { municipality: string | null }[];

  return {
    municipios: unicos([...filas.map(f => f.city), ...munis.map(m => m.municipality)]),
    tipos:      unicos(filas.map(f => f.property_type)),
    canales:    unicos(filas.map(f => f.channel))
  };
}

// ------------------------------------------------------------ calificación

export interface CriterioMatriz {
  id: string; nombre: string; peso: number; mide: string | null;
  bajo: string | null; medio: string | null; alto: string | null; orden: number;
}

export interface CalificacionCelda { valor: number; nota: string | null }

export interface OportunidadMatriz {
  id: string; codigo: string | null; nombre: string;
  municipio: string | null; area_m2: number | null;
  precio: number | null; precio_m2: number | null; estado: string;
  calificaciones: Record<string, CalificacionCelda>;
  /** Lo que agrega `rei_score()` al mezclarse con la fila. */
  score: number | null; banda: string | null; decision: string | null;
  criterios_activos: number; criterios_calificados: number;
  peso_declarado: number; peso_cubierto: number; cubierto_pct: number | null;
}

export interface Matriz {
  criterios: CriterioMatriz[];
  peso_total: number;
  oportunidades: OportunidadMatriz[];
  alertas: Aviso[];
}

export async function cargarMatriz(companyId: string): Promise<Matriz | null> {
  const { data, error } = await supabase.rpc('rei_matriz_scoring', { p_company: companyId });
  if (error) throw error;
  const d = data as Partial<Matriz> | null;
  if (!d || !d.criterios) return null;
  return d as Matriz;
}

/** Guarda —o reemplaza— la calificación de un criterio sobre una
 *  oportunidad. El `unique (opportunity_id, criterion_id)` de la base hace que
 *  esto sea un upsert de verdad y no un «borra e inserta» que deja un hueco. */
export async function calificar(
  companyId: string, oportunidad: string, criterio: string, score: number, nota?: string | null
): Promise<void> {
  const { error } = await supabase.from('rei_opportunity_scores').upsert({
    company_id: companyId, opportunity_id: oportunidad,
    criterion_id: criterio, score, note: nota ?? null
  }, { onConflict: 'opportunity_id,criterion_id' });
  if (error) throw error;
}

/** Quitar una calificación no es ponerle cero: es decir «esto todavía no se
 *  miró», y la nota vuelve a calcularse sobre el peso que sí se cubrió. */
export async function descalificar(oportunidad: string, criterio: string): Promise<void> {
  const { error } = await supabase.from('rei_opportunity_scores')
    .delete().eq('opportunity_id', oportunidad).eq('criterion_id', criterio);
  if (error) throw error;
}

// --------------------------------------------------------- prefactibilidad

export interface DesarrolloBreve {
  id: string; name: string; code: string | null;
  municipality: string | null; product: string; units: number | null; status: string;
}

export async function listarDesarrollos(companyId: string): Promise<DesarrolloBreve[]> {
  const { data, error } = await supabase
    .from('rei_developments')
    .select('id, name, code, municipality, product, units, status')
    .eq('company_id', companyId).is('deleted_at', null).order('name');
  if (error) throw error;
  return (data ?? []) as DesarrolloBreve[];
}

export type EstadoModelo = 'borrador' | 'validado' | 'archivado';
export type PeriodoFlujo = 'mes' | 'trimestre' | 'semestre' | 'anio';

/** Los supuestos de un modelo, tal como se guardan. Un `null` en cualquiera de
 *  los porcentajes significa «usa el supuesto de la organización»: es un valor
 *  con significado, no un campo sin llenar. */
export interface ModeloREI {
  id: string; development_id: string; label: string | null; version: number;
  units: number | null; avg_area_m2: number | null; price_m2: number | null;
  product: string; land_cost: number;
  direct_cost_m2: number | null; indirect_pct: number | null;
  financial_pct: number | null; commercial_pct: number | null;
  discount_rate: number | null; equilibrium_pct: number | null;
  period_kind: PeriodoFlujo; state: EstadoModelo; notes: string | null;
}

export async function listarModelos(desarrollo: string): Promise<ModeloREI[]> {
  const { data, error } = await supabase
    .from('rei_feasibility')
    /* En una sola línea a propósito: el parser de tipos de supabase-js lee la
       lista de columnas del literal, y partirla con `+` la deja sin tipar. */
    .select('id, development_id, label, version, units, avg_area_m2, price_m2, product, land_cost, direct_cost_m2, indirect_pct, financial_pct, commercial_pct, discount_rate, equilibrium_pct, period_kind, state, notes')
    .eq('development_id', desarrollo).is('deleted_at', null)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ModeloREI[];
}

/** Crea la siguiente versión. El número no se pide: se deduce de lo que hay,
 *  porque dos personas eligiendo «versión 2» a la vez es exactamente lo que el
 *  `unique (development_id, version)` de la base va a rechazar. */
export async function crearModelo(
  companyId: string, desarrollo: string, base?: ModeloREI | null
): Promise<ModeloREI> {
  const existentes = await listarModelos(desarrollo);
  const version = (existentes[0]?.version ?? 0) + 1;
  const fila = {
    company_id: companyId, development_id: desarrollo, version,
    label: base ? `Copia de ${base.label ?? 'v' + base.version}` : 'Base',
    units: base?.units ?? null, avg_area_m2: base?.avg_area_m2 ?? null,
    price_m2: base?.price_m2 ?? null, product: base?.product ?? 'vis',
    land_cost: base?.land_cost ?? 0,
    direct_cost_m2: base?.direct_cost_m2 ?? null, indirect_pct: base?.indirect_pct ?? null,
    financial_pct: base?.financial_pct ?? null, commercial_pct: base?.commercial_pct ?? null,
    discount_rate: base?.discount_rate ?? null, equilibrium_pct: base?.equilibrium_pct ?? null,
    period_kind: base?.period_kind ?? 'trimestre', state: 'borrador' as const
  };
  const { data, error } = await supabase.from('rei_feasibility').insert(fila).select().single();
  if (error) throw error;
  return data as ModeloREI;
}

export async function guardarModelo(id: string, cambios: Partial<ModeloREI>): Promise<void> {
  const { error } = await supabase.from('rei_feasibility').update(cambios).eq('id', id);
  if (error) throw error;
}

export interface CifraPrefactibilidad extends Indicador { tono?: 'ok' | 'aviso' | 'malo' }

export interface PeriodoPrefactibilidad {
  periodo: number; egreso: number; ingreso: number; neto: number; nota: string | null;
}

export interface Prefactibilidad {
  modelo: {
    id: string; etiqueta: string | null; version: number; estado: EstadoModelo;
    producto: string; periodo: PeriodoFlujo; periodos_por_ano: number;
    desarrollo: string; desarrollo_id: string; moneda: string;
    unidades: number | null; area_unidad: number | null; precio_m2: number | null;
  };
  /** Los supuestos que de verdad entraron al cálculo: los del modelo si los
   *  pisa, los de la organización si no. Lo que se muestra es el resultado de
   *  esa resolución, no lo que está escrito en una de las dos partes. */
  supuestos: {
    costo_m2: number | null; indirectos_pct: number | null; financieros_pct: number | null;
    comerciales_pct: number | null; wacc: number | null; preventas_pct: number | null;
    tir_minima: number | null; margen_minimo: number | null; dscr_minimo: number | null;
  };
  cifras: CifraPrefactibilidad[];
  flujo: PeriodoPrefactibilidad[];
  veredicto: { texto: string; cumple: boolean | null };
  alertas: Aviso[];
}

export async function cargarPrefactibilidad(modelo: string): Promise<Prefactibilidad | null> {
  const { data, error } = await supabase.rpc('rei_prefactibilidad', { p_feasibility: modelo });
  if (error) throw error;
  const d = data as Partial<Prefactibilidad> | null;
  if (!d || !d.cifras) return null;
  return d as Prefactibilidad;
}

export async function guardarPeriodo(
  companyId: string, modelo: string, periodo: number, egreso: number, ingreso: number
): Promise<void> {
  const { error } = await supabase.from('rei_cashflow_periods').upsert({
    company_id: companyId, feasibility_id: modelo,
    period_no: periodo, outflow: egreso, inflow: ingreso
  }, { onConflict: 'feasibility_id,period_no' });
  if (error) throw error;
}

export async function borrarPeriodo(modelo: string, periodo: number): Promise<void> {
  const { error } = await supabase.from('rei_cashflow_periods')
    .delete().eq('feasibility_id', modelo).eq('period_no', periodo);
  if (error) throw error;
}

/** Siembra la curva S estándar. Devuelve 0 si el modelo ya tenía periodos: no
 *  pisa el trabajo de nadie, y la pantalla lo dice en vez de fingir que hizo
 *  algo. */
export async function sembrarCurva(modelo: string): Promise<number> {
  const { data, error } = await supabase.rpc('rei_sembrar_curva', { p_feasibility: modelo });
  if (error) throw error;
  return Number(data ?? 0);
}

// ------------------------------------------------------------------ utilidades

/* Un filtro vacío no es lo mismo que un filtro puesto en blanco: la base
   trata `''` como un valor y devolvería cero filas. Sirve a los dos paneles
   —el de mercado y el comercial— y por eso toma cualquier juego de claves. */
const limpiar = <T extends object>(f: T) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== ''));

const unicos = (xs: (string | null)[]) =>
  [...new Set(xs.map(x => (x ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

// ------------------------------------------------------------- brokerage

/* EL PANEL COMERCIAL
   ---------------------------------------------------------------------------
   La otra mitad del módulo: la operación del día, no el análisis de un predio.
   Mismo criterio que arriba —aquí no se suma nada— y por el mismo motivo: la
   comisión del mes tiene que dar lo mismo en el panel, en la lista de metas y
   en el informe que se lleva a la reunión del lunes.

   `embudo` va aparte de `listas` porque se dibuja distinto: es una escalera
   que se lee de un vistazo, no una tabla que se recorre. */

export interface FiltrosComercial {
  ciudad?: string;
  /** El uuid del responsable. Vacío = toda la oficina. */
  broker?: string;
  desde?: string;
  hasta?: string;
}

export interface PeldanoEmbudo { etapa: string; orden: number; cantidad: number }

export interface PanelComercial {
  moneda: string;
  periodo: { desde: string; hasta: string };
  cifras: Indicador[];
  embudo: PeldanoEmbudo[];
  series: SerieResumen[];
  listas: ListaResumen[];
  alertas: Aviso[];
}

/** Null cuando el nivel no llega al módulo: la base responde `{}` en vez de
 *  fallar, igual que `rei_resumen()`. */
export async function cargarComercial(
  companyId: string, filtros: FiltrosComercial
): Promise<PanelComercial | null> {
  const { data, error } = await supabase.rpc('rei_comercial', {
    p_company: companyId, p_filtros: limpiar(filtros)
  });
  if (error) {
    /* El bundle se publica desde el repositorio y las migraciones se aplican
       aparte: entre una cosa y la otra hay una ventana en la que la pantalla
       existe y la función todavía no. 42883 es «la función no existe» en
       PostgreSQL, y sin esto la pestaña muestra un error de base de datos en
       crudo a quien no puede hacer nada con él. Se dice qué falta y quién
       tiene que hacerlo. */
    if (error.code === '42883' || /rei_comercial/.test(error.message ?? '')) {
      throw new Error(
        'El panel comercial todavía no está disponible en esta base: falta aplicar ' +
        'las migraciones del módulo (0129 a 0131). El resto del módulo inmobiliario ' +
        'funciona con normalidad.');
    }
    throw error;
  }
  const d = data as Partial<PanelComercial> | null;
  if (!d || !d.cifras) return null;
  return d as PanelComercial;
}

export interface Corredor { id: string; nombre: string }

/* Quién puede ser responsable. Sale de `company_members`, no de un catálogo:
   con texto libre «Juan», «juan» y «J. Pérez» son tres corredores y ninguna
   meta se puede comparar contra ningún resultado. */
export async function corredores(companyId: string): Promise<Corredor[]> {
  const { data, error } = await supabase.rpc('rei_corredores', { p_company: companyId });
  if (error) throw error;
  return (data ?? []) as Corredor[];
}

/** Carga los cuatro umbrales del seguimiento comercial. Idempotente. */
export async function sembrarUmbrales(companyId: string): Promise<number> {
  const { data, error } = await supabase.rpc('rei_sembrar_umbrales', { p_company: companyId });
  if (error) throw error;
  return (data ?? 0) as number;
}

// ------------------------------------------------- §48 calidad de dato

/* EL DATA QUALITY ENGINE
   ---------------------------------------------------------------------------
   Dos cosas, y la segunda es la que sirve. El porcentaje por entidad dice si
   la cosa mejora; la lista de filas concretas es lo que se puede arreglar.
   `gravedad` 1 rompe cifras, 2 las distorsiona, 3 deja un hueco. */

export interface FaltaCampo { campo: string; n: number }

export interface EntidadCalidad {
  entidad: string; tabla: string; filas: number;
  completitud: number | null;
  faltantes: FaltaCampo[];
}

export interface FilaArreglar {
  gravedad: 1 | 2 | 3;
  entidad: string; tabla: string;
  codigo: string; nombre: string; ciudad: string;
  problema: string; efecto: string;
}

export interface Calidad {
  entidades: EntidadCalidad[];
  arreglar: FilaArreglar[];
  mediana_precio_m2: number;
  factor_atipico: number;
}

export async function cargarCalidad(companyId: string): Promise<Calidad | null> {
  const { data, error } = await supabase.rpc('rei_calidad', { p_company: companyId });
  if (error) throw error;
  const d = data as Partial<Calidad> | null;
  if (!d || !d.entidades) return null;
  return d as Calidad;
}

// ------------------------------------------------------- §14 por ciudad

export interface FilaCiudad {
  ciudad: string;
  inventario: number; disponibles: number; captaciones: number; cierres: number;
  comision: number; dias_mercado: number | null;
  precio_m2: number | null; canon_m2: number | null;
  leads: number; visitas: number; pipeline: number; oportunidades: number;
}

export interface Ciudades {
  moneda: string;
  periodo: { desde: string; hasta: string };
  ciudades: FilaCiudad[];
}

export async function cargarCiudades(
  companyId: string, rango: { desde?: string; hasta?: string } = {}
): Promise<Ciudades | null> {
  const { data, error } = await supabase.rpc('rei_ciudades', {
    p_company: companyId, p_filtros: limpiar(rango)
  });
  if (error) throw error;
  const d = data as Partial<Ciudades> | null;
  if (!d || !d.ciudades) return null;
  return d as Ciudades;
}

// ----------------------------------------------------- §46 búsqueda global

export interface Hallazgo { id: string; titulo: string; detalle: string | null }
export interface GrupoBusqueda { entidad: string; total: number; resultados: Hallazgo[] }

export async function buscar(companyId: string, texto: string): Promise<GrupoBusqueda[]> {
  const { data, error } = await supabase.rpc('rei_buscar', {
    p_company: companyId, p_texto: texto
  });
  if (error) throw error;
  return (data ?? []) as GrupoBusqueda[];
}

// ------------------------------------------------------- §21 drill-down

export interface FilaRegistro {
  codigo: string; nombre: string; etapa: string; ciudad: string;
  contacto: string; responsable: string; cuando: string | null;
  monto?: number | null;
}

export interface Registros {
  clave: string;
  titulo: string | null;
  filas: FilaRegistro[];
  nota?: string;
}

/* Los registros detrás de una cifra. Recibe la MISMA clave y los MISMOS
   filtros que `rei_comercial()`: es lo que garantiza que el detalle sume
   exactamente el número que se abrió. */
export async function cargarRegistros(
  companyId: string, clave: string, filtros: FiltrosComercial
): Promise<Registros> {
  const { data, error } = await supabase.rpc('rei_registros', {
    p_company: companyId, p_clave: clave, p_filtros: limpiar(filtros)
  });
  if (error) throw error;
  return (data ?? { clave, titulo: null, filas: [] }) as Registros;
}

// --------------------------------------------------- §11 informe semanal

export interface PersonaSemanal {
  persona: string; meta: number | null; resultado: number;
  cumplimiento: number | null; pipeline: number;
  actividad: number; conversion: number | null; pendientes: number;
}

export interface InformeSemanal {
  moneda: string;
  semana: { desde: string; hasta: string; mes_desde: string; mes_hasta: string };
  resumen: {
    cierres_semana: number; comision_semana: number;
    cierres_mes: number; comision_mes: number;
    meta_mes: number | null; brecha: number | null;
    riesgos: string[]; victorias: string[];
  };
  revenue: {
    meta: number | null; real: number; cumplimiento: number | null;
    proyeccion: number; pipeline_ponderado: number; brecha: number | null;
  };
  equipo: PersonaSemanal[];
  brokerage: {
    captaciones: number; leads: number; visitas: number; ofertas: number;
    cierres: number; comision_esperada: number; comision_realizada: number;
  };
  operaciones: {
    contratos_vigentes: number; vencen_30_dias: number;
    tareas_pendientes: number; tareas_vencidas: number; registros_incompletos: number;
  };
  desarrollo: {
    oportunidades_nuevas: number; en_screening: number;
    factibilidades_activas: number; aprobadas: number;
  };
  /** Lo que el informe NO pudo calcular, y por qué. */
  notas: string[];
}

export async function cargarSemanal(
  companyId: string, semana?: string
): Promise<InformeSemanal | null> {
  const { data, error } = await supabase.rpc('rei_informe_semanal', {
    p_company: companyId, p_semana: semana ?? null
  });
  if (error) throw error;
  const d = data as Partial<InformeSemanal> | null;
  if (!d || !d.revenue) return null;
  return d as InformeSemanal;
}

// ------------------------------------------------------ §16 cliente 360

export interface Cliente360 {
  identidad: {
    id: string; nombre: string; tipo: string; estado: string;
    telefono: string | null; whatsapp: string | null; email: string | null;
    ciudad: string | null; direccion: string | null; razon_social: string | null;
    contacto: string | null; notas: string | null; desde: string;
  };
  origen: { canal: string | null; campana: string | null; entrada: string;
            primera_interaccion: string | null; operacion: string } | null;
  necesidad: { busca: string | null; zona: string | null; presupuesto: number | null;
               forma_pago: string | null; subsidio: string | null;
               proceso: string | null; estado: string | null } | null;
  cifras: {
    inmuebles: number; negociaciones: number; ganadas: number;
    comision_generada: number; visitas: number; contratos_vigentes: number;
  };
  inmuebles: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  negociaciones: Record<string, unknown>[];
  contratos: Record<string, unknown>[];
  visitas: Record<string, unknown>[];
  actividad: Record<string, unknown>[];
}

export async function cargarCliente360(customerId: string): Promise<Cliente360 | null> {
  const { data, error } = await supabase.rpc('rei_cliente_360', { p_customer: customerId });
  if (error) throw error;
  const d = data as Partial<Cliente360> | null;
  if (!d || !d.identidad) return null;
  return d as Cliente360;
}
