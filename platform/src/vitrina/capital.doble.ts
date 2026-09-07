/* El doble de `capital.service`, para la vitrina.
   ---------------------------------------------------------------------------
   Mismas funciones, mismas formas, datos inventados y ninguna red. Sirve para
   trabajar el diseño sin iniciar sesión y sin tocar datos de nadie.

   Los tipos se importan del servicio de verdad con `import type`, que TypeScript
   borra al compilar: no hay ciclo ni se arrastra Supabase hasta aquí. */

import type {
  Panel, Filtros, Indicador, Aviso, ModeloCalculado, ModeloBreve, ProyectoBreve,
  PortafolioBreve, Presupuesto, Levantamiento, Requisito, Ronda, RondaBreve, Dilucion
} from '../services/capital.service';

export type * from '../services/capital.service';

const espera = <T,>(v: T, ms = 120): Promise<T> =>
  new Promise(r => setTimeout(() => r(v), ms));

const ind = (clave: string, etiqueta: string, valor: number | null, formato: string,
             formula: string, insumos: [string, number | null, string][],
             extra: Partial<Indicador> = {}): Indicador => ({
  clave, etiqueta, valor, formato: formato as Indicador['formato'], formula,
  insumos: insumos.map(([e, v, f]) => ({ etiqueta: e, valor: v, formato: f as never })),
  ...extra
});

// ------------------------------------------------------------------ panel

const CIFRAS: Indicador[] = [
  ind('capital_solicitado', 'Capital solicitado', 1269200, 'dinero',
    'Suma de «capital requerido» de los proyectos del filtro, convertido a USD',
    [['Proyectos en el filtro', 4, 'numero']]),
  ind('capital_comprometido', 'Capital comprometido', 831400, 'dinero',
    'Suma de «capital captado» de los mismos proyectos',
    [['Capital solicitado', 1269200, 'dinero']], { nota: '66% del objetivo' }),
  ind('capital_pendiente', 'Capital pendiente', 437800, 'dinero',
    'Capital solicitado − capital comprometido',
    [['Solicitado', 1269200, 'dinero'], ['Comprometido', 831400, 'dinero']], { tono: 'aviso' }),
  ind('capital_utilizado', 'Capital utilizado', 195500, 'dinero',
    'Suma de lo PAGADO en movimientos reales de naturaleza Inversión',
    [['Comprometido', 831400, 'dinero']]),
  ind('capital_disponible', 'Capital disponible', 635900, 'dinero',
    'Capital comprometido − capital utilizado',
    [['Comprometido', 831400, 'dinero'], ['Utilizado', 195500, 'dinero']]),
  ind('ingresos_proyectados', 'Ingresos proyectados', 1181446, 'dinero',
    'Celdas de ingreso del modelo vigente de cada proyecto, hasta el mes en curso',
    [['Proyectos sin modelo', 0, 'numero']], { nota: 'hasta el mes en curso' }),
  ind('ingresos_reales', 'Ingresos reales', 678889, 'dinero',
    'Movimientos reales de naturaleza Ingreso, hasta el mes en curso',
    [['Proyectado en el mismo tramo', 1181446, 'dinero']], { nota: '57% de lo proyectado' }),
  ind('ebitda_real', 'EBITDA real', 474843, 'dinero',
    'Ingresos reales − costos directos reales − gastos operativos reales',
    [['Ingresos reales', 678889, 'dinero'], ['Costos y gastos reales', 204046, 'dinero']]),
  ind('margen_ebitda', 'Margen EBITDA', 69.9, 'porcentaje',
    'EBITDA real ÷ ingresos reales × 100',
    [['EBITDA real', 474843, 'dinero'], ['Ingresos reales', 678889, 'dinero']]),
  ind('desviacion', 'Desviación presupuestaria', -55.9, 'porcentaje',
    '(real − presupuesto vigente) ÷ presupuesto vigente × 100, solo sobre meses ya cerrados',
    [['Real', 812340, 'dinero'], ['Presupuesto vigente', 1842100, 'dinero'],
     ['Umbral de aviso', 8, 'porcentaje'], ['Umbral crítico', 15, 'porcentaje']],
    { tono: 'malo', nota: 'real contra presupuesto vigente' }),
  ind('proyectos_activos', 'Proyectos activos', 4, 'numero',
    'Proyectos del filtro que no están en borrador, pausado, cerrado ni rechazado',
    [['Proyectos en el filtro', 4, 'numero']]),
  ind('proyectos_riesgo', 'Proyectos en riesgo', 2, 'numero',
    'Proyectos con riesgo declarado Alto o en estado Pausado',
    [['Proyectos activos', 4, 'numero']], { tono: 'malo' })
];

