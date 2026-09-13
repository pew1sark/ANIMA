-- ===========================================================
-- 0124 · REAL ESTATE INTELLIGENCE — poner en marcha una organización
-- -----------------------------------------------------------
-- Una organización recién dada de alta en este módulo tiene trece
-- tablas vacías, y tres de ellas no sirven vacías: sin criterios no
-- hay nota, sin etapas no hay % de avance, y sin supuestos no hay
-- prefactibilidad. La alternativa a sembrarlas es que la primera
-- persona que entre vea cuatro pantallas en blanco y no sepa cuál
-- llenar primero.
--
-- QUÉ SE SIEMBRA Y QUÉ NO
--
-- Los porcentajes de práctica —WACC objetivo, TIR mínima, margen
-- mínimo, DSCR, reparto de indirectos— son criterio de industria y se
-- siembran con su valor de referencia en cualquier jurisdicción: una
-- firma puede no estar de acuerdo, y para eso son editables, pero el
-- número de partida existe.
--
-- Las cifras que dependen del país —costo de obra por m², tarifas
-- notariales, renta, ICA— se siembran CON VALOR solo si la
-- organización está en Colombia, que es la jurisdicción de la que
-- vienen. Para cualquier otro país se crea la fila con su nombre y su
-- unidad, y el valor queda VACÍO. Sembrar una tarifa colombiana en una
-- empresa chilena sería peor que no sembrar nada: el número se vería
-- correcto y nadie tendría motivo para revisarlo.
--
-- Todas llevan en `source` de dónde salen y que hay que validarlas.
-- Ninguna de estas cifras es asesoría tributaria.
--
-- Los siete criterios de calificación son los del instrumento con el
-- que la firma ya venía trabajando, con sus pesos, que suman 100. El
-- documento de estrategia propone otro reparto —con la aptitud
-- normativa (POT) como criterio propio— y eso es exactamente lo que
-- `rei_criteria` permite: una fila más y un reparto distinto, sin
-- tocar el código.
--
-- Idempotente: `on conflict do nothing`. Volver a llamarla completa lo
-- que falte y no pisa lo que alguien ya ajustó, que es la propiedad
-- que hace que se pueda llamar sin miedo.
-- ===========================================================

