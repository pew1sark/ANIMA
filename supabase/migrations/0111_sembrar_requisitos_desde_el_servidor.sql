-- ===========================================================
-- 0111 · Sembrar requisitos sin sesión
-- -----------------------------------------------------------
-- Mismo corte que `ci_generar_periodos` en 0102: la mecánica por un
-- lado, el permiso que la protege por el otro. Una carga hecha desde
-- una migración o desde un proceso del servidor no tiene `auth.uid()`,
-- y bajarle el permiso a la versión pública para que pase sería abrir
-- la puerta por dentro.
--
-- -----------------------------------------------------------
-- NOTA SOBRE LO QUE **NO** ESTÁ EN ESTE ARCHIVO
--
-- La migración 0111 que corrió contra la base el 07-09-2026 traía
-- además el alta de una organización real de cliente, y las 0112 y
-- 0113 cargaron sus proyectos: valoraciones, EBITDA, estructura de
-- rondas y nombres de las personas que participan.
--
-- Este repositorio es PÚBLICO —se publica por GitHub Pages— así que
-- esos datos no se versionan. Una vez empujados quedarían en el
-- historial de git para siempre y serían indexables. Viven en la base
-- de Supabase, que es privada y tiene RLS por organización, y su carga
-- queda documentada en `supabase/datos-clientes/`, que está en
-- .gitignore.
--
-- La regla, dicha una vez: una migración numerada contiene ESTRUCTURA
-- Y LÓGICA DE PRODUCTO —tablas, funciones, políticas, catálogos— y
-- datos de demostración claramente ficticios. Datos de un cliente,
-- nunca.
--
-- Consecuencia práctica: replicar este repositorio desde cero levanta
-- la plataforma entera y vacía, que es lo correcto.
-- ===========================================================