const meses12 = (base: number, paso: number) =>
  Array.from({ length: 24 }, (_, i) => {
    const d = new Date(2026, 0 + i, 1);
    return { x: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
             y: Math.round(base * Math.pow(1 + paso, i)),
             y2: i < 8 ? Math.round(base * 0.92 * Math.pow(1 + paso * 0.9, i)) : 0,
             formato_x: 'mes' as const };
  });

export async function cargarPanel(_c: string, f: Filtros): Promise<Panel | null> {
  return espera({
    moneda: 'USD',
    periodo: { desde: (f.desde ?? '2025-10-01').slice(0, 7), hasta: (f.hasta ?? '2027-09-01').slice(0, 7) },
    umbrales: { aviso: 8, critico: 15 },
    cifras: CIFRAS,
    series: [{
      titulo: 'Ingresos: proyectado contra real',
      nota: 'El presupuesto del modelo vigente de cada proyecto, contra lo que se cargó como ejecución.',
      formato: 'dinero', leyenda: ['Proyectado', 'Real'], puntos: meses12(22050, 0.035)
    }],
    listas: [
      { titulo: 'Proyectos', nota: 'De aquí salen las cifras de capital de arriba.',
        columnas: [
          { k: 'proyecto', t: 'Proyecto' }, { k: 'estado', t: 'Estado' }, { k: 'moneda', t: 'Moneda' },
          { k: 'solicitado', t: 'Solicitado', formato: 'dinero' },
          { k: 'captado', t: 'Captado', formato: 'dinero' },
          { k: 'avance', t: '% captado', formato: 'porcentaje' }, { k: 'riesgo', t: 'Riesgo' }],
        filas: [
          { proyecto: '[DEMO] Plataforma multiconcepto', estado: 'ejecucion', moneda: 'COP',
            solicitado: 300000, captado: 100000, avance: 33.3, riesgo: 'medio' },
          { proyecto: '[DEMO] Ronda serie semilla', estado: 'comprometido_parcial', moneda: 'USD',
            solicitado: 500000, captado: 325000, avance: 65, riesgo: 'alto' },
          { proyecto: '[DEMO] Proyecto con inconsistencias', estado: 'evaluacion', moneda: 'USD',
            solicitado: 300000, captado: 350000, avance: 116.7, riesgo: 'alto' },
          { proyecto: '[DEMO] Club de membresía', estado: 'en_levantamiento', moneda: 'USD',
            solicitado: 180000, captado: 60000, avance: 33.3, riesgo: 'medio' }] },
      { titulo: 'Próximos hitos', nota: 'Lo que viene en los siguientes 90 días.',
        columnas: [{ k: 'hito', t: 'Hito' }, { k: 'proyecto', t: 'Proyecto' },
                   { k: 'fecha', t: 'Fecha', formato: 'fecha' },
                   { k: 'monto', t: 'Capital que libera', formato: 'dinero' }],
        filas: [
          { hito: 'Primer evento privado', proyecto: '[DEMO] Plataforma multiconcepto',
            fecha: '2026-09-15', monto: 35000 },
          { hito: 'Primer cierre (60%)', proyecto: '[DEMO] Ronda serie semilla',
            fecha: '2026-10-15', monto: 300000 },
          { hito: 'Cierre de la ronda', proyecto: '[DEMO] Club de membresía',
            fecha: '2026-11-01', monto: 120000 }] }],
    alertas: [
      { clave: 'desviacion_critica', nivel: 'bloqueante',
        titulo: 'Desviación presupuestaria de -55.9%',
        detalle: 'La ejecución real se separó del presupuesto vigente más allá del umbral crítico de la organización (15%).' },
      { clave: 'sin_modelo', nivel: 'aviso', titulo: '1 proyecto(s) sin modelo financiero',
        detalle: 'Aparecen en el capital pero no en las proyecciones: no tienen ni un escenario con líneas.' }]
  } as Panel);
}

export const listarPortafolios = async (): Promise<PortafolioBreve[]> =>
  espera([{ id: 'p1', name: '[DEMO] Plataforma gastronómica' }]);

export const listarProyectos = async (): Promise<ProyectoBreve[]> => espera([
  { id: 'a', name: '[DEMO] Club de membresía', code: 'PRY-2026-000001',
    status: 'en_levantamiento', currency: 'USD', portfolio_id: 'p1' },
  { id: 'b', name: '[DEMO] Plataforma multiconcepto', code: 'PRY-2026-000002',
    status: 'ejecucion', currency: 'COP', portfolio_id: 'p1' },
  { id: 'c', name: '[DEMO] Ronda serie semilla', code: 'PRY-2026-000003',
    status: 'comprometido_parcial', currency: 'USD', portfolio_id: 'p1' },
  { id: 'd', name: '[DEMO] Proyecto con inconsistencias', code: 'PRY-2026-000004',
    status: 'evaluacion', currency: 'USD', portfolio_id: 'p1' }
]);

// -------------------------------------------------------- modelo financiero