-- La versión interna, sin guardia de sesión. Mismo corte que
-- `ci_sembrar_requisitos_interno` en 0111: la mecánica por un lado, el
-- permiso que la protege por el otro. Una carga desde una migración o
-- desde un proceso del servidor no tiene `auth.uid()`, y bajarle el
-- permiso a la versión pública para que pase sería abrir la puerta por
-- dentro.
create or replace function public.rei_sembrar_base_interno(
  p_company uuid, p_creado_por uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pais text; v_co boolean; v_par int; v_cri int; v_eta int;
begin
  select upper(coalesce(country, '')) into v_pais from public.companies where id = p_company;
  if v_pais is null then raise exception 'La organización no existe'; end if;
  v_co := (v_pais = 'CO');

  -- ---------- SUPUESTOS ----------
  insert into public.rei_parameters
    (company_id, slug, category, name, value, unit, source, notes, sort, created_by)
  select p_company, x.slug, x.categoria, x.nombre,
         case when x.solo_co and not v_co then null else x.valor end,
         x.unidad, x.fuente, x.nota, x.orden, p_creado_por
    from (values
      -- ---- estructuración financiera (criterio de industria) ----
      ('wacc', 'financiero', 'Tasa de descuento / WACC objetivo', 16.0, 'pct', false,
       'Rango típico del sector inmobiliario 14%-20% EA según riesgo del proyecto',
       'Es la tasa con la que se descuenta el flujo para el VAN. Súbela cuando el proyecto sea más riesgoso que el promedio de la cartera.', 10),
      ('tir_minima', 'financiero', 'TIR mínima exigida al proyecto', 20.0, 'pct', false,
       'Piso interno de aprobación',
       'Por debajo de esto el proyecto no pasa a estructuración, aunque el VAN sea positivo.', 20),
      ('margen_minimo', 'financiero', 'Margen mínimo sobre ventas', 20.0, 'pct', false,
       'Estándar de la industria: 20%-25%',
       'Utilidad ÷ ingresos por ventas.', 30),
      ('equilibrio_maximo', 'financiero', 'Punto de equilibrio máximo aceptable', 65.0, 'pct', false,
       'Prácticas fiduciarias',
       '% de unidades que hay que tener vendidas para iniciar obra. Cuanto más alto, más tarde arranca el proyecto.', 40),
      ('preventas_minimas', 'financiero', 'Preventas mínimas para el punto de equilibrio', 70.0, 'pct', false,
       'Los recursos de los compradores quedan en fiducia hasta el punto de equilibrio técnico-financiero',
       'Es el % que usa la prefactibilidad para calcular cuántas unidades hay que preventar.', 50),
      ('dscr_minimo', 'financiero', 'Cobertura mínima exigida por la banca', 1.3, 'numero', false,
       'Cobertura de servicio de deuda típica de crédito constructor',
       'El módulo calcula un proxy de cobertura sobre el flujo. Un DSCR formal necesita el calendario de la deuda.', 60),
      ('apalancamiento_maximo', 'financiero', 'Apalancamiento máximo (deuda / costo total)', 60.0, 'pct', false,
       'El crédito constructor suele financiar 50%-70% del costo directo',
       'Tope de deuda sobre el costo total del proyecto.', 70),

      -- ---- costos de obra (dependen del país y del mercado local) ----
      ('costo_directo_vis', 'obra', 'Costo directo de construcción · VIS', 2200000.0, 'dinero_m2', true,
       'Estimado gremial Colombia — actualizar con cotización local',
       'Por m² construido. Es el insumo del que sale el costo directo de cualquier prefactibilidad de producto VIS.', 100),
      ('costo_directo_no_vis', 'obra', 'Costo directo de construcción · No VIS', 2800000.0, 'dinero_m2', true,
       'Estimado gremial Colombia — actualizar con presupuesto de obra real',
       'Por m² construido, para producto distinto de VIS.', 110),
      ('costos_indirectos_pct', 'obra', 'Costos indirectos (% sobre costo directo)', 25.0, 'pct', false,
       'Práctica de la industria',
       'Diseño, licencias, interventoría y administración de obra.', 120),
      ('gastos_financieros_pct', 'obra', 'Gastos financieros (% sobre costo)', 8.0, 'pct', false,
       'Práctica de la industria',
       'Intereses y comisiones de estructuración durante la construcción.', 130),
      ('gastos_comerciales_pct', 'obra', 'Gastos comerciales (% sobre ingresos)', 6.0, 'pct', false,
       'Práctica de la industria',
       'Comisiones de venta y mercadeo del proyecto.', 140),

      -- ---- comercial ----
      ('comision_intermediacion', 'comercial', 'Comisión de intermediación', 3.0, 'pct', false,
       'Comisión estándar de corretaje sobre el precio de venta',
       'Con esto el panel estima el ingreso por comisión de lo vendido en el tramo.', 200),
      ('adelanto_canon_pct', 'comercial', 'Descuento del adelanto de cánones', 15.0, 'pct', false,
       'Punto de partida — validar con jurídico antes de lanzar el producto',
       'Descuento implícito sobre el flujo de renta cedido. Debe cubrir el costo de fondeo, la vacancia estimada y el seguro.', 210),

      -- ---- tributario y transaccional (Colombia) ----
      ('renta_sociedades', 'tributario', 'Impuesto de renta · sociedades', 35.0, 'pct', true,
       'Tarifa general — verificar vigencia y régimen aplicable',
       'No es asesoría tributaria: confirmar con el contador antes de estructurar.', 300),
      ('retencion_venta_inmueble', 'tributario', 'Retención en la fuente por venta de inmuebles', 1.0, 'pct', true,
       'Sobre el mayor valor entre precio de venta y avalúo catastral',
       'Ajustar según UVT y notaría.', 310),
      ('iva_construccion_vivienda', 'tributario', 'IVA a la construcción de vivienda', 0.0, 'pct', true,
       'La vivienda nueva está excluida o exenta según normativa vigente',
       'Confirmar el tratamiento para producto no VIS y comercial.', 320),
      ('notariales_registro', 'tributario', 'Gastos notariales y de registro', 1.5, 'pct', true,
       'Estimado combinado notaría + registro + beneficencia',
       'Sobre el valor de la escritura. Validar tarifas del departamento.', 330),
      ('ica_municipal', 'tributario', 'Industria y comercio (ICA) municipal', 0.7, 'pct', true,
       'Tarifa estimada para actividad inmobiliaria',
       'Confirmar la tarifa vigente del municipio.', 340),
      ('delineacion_urbana', 'tributario', 'Delineación urbana / licencia de construcción', 1.0, 'pct', true,
       'Varía por curaduría y municipio',
       'Sobre el presupuesto de obra. Presupuestar por proyecto.', 350),
      ('comision_fiduciaria', 'tributario', 'Comisión fiduciaria de estructuración', 1.5, 'pct', true,
       'Estimado — cotizar con las fiduciarias aliadas',
       'Sobre el valor del patrimonio autónomo.', 360)
    ) as x(slug, categoria, nombre, valor, unidad, solo_co, fuente, nota, orden)
  on conflict (company_id, slug) do nothing;
  get diagnostics v_par = row_count;

  -- ---------- CRITERIOS DE CALIFICACIÓN ----------
  insert into public.rei_criteria
    (company_id, name, weight_pct, measures, level_low, level_mid, level_high, sort, created_by)
  select p_company, x.nombre, x.peso, x.mide, x.bajo, x.medio, x.alto, x.orden, p_creado_por
    from (values
      ('Demanda y mercado', 20.0,
       'Compradores activos interesados en esa zona y tipología, cruzado con la base de demanda',
       'Sin compradores registrados en el sector',
       'Demanda moderada, interés ocasional',
       'Demanda represada, con lista de espera', 10),
      ('Ubicación y accesibilidad', 15.0,
       'Vías, servicios públicos, cercanía a equipamientos y seguridad de la zona',
       'Sin vías de acceso ni servicios básicos',
       'Servicios parciales, acceso regular',
       'Servicios completos, vía pavimentada, zona consolidada', 20),
      ('Situación jurídica del predio', 20.0,
       'Estado de títulos, linderos, gravámenes y uso del suelo',
       'Títulos en litigio o sin escriturar',
       'Papeles al día con trámites pendientes',
       'Títulos saneados, libre de gravámenes, uso permitido', 30),
      ('Viabilidad financiera', 20.0,
       'Margen y TIR estimados contra los mínimos exigidos en Supuestos',
       'Margen y TIR por debajo del mínimo',
       'En el límite de los mínimos',
       'Margen y TIR superan holgadamente el mínimo', 40),
      ('Punto de equilibrio y preventas', 10.0,
       'Probabilidad de alcanzar el nivel de preventas que exige la fiducia para escriturar',
       'Muy difícil llegar al punto de equilibrio',
       'Alcanzable con esfuerzo comercial adicional',
       'Alta probabilidad de superarlo rápido', 50),
      ('Estructura de capital y bancabilidad', 10.0,
       'Facilidad para conseguir crédito constructor y montar la estructura fiduciaria',
       'Sin garantías, difícil de bancarizar',
       'Bancarizable con garantías adicionales',
       'Cumple la cobertura exigida, fácilmente bancable', 60),
      ('Alineación estratégica', 5.0,
       'Qué tanto aporta al plan de expansión declarado',
       'Fuera del área de expansión',
       'Municipio secundario del plan',
       'Municipio prioritario del plan', 70)
    ) as x(nombre, peso, mide, bajo, medio, alto, orden)
  on conflict (company_id, name) do nothing;
  get diagnostics v_cri = row_count;

  -- ---------- ETAPAS DEL PROCESO ----------
  insert into public.rei_stages (company_id, name, phase, sort)
  select p_company, x.nombre, x.fase, x.orden
    from (values
      ('Terreno identificado',  'originacion',     10),
      ('Análisis jurídico',     'originacion',     20),
      ('Análisis urbanístico',  'originacion',     30),
      ('Estudio de mercado',    'originacion',     40),
      ('Prefactibilidad',       'estructuracion',  50),
      ('Modelo financiero',     'estructuracion',  60),
      ('Estructura de capital', 'estructuracion',  70),
      ('Fiduciaria',            'estructuracion',  80),
      ('Financiación',          'financiacion',    90),
      ('Preventas',             'financiacion',   100),
      ('Construcción',          'ejecucion',      110),
      ('Comercialización',      'ejecucion',      120),
      ('Cierre',                'salida',         130)
    ) as x(nombre, fase, orden)
  on conflict (company_id, name) do nothing;
  get diagnostics v_eta = row_count;

  return jsonb_build_object(
    'pais', v_pais, 'jurisdiccion_conocida', v_co,
    'supuestos', v_par, 'criterios', v_cri, 'etapas', v_eta);
end $$;
comment on function public.rei_sembrar_base_interno(uuid, uuid) is
  'Siembra supuestos, criterios y etapas de Real Estate Intelligence. Sin guardia de sesión: la protege rei_sembrar_base().';
revoke execute on function public.rei_sembrar_base_interno(uuid, uuid) from public, anon, authenticated;

-- La versión que llama una persona. Exige nivel 60 en la organización:
-- sembrar supuestos es fijar con qué números se van a aprobar los
-- proyectos de la casa, y eso no lo hace quien muestra inmuebles.
create or replace function public.rei_sembrar_base(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'Hace falta nivel de dirección para poner en marcha este módulo';
  end if;
  return public.rei_sembrar_base_interno(p_company, (select auth.uid()));
end $$;
comment on function public.rei_sembrar_base(uuid) is
  'Pone en marcha Real Estate Intelligence en una organización. Idempotente: completa lo que falte y no pisa lo ajustado.';
revoke execute on function public.rei_sembrar_base(uuid) from public, anon;
grant  execute on function public.rei_sembrar_base(uuid) to authenticated;