create or replace function public.ci_sembrar_requisitos_interno(p_company uuid, p_creado_por uuid default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  insert into public.ci_requirements
    (company_id, purpose, area, name, why, format, required, priority, sort, created_by)
  select p_company, 'puesta_en_marcha', x.area, x.nombre, x.para_que, x.formato,
         x.obligatorio, x.prioridad, x.orden, p_creado_por
    from (values
      ('organizacion', 'Listado de personas que van a entrar, con rol y correo',
       'Sin esto no hay a quién invitar ni qué permisos darle. El rol decide qué ve cada uno.',
       'Planilla o correo', true, 'alta', 10),
      ('organizacion', 'Estructura de portafolios y proyectos',
       'Cómo agrupas hoy lo que administras. Define la jerarquía que verás en el panel.',
       'Planilla o esquema', true, 'alta', 20),
      ('organizacion', 'Catálogo de categorías de costo y gasto que usas',
       'Es lo que hace que el presupuesto y la ejecución real se puedan comparar: si las categorías no coinciden, no hay contra qué cotejar.',
       'Planilla', true, 'alta', 30),
      ('organizacion', 'Monedas en juego y de dónde sacas el tipo de cambio',
       'Un proyecto en otra moneda sin tasa no entra en el consolidado.',
       'Nota o planilla', true, 'alta', 40),
      ('organizacion', 'Umbrales de desviación que consideras aviso y crítico',
       'Configura el semáforo del presupuesto. Un 10% es grave en una constructora y ruido en una campaña.',
       'Nota', false, 'media', 50),
      ('financiera', 'Modelo financiero en Excel de cada proyecto, con las fórmulas a la vista',
       'Es la fuente de la que sale la matriz mensual. Las fórmulas importan: sin ellas hay que adivinar de dónde salió cada celda.',
       'XLSX', true, 'alta', 100),
      ('financiera', 'Presupuesto original aprobado de cada proyecto',
       'Es la versión 1 contra la que se mide todo lo demás. Sin él solo se puede comparar contra la proyección de hoy, que ya se movió.',
       'XLSX o PDF', true, 'alta', 110),
      ('financiera', 'Ejecución real a la fecha, mes a mes',
       'Lo que de verdad pasó. Es la mitad de la comparación presupuesto/real.',
       'XLSX o mayor contable', true, 'alta', 120),
      ('financiera', 'Flujo de caja con el SALDO INICIAL declarado',
       'Sin saldo de apertura la necesidad de capital sale mal y el modelo no se puede validar.',
       'XLSX', true, 'alta', 130),
      ('financiera', 'Detalle de inversión / CAPEX con proveedor y fecha',
       'Separa lo comprometido de lo pagado, que es donde un proyecto se lleva la sorpresa.',
       'XLSX', true, 'alta', 140),
      ('financiera', 'Estado de resultados de los últimos 12 meses, si ya hay operación',
       'Da la base real de márgenes contra la que contrastar la proyección.',
       'PDF o XLSX', false, 'media', 150),
      ('financiera', 'Tasa de descuento y tasa de impuesto que aplicas',
       'Sin tasa de descuento no hay VAN, y una valoración sin VAN detrás no tiene metodología que mostrar.',
       'Nota', true, 'alta', 160),
      ('financiera', 'Supuestos de cada escenario (conservador, base, optimista)',
       'Un escenario sin supuestos escritos no se puede comparar con otro ni defender ante un tercero.',
       'Planilla o nota', true, 'media', 170),
      ('comercial', 'Deck de inversión de cada proyecto',
       'De aquí salen la tesis, el problema y el modelo de negocio de la ficha.',
       'PDF', true, 'alta', 200),
      ('comercial', 'Monto objetivo, valoración pre-money y equity ofrecido por ronda',
       'El sistema avisa cuando pre-money + inversión no da la post-money, o cuando el equity no calza.',
       'Nota o term sheet', true, 'alta', 210),
      ('legal', 'Term sheet o instrumento de la ronda (equity, SAFE, nota convertible)',
       'Define cómo se registra el compromiso y cómo diluye.',
       'PDF', false, 'media', 220),
      ('gobierno', 'Cap table actual',
       'Base para simular la dilución de una ronda antes de confirmarla.',
       'XLSX', false, 'media', 230),
      ('comercial', 'Listado de inversionistas con etapa, ticket y probabilidad',
       'Es el pipeline. Con probabilidad se obtiene el forecast ponderado.',
       'XLSX', false, 'media', 240),
      ('financiera', 'Uso de fondos comprometido, por categoría',
       'Tiene que cuadrar con el monto de la ronda o el sistema lo advierte.',
       'XLSX', false, 'media', 250),
      ('operacional', 'Hitos que condicionan desembolsos, con fecha y monto',
       'Un tramo que se libera al abrir el local es un hito con monto, no una nota al pie.',
       'Planilla', false, 'media', 300),
      ('riesgos', 'Matriz de riesgos, si la llevas',
       'Entra tal cual en la Fase 2. Si no existe, se construye desde cero.',
       'XLSX', false, 'baja', 310),
      ('legal', 'Constitución del vehículo o sociedad',
       'Contexto legal. No bloquea la prueba.',
       'PDF', false, 'baja', 320)
    ) as x(area, nombre, para_que, formato, obligatorio, prioridad, orden)
   where not exists (
     select 1 from public.ci_requirements r
      where r.company_id = p_company and r.purpose = 'puesta_en_marcha'
        and r.deleted_at is null);

  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.ci_sembrar_requisitos_interno(uuid, uuid) from public, anon, authenticated;

create or replace function public.ci_sembrar_requisitos(p_company uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para preparar esta organización';
  end if;
  return public.ci_sembrar_requisitos_interno(p_company, (select auth.uid()));
end $$;
revoke execute on function public.ci_sembrar_requisitos(uuid) from public, anon;
grant  execute on function public.ci_sembrar_requisitos(uuid) to authenticated;