export const listarModelos = async (): Promise<ModeloBreve[]> => espera([
  { id: 'm1', version: 2, label: 'Versión de trabajo', state: 'borrador',
    scenario_id: 's1', escenario: 'Base', tipo: 'base', is_default: true },
  { id: 'm0', version: 1, label: 'Modelo aprobado en comité', state: 'validado',
    scenario_id: 's1', escenario: 'Base', tipo: 'base', is_default: true },
  { id: 'm2', version: 1, label: null, state: 'borrador',
    scenario_id: 's2', escenario: 'Conservador', tipo: 'conservador', is_default: false },
  { id: 'm3', version: 1, label: null, state: 'borrador',
    scenario_id: 's3', escenario: 'Optimista', tipo: 'optimista', is_default: false }
]);

const LINEAS: [string, string, string, string, number][] = [
  ['ingreso', 'membresias', 'Cuotas de membresía', 'Membresía', 22050],
  ['costo_directo', 'servicio', 'Costo del beneficio por miembro', 'Membresía', 4950],
  ['costo_directo', 'pasarela', 'Comisión de la pasarela de pago', 'Membresía', 706],
  ['gasto_operativo', 'personal', 'Equipo de la membresía', 'Membresía', 9000],
  ['gasto_operativo', 'tecnologia', 'Plataforma y tecnología', 'Membresía', 1800],
  ['gasto_operativo', 'marketing', 'Adquisición de miembros (CAC)', 'Membresía', 1216],
  ['depreciacion', 'depreciacion', 'Depreciación de la plataforma', 'Membresía', 900],
  ['inversion', 'tecnologia', 'Desarrollo de la plataforma', 'Membresía', 60000],
  ['inversion', 'marca', 'Marca y lanzamiento', 'Membresía', 25000]
];

export async function cargarModelo(id: string): Promise<ModeloCalculado | null> {
  const n = 36;
  const clave = (i: number) => {
    const d = new Date(2026, i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const lineas = LINEAS.map(([kind, category, name, unidad, base], k) => {
    const unica = kind === 'inversion';
    const crece = kind === 'ingreso' || category === 'servicio' || category === 'marketing';
    const meses: Record<string, { monto: number; cantidad: number | null; precio: number | null; origen: 'formula' | 'manual' }> = {};
    for (let i = 0; i < n; i++) {
      if (unica && i > 0) continue;
      if (category === 'depreciacion' && i < 6) continue;
      const monto = Math.round(base * (crece ? Math.pow(1.035, i) : 1));
      meses[clave(i)] = { monto, cantidad: kind === 'ingreso' ? Math.round(450 * Math.pow(1.035, i)) : null,
                          precio: kind === 'ingreso' ? 49 : null,
                          origen: (k === 3 && i === 4) ? 'manual' : 'formula' };
    }
    return { id: `l${k}`, kind, category, name, unidad, unidad_id: 'u1',
             driver: kind === 'ingreso' ? 'cantidad_precio' : 'monto',
             quantity: kind === 'ingreso' ? 450 : null, unit_price: kind === 'ingreso' ? 49 : null,
             amount: kind === 'ingreso' ? null : base, pct: null,
             growth_pct: crece ? 3.5 : 0, frequency: unica ? 'unica' : 'mensual',
             sort: k * 10, total: Object.values(meses).reduce((s, c) => s + c.monto, 0), meses };
  }) as ModeloCalculado['lineas'];

  const suma = (i: number, kind: string) =>
    lineas.filter(l => l.kind === kind).reduce((s, l) => s + (l.meses[clave(i)]?.monto ?? 0), 0);

  let caja = 60000;
  const mesesCalc = Array.from({ length: n }, (_, i) => {
    const ingresos = suma(i, 'ingreso'), cogs = suma(i, 'costo_directo');
    const opex = suma(i, 'gasto_operativo'), dep = suma(i, 'depreciacion'), capex = suma(i, 'inversion');
    const ebitda = ingresos - cogs - opex, ebit = ebitda - dep;
    const impuesto = Math.max(ebit, 0) * 0.3, fcl = ebitda - impuesto - capex;
    caja += fcl;
    return { periodo: clave(i), ingresos, cogs, margen_bruto: ingresos - cogs,
             margen_pct: ingresos ? +((ingresos - cogs) / ingresos * 100).toFixed(1) : null,
             opex, ebitda, ebitda_pct: ingresos ? +(ebitda / ingresos * 100).toFixed(1) : null,
             depreciacion: dep, ebit, impuesto: Math.round(impuesto), capex,
             fco: Math.round(ebitda - impuesto), fcl: Math.round(fcl), caja_acumulada: Math.round(caja) };
  });

  const validado = id === 'm0';
  return espera({
    modelo: { id, version: validado ? 1 : 2, label: validado ? 'Modelo aprobado en comité' : 'Versión de trabajo',
              estado: validado ? 'validado' : 'borrador', moneda: 'USD', inicio: '2026-01',
              meses: n, saldo_inicial: 60000, tasa_descuento: 18, tasa_impuesto: 30,
              validado_en: validado ? '2026-09-04T18:00:00Z' : null, creado_en: '2026-09-04T12:00:00Z' },
    proyecto: { id: 'a', nombre: '[DEMO] Club de membresía', codigo: 'PRY-2026-000001',
                moneda: 'USD', estado: 'en_levantamiento' },
    escenario: { id: 's1', nombre: 'Base', tipo: 'base', supuestos: {
      precio_mensual: 49, miembros_iniciales: 450, alta_mensual_pct: 7, churn_mensual_pct: 3.5,
      crecimiento_neto_pct: 3.5, cac: 38, retencion_meses: 28.6, ltv: 1092,
      margen_contribucion_por_miembro: 36.4 } },
    meses: mesesCalc,
    lineas,
    indicadores: [
      ind('ingresos', 'Ingresos proyectados', 1543668, 'dinero',
        'Suma de todas las líneas de tipo Ingreso en el horizonte',
        [['Meses del horizonte', 36, 'numero'], ['Líneas de ingreso', 1, 'numero']]),
      ind('cogs', 'Costo de ventas', 395262, 'dinero', 'Suma de las líneas de tipo Costo directo',
        [['Líneas de costo directo', 2, 'numero']]),
      ind('margen_bruto', 'Margen bruto', 1148406, 'dinero', 'Ingresos − Costo de ventas',
        [['Ingresos', 1543668, 'dinero'], ['Costo de ventas', 395262, 'dinero']]),
      ind('margen_pct', 'Margen bruto %', 74.4, 'porcentaje', 'Margen bruto ÷ Ingresos × 100',
        [['Margen bruto', 1148406, 'dinero'], ['Ingresos', 1543668, 'dinero']]),
      ind('ebitda', 'EBITDA', 643778, 'dinero', 'Ingresos − Costo de ventas − Gastos operativos',
        [['Ingresos', 1543668, 'dinero'], ['Costo de ventas', 395262, 'dinero'],
         ['Gastos operativos', 504628, 'dinero']]),
      ind('ebitda_pct', 'Margen EBITDA', 41.7, 'porcentaje', 'EBITDA ÷ Ingresos × 100',
        [['EBITDA', 643778, 'dinero'], ['Ingresos', 1543668, 'dinero']]),
      ind('ebit', 'EBIT', 616778, 'dinero', 'EBITDA − Depreciación',
        [['EBITDA', 643778, 'dinero'], ['Depreciación', 27000, 'dinero']]),
      ind('capex', 'Inversión (CAPEX)', 85000, 'dinero', 'Suma de las líneas de tipo Inversión',
        [['Líneas de inversión', 2, 'numero']]),
      ind('necesidad_capital', 'Necesidad acumulada de capital', 21935, 'dinero',
        'El punto más bajo de la caja acumulada, en negativo. Es lo que hay que poner para no quebrar por el camino',
        [['Saldo inicial declarado', 60000, 'dinero'], ['Caja acumulada mínima', -21935, 'dinero']]),
      ind('burn_rate', 'Burn rate mensual', 81935, 'dinero',
        'Promedio de la salida neta de caja en los meses en que el flujo libre es negativo',
        [['Caja consumida', 81935, 'dinero'], ['Meses con flujo negativo', 1, 'numero']]),
      ind('runway', 'Runway', 0, 'meses',
        'Meses hasta que la caja acumulada se vuelve negativa. Si nunca ocurre, el proyecto se sostiene solo',
        [['Saldo inicial declarado', 60000, 'dinero'], ['Primer mes en rojo', 1, 'numero']]),
      ind('punto_equilibrio', 'Punto de equilibrio', 1, 'meses',
        'Primer mes con EBITDA no negativo e ingresos mayores que cero', [['Mes', 1, 'numero']]),
      ind('payback', 'Payback', 15, 'meses',
        'Primer mes en que el flujo de caja libre acumulado deja de ser negativo',
        [['Inversión total', 106935, 'dinero']]),
      ind('roi', 'ROI proyectado', 522.5, 'porcentaje',
        '(EBITDA acumulado − CAPEX) ÷ Inversión total × 100',
        [['EBITDA acumulado', 643778, 'dinero'], ['CAPEX', 85000, 'dinero'],
         ['Inversión total', 106935, 'dinero']]),
      ind('van', 'VAN / NPV', 251181, 'dinero',
        'Σ flujo libre del mes ÷ (1 + tasa mensual)^mes. La tasa anual se mensualiza con (1+r)^(1/12)−1',
        [['Tasa de descuento anual', 18, 'porcentaje'], ['Tasa mensual equivalente', 1.3888, 'porcentaje'],
         ['Meses', 36, 'numero']]),
      ind('tir', 'TIR / IRR', 191.24, 'porcentaje',
        'Tasa que hace VAN = 0, calculada mensual por bisección y anualizada con (1+i)^12−1',
        [['TIR mensual', 9.3, 'porcentaje'], ['Flujos considerados', 36, 'numero']])
    ]
  } as ModeloCalculado);
}

const AVISOS_ROTO: Aviso[] = [
  { clave: 'sin_saldo_inicial', nivel: 'bloqueante', titulo: 'Falta el saldo inicial de caja',
    detalle: 'Sin saldo de apertura, el flujo acumulado empieza en cero y la necesidad de capital sale mal. Declara con cuánto parte el proyecto, aunque sea 0.' },
  { clave: 'precio_inconsistente', nivel: 'bloqueante', titulo: 'Dos precios distintos para «Menú ejecutivo»',
    detalle: 'La misma fuente de ingreso aparece con 2 precios diferentes en el mismo modelo. Uno de los dos está mal.' },
  { clave: 'sin_gastos_operativos', nivel: 'bloqueante', titulo: 'La proyección no tiene gastos operativos',
    detalle: 'Sin personal, arriendo ni administración, el EBITDA que muestra esta proyección es en realidad el margen bruto. Son cosas distintas.' },
  { clave: 'capex_sin_depreciacion', nivel: 'aviso', titulo: 'Hay inversión y no hay depreciación',
    detalle: 'Con CAPEX pero sin depreciación, el EBIT es igual al EBITDA y el resultado del proyecto se ve mejor de lo que es.' },
  { clave: 'escenario_sin_supuestos', nivel: 'aviso', titulo: 'El escenario no declara sus supuestos',
    detalle: 'Un escenario sin supuestos escritos no se puede comparar con otro ni defender ante un tercero.' }
];

export const validarModelo = async (id: string): Promise<Aviso[]> =>
  espera(id === 'm2' ? AVISOS_ROTO : []);
export const marcarValidado = async () => espera({ validado: false, bloqueantes: 3, avisos: AVISOS_ROTO });
export const nuevaVersion = async () => espera('m9');
export const regenerar = async () => espera(324);

// ------------------------------------------------ presupuesto contra real

export async function cargarPresupuesto(): Promise<Presupuesto | null> {
  const cats: [string, string, number, number, number][] = [
    ['ingreso', 'membresias', 872100, 691200, 0],
    ['costo_directo', 'servicio', 196400, 168900, 168900],
    ['costo_directo', 'pasarela', 27900, 22100, 22100],
    ['gasto_operativo', 'personal', 324000, 300800, 300800],
    ['gasto_operativo', 'tecnologia', 64800, 64800, 64800],
    ['gasto_operativo', 'marketing', 48600, 61300, 61300],
    ['depreciacion', 'depreciacion', 27000, 0, 0],
    ['inversion', 'tecnologia', 60000, 60000, 46000],
    ['inversion', 'marca', 25000, 27400, 27400]
  ];
  const filas = cats.map(([kind, categoria, vigente, real, pagado]) => {
    const dif = real - vigente;
    const desv = vigente ? Math.abs(dif) / Math.abs(vigente) * 100 : 0;
    return { kind, categoria, original: vigente, vigente, comprometido: pagado, pagado, real,
             diferencia: dif, pct_ejecutado: vigente ? +(real / vigente * 100).toFixed(1) : null,
             proyeccion_cierre: real + vigente * 0.4,
             semaforo: vigente === 0 && real === 0 ? 'neutro'
                     : desv >= 15 ? 'malo' : desv >= 8 ? 'aviso' : 'ok' };
  }) as Presupuesto['filas'];

  const t = (k: keyof Presupuesto['filas'][number]) =>
    filas.reduce((s, f) => s + (Number(f[k]) || 0), 0);

  return espera({
    modelo: { id: 'm1', version: 2, label: 'Versión de trabajo', estado: 'borrador', moneda: 'USD' },
    original_id: 'm0', umbrales: { aviso: 8, critico: 15 },
    desde: '2026-01', hasta: '2026-08',
    filas,
    meses: Array.from({ length: 8 }, (_, i) => ({
      periodo: `2026-${String(i + 1).padStart(2, '0')}`,
      vigente: Math.round(46000 * Math.pow(1.02, i)),
      real: Math.round(43000 * Math.pow(1.018, i)) })),
    totales: { original: t('original'), vigente: t('vigente'), comprometido: t('comprometido'),
               pagado: t('pagado'), real: t('real'), diferencia: t('diferencia') }
  } as Presupuesto);
}

// ------------------------------------------------------------ levantamiento

const SECCIONES = [
  { key: 'A', short: 'A. La firma', title: 'A · LA FIRMA Y SU ALCANCE',
    intro: 'Configura la organización, la moneda de consolidación y quién entra a la plataforma.',
    blocks: [{ title: 'Identidad y alcance', questions: [
      { id: 'A1', q: 'Razón social y el nombre con el que trabajas',
        why: 'Encabeza los informes y da nombre a la organización',
        example: 'Asesorías Andrés SAS / AC Capital', priority: 'bloqueante' },
      { id: 'A2', q: '¿Administras proyectos propios o de tus clientes?',
        why: 'Define si la organización es operadora o asesora, y cómo se aíslan los datos',
        example: 'De clientes: cada uno con sus proyectos', priority: 'bloqueante' },
      { id: 'A3', q: 'Países donde están los proyectos',
        why: 'Alimenta el filtro por país del panel', example: 'Colombia, Costa Rica, Chile', priority: 'bloqueante' }] },
      { title: 'Quién entra', questions: [
      { id: 'A6', q: 'Personas que van a usar la plataforma: nombre, correo y qué debería poder hacer cada una',
        why: 'De aquí salen las invitaciones y los roles',
        example: 'Andrés (todo) · analista (carga datos) · socio (solo mira)', priority: 'bloqueante' }] }] },
  { key: 'C', short: 'C. Modelo', title: 'C · EL MODELO FINANCIERO',
    intro: 'Cómo construyes hoy una proyección. Esto define cómo se traduce a la matriz mensual.',
    blocks: [{ title: 'Parámetros', questions: [
      { id: 'C7', q: '¿Declaras el saldo inicial de caja de cada proyecto?',
        why: 'Sin él la necesidad de capital sale mal y el modelo no se puede validar',
        example: 'Sí, lo que queda del primer tramo', priority: 'bloqueante' },
      { id: 'C8', q: 'Tasa de descuento que usas para el VAN y por qué esa',
        why: 'Sin tasa no hay VAN, y una valoración sin VAN detrás no tiene metodología',
        example: '18% anual, costo de capital del fondo', priority: 'bloqueante' },
      { id: 'C10', q: '¿Modelas depreciación? ¿cómo?',
        why: 'Con CAPEX y sin depreciación, el EBIT es igual al EBITDA y el proyecto se ve mejor de lo que es',
        example: 'Lineal a 5 años', priority: 'media' }] }] },
  { key: 'H', short: 'H. La prueba', title: 'H · CÓMO SERÁ LA PRUEBA',
    intro: 'Qué tiene que pasar para que esto valga la pena.',
    blocks: [{ title: 'Alcance y éxito', questions: [
      { id: 'H1', q: '¿Con qué proyecto quieres empezar y por qué ese?',
        why: 'El primero define el orden de la migración',
        example: 'El de la ronda abierta: es el que estoy mostrando', priority: 'bloqueante' },
      { id: 'H2', q: '¿Qué tendría que pasar en cuatro semanas para que digas que funcionó?',
        why: 'Es el criterio con el que se evalúa la prueba',
        example: 'Armar un escenario nuevo en una hora en vez de un día', priority: 'alta' }] }] }
];

let RESP: Record<string, string> = { A1: 'AC Capital SAS', A2: 'De clientes', C8: '18% anual' };

export async function cargarLevantamiento(): Promise<Levantamiento | null> {
  const total = SECCIONES.reduce((s, x) => s + x.blocks.reduce((n, b) => n + b.questions.length, 0), 0);
  const respondidas = Object.values(RESP).filter(v => v.trim()).length;
  return espera({
    sesion: { id: 's', estado: 'abierta', enviado_en: null, aplicado_en: null, actividad: null },
    plantilla: { nombre: 'Levantamiento · Capital Intelligence',
                 descripcion: null, secciones: SECCIONES },
    respuestas: { ...RESP },
    avance: { respondidas, total, pct: Math.round(respondidas / total * 100) }
  } as unknown as Levantamiento);
}

export async function responder(_c: string, id: string, v: string) { RESP = { ...RESP, [id]: v }; }
export async function cerrarLevantamiento(): Promise<Levantamiento> {
  return (await cargarLevantamiento())!;
}

let REQS: Requisito[] = [
  ['organizacion', 'Listado de personas que van a entrar, con rol y correo', 'Sin esto no hay a quién invitar ni qué permisos darle. El rol decide qué ve cada uno.', 'Planilla o correo', true, 'aprobado'],
  ['organizacion', 'Estructura de portafolios y proyectos', 'Cómo agrupas hoy lo que administras. Define la jerarquía que verás en el panel.', 'Planilla o esquema', true, 'recibido'],
  ['organizacion', 'Catálogo de categorías de costo y gasto que usas', 'Es lo que hace que el presupuesto y la ejecución real se puedan comparar.', 'Planilla', true, 'pendiente'],
  ['financiera', 'Modelo financiero en Excel de cada proyecto, con las fórmulas a la vista', 'Es la fuente de la que sale la matriz mensual. Las fórmulas importan.', 'XLSX', true, 'en_revision'],
  ['financiera', 'Presupuesto original aprobado de cada proyecto', 'Es la versión 1 contra la que se mide todo lo demás.', 'XLSX o PDF', true, 'solicitado'],
  ['financiera', 'Flujo de caja con el SALDO INICIAL declarado', 'Sin saldo de apertura la necesidad de capital sale mal y el modelo no se puede validar.', 'XLSX', true, 'pendiente'],
  ['comercial', 'Deck de inversión de cada proyecto', 'De aquí salen la tesis, el problema y el modelo de negocio de la ficha.', 'PDF', true, 'observado'],
  ['gobierno', 'Cap table actual', 'Base para simular la dilución de una ronda antes de confirmarla.', 'XLSX', false, 'no_aplica']
].map(([area, name, why, format, required, status], i) => ({
  id: `r${i}`, area, name, why, format, required, status,
  priority: required ? 'alta' : 'media', owner: i < 3 ? 'Andrés' : null,
  due_date: null, link: i === 0 ? 'https://drive.example/equipo' : null,
  comment: null, sort: i * 10
})) as Requisito[];

export const listarRequisitos = async (): Promise<Requisito[]> => espera(REQS);
export const sembrarRequisitos = async () => espera(22);
export async function actualizarRequisito(id: string, cambios: Partial<Requisito>) {
  REQS = REQS.map(r => r.id === id ? { ...r, ...cambios } : r);
}

// ------------------------------------------------------ rondas y capital

export const ETAPAS: Record<string, string> = {
  identificado: 'Identificado', contactado: 'Contactado', interesado: 'Interesado',
  reunion: 'Reunión', informacion_enviada: 'Información enviada',
  due_diligence: 'Due diligence', negociacion: 'Negociación',
  comprometido: 'Comprometido', cerrado: 'Cerrado',
  no_interesado: 'No interesado', en_pausa: 'En pausa'
};

export const listarRondas = async (): Promise<RondaBreve[]> => espera([
  { id: 'r1', name: 'Serie semilla · sep 2026', status: 'abierta', currency: 'USD',
    target_amount: 500000, project_id: 'a' }
]);

const PIPE: [string, string, number, number, number][] = [
  ['Andes Capital',        'due_diligence', 150000, 70, 0],
  ['Family office Rivera', 'negociacion',   120000, 60, 0],
  ['Fondo Tapir',          'comprometido',  100000, 90, 100000],
  ['Grupo Mesa',           'reunion',        80000, 30, 0],
  ['Inversionista ángel',  'contactado',     50000, 15, 0]
];

export async function cargarRonda(): Promise<Ronda | null> {
  const confirmado = 100000;
  const objetivo = 500000;
  const forecast = PIPE.reduce((s, [, , pot, pr]) => s + pot * pr / 100, 0);
  const uof: [string, string, number, number][] = [
    ['Desarrollo de plataforma', 'Construcción del producto.', 180000, 46000],
    ['Marca y lanzamiento',      'Identidad y salida al mercado.', 90000, 27400],
    ['Capital de trabajo',       'Colchón de los primeros meses.', 120000, 0],
    ['Adquisición de miembros',  'CAC hasta el umbral de validación.', 80000, 12000],
    ['Reserva',                  'Imprevistos.', 30000, 0]
  ];
  return espera({
    ronda: { id: 'r1', nombre: 'Serie semilla · sep 2026', moneda: 'USD', estado: 'abierta',
             instrumento: 'SAFE post-money', responsable: 'Dirección de inversiones',
             apertura: '2026-09-01', cierre_objetivo: '2027-01-31', cerrada_en: null,
             nota_uso_fondos: null, notas: null },
    proyecto: { id: 'a', nombre: '[DEMO] Club de membresía', moneda: 'USD' },
    indicadores: [
      ind('objetivo','Monto objetivo', objetivo,'dinero','Lo declarado en la ronda',
        [['Inversionistas en la ronda', PIPE.length,'numero']]),
      ind('confirmado','Capital confirmado', confirmado,'dinero',
        'Suma, por inversionista, del mayor entre lo comprometido y lo ya invertido',
        [['Ya invertido', 100000,'dinero'], ['Objetivo', objetivo,'dinero']]),
      ind('pendiente','Capital pendiente', objetivo - confirmado,'dinero',
        'Objetivo − capital confirmado',
        [['Objetivo', objetivo,'dinero'], ['Confirmado', confirmado,'dinero']]),
      ind('levantado','% levantado', 20,'porcentaje','Capital confirmado ÷ objetivo × 100',
        [['Confirmado', confirmado,'dinero'], ['Objetivo', objetivo,'dinero']]),
      ind('forecast','Forecast ponderado', forecast,'dinero',
        'Σ (monto potencial × probabilidad de cierre) de cada inversionista del pipeline',
        [['Potencial sin ponderar', 500000,'numero'], ['Inversionistas', PIPE.length,'numero']]),
      ind('pre_money','Valoración pre-money', 2000000,'dinero',
        'Lo que vale el proyecto antes de que entre este dinero', []),
      ind('post_money','Valoración post-money', 2500000,'dinero','Pre-money + inversión',
        [['Pre-money', 2000000,'dinero'], ['Objetivo', objetivo,'dinero']]),
      ind('equity_implicito','Equity que compra el objetivo', 20,'porcentaje',
        'Objetivo ÷ post-money × 100. Si no coincide con el equity ofrecido, uno de los dos está mal',
        [['Equity ofrecido', 20,'porcentaje'], ['Post-money', 2500000,'dinero']]),
      ind('uso_presupuestado','Uso de fondos presupuestado', 500000,'dinero',
        'Suma de las categorías del uso de fondos. Tiene que cuadrar con el objetivo',
        [['Objetivo', objetivo,'dinero'], ['Diferencia', 0,'dinero']]),
      ind('uso_utilizado','Uso de fondos ejecutado', 85400,'dinero',
        'Suma de lo ya gastado por categoría',
        [['Comprometido', 85400,'dinero'], ['Presupuestado', 500000,'dinero']])
    ],
    pipeline: Object.entries(
      PIPE.reduce((m, [, etapa, pot, pr]) => {
        m[etapa] = m[etapa] ?? { n: 0, pot: 0, pond: 0 };
        m[etapa]!.n++; m[etapa]!.pot += pot; m[etapa]!.pond += pot * pr / 100;
        return m;
      }, {} as Record<string, { n: number; pot: number; pond: number }>)
    ).map(([etapa, v], i) => ({ etapa, orden: i + 1, inversionistas: v.n,
        potencial: v.pot, comprometido: 0, ponderado: v.pond })),
    inversionistas: PIPE.map(([nombre, etapa, pot, pr, inv], i) => ({
      id: `c${i}`, nombre, tipo: 'fondo', pais: 'CO', etapa,
      potencial: pot, comprometido: inv, invertido: inv, probabilidad: pr,
      ponderado: Math.round(pot * pr / 100),
      ultimo_contacto: '2026-08-28', proxima_accion: 'Enviar el modelo actualizado',
      proxima_fecha: '2026-09-20', responsable: 'Dirección de inversiones'
    })),
    uso_de_fondos: uof.map(([categoria, descripcion, presupuesto, utilizado], i) => ({
      id: `u${i}`, categoria, descripcion, presupuesto,
      pct: Math.round(presupuesto / objetivo * 1000) / 10,
      comprometido: utilizado, utilizado, saldo: presupuesto - utilizado,
      proveedor: null, evidencia: null, fecha: null
    })),
    avisos: [
      { clave: 'sin_fecha_de_cierre', nivel: 'aviso',
        titulo: 'Hay compromisos sin monto',
        detalle: 'Un inversionista marcado como comprometido y con cero no suma al capital confirmado.' }
    ]
  } as Ronda);
}

export async function simularDilucion(_r: string, monto?: number): Promise<Dilucion> {
  const pre = 2000000;
  const m = monto ?? 100000;
  const post = pre + m;
  const factor = pre / post;
  const socios = [
    { socio: 'Fundadores', tipo: 'fundador', pct: 70, invertido: 0 },
    { socio: 'Socio operador', tipo: 'fundador', pct: 20, invertido: 50000 },
    { socio: 'Pool del equipo', tipo: 'equipo', pct: 10, invertido: 0 }
  ];
  return espera({
    ronda: { id: 'r1', nombre: 'Serie semilla · sep 2026', moneda: 'USD' },
    supuesto: { monto: m, origen: monto ? 'monto indicado a mano' : 'lo confirmado hasta hoy' },
    indicadores: [
      ind('pre_money','Pre-money', pre,'dinero','Lo que vale el proyecto antes de que entre el dinero', []),
      ind('inversion','Inversión simulada', m,'dinero','El monto con el que se simula la entrada', []),
      ind('post_money','Post-money', post,'dinero','Pre-money + inversión',
        [['Pre-money', pre,'dinero'], ['Inversión', m,'dinero']]),
      ind('entrante','% del nuevo inversionista', +(m / post * 100).toFixed(4),'porcentaje',
        'Inversión ÷ post-money × 100', [['Inversión', m,'dinero'], ['Post-money', post,'dinero']]),
      ind('factor','Factor de dilución', +(factor * 100).toFixed(2),'porcentaje',
        'Pre-money ÷ post-money. Cada socio actual conserva este porcentaje de lo que tenía',
        [['Pre-money', pre,'dinero'], ['Post-money', post,'dinero']])
    ],
    socios: socios.map(s => ({
      socio: s.socio, tipo: s.tipo, antes: s.pct,
      despues: +(s.pct * factor).toFixed(4),
      dilucion: +(s.pct - s.pct * factor).toFixed(4),
      invertido: s.invertido, derechos: null
    })),
    aviso: null
  } as Dilucion);
}
