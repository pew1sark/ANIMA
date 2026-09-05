-- ===========================================================
-- 0106 · CAPITAL INTELLIGENCE — los requisitos
-- -----------------------------------------------------------
-- Lo que hay que reunir. Una tabla, dos propósitos:
--
--   puesta_en_marcha · qué hace falta para migrar y empezar
--   due_diligence    · qué pide un inversionista (Fase 2)
--
-- Es la misma pregunta hecha por dos motivos distintos. Separarla en
-- dos tablas habría duplicado estados, responsables, evidencias y
-- validación, y habría obligado a mantener dos veces la misma
-- pantalla.
--
-- La lista estándar de puesta en marcha se siembra con
-- `ci_sembrar_requisitos()`: 22 filas que cubren lo mínimo para que
-- la plataforma deje de estar vacía. Desde ahí cada organización la
-- adapta —sobran filas en unos casos y faltan en otros, y eso está
-- bien: por eso es una tabla y no una constante.
-- ===========================================================

create table if not exists public.ci_requirements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id)   on delete cascade,
  project_id  uuid references public.ci_projects(id)          on delete cascade,
  purpose     text not null default 'puesta_en_marcha'
              check (purpose in ('puesta_en_marcha','due_diligence')),
  area        text not null default 'financiera',
  name        text not null,
  description text,
  why         text,
  format      text,
  required    boolean not null default true,
  status      text not null default 'pendiente'
              check (status in ('pendiente','solicitado','recibido','en_revision',
                                'observado','aprobado','no_aplica')),
  priority    text not null default 'media',
  owner       text,
  due_date    date,
  link        text,
  comment     text,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  sort        int not null default 0,
  custom      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table public.ci_requirements is
  'Capital Intelligence · lo que hay que reunir. purpose=puesta_en_marcha para migrar; due_diligence para la Fase 2.';

create index if not exists ci_requirements_company_idx on public.ci_requirements(company_id) where deleted_at is null;
create index if not exists ci_requirements_project_idx on public.ci_requirements(project_id);
create index if not exists ci_requirements_estado_idx  on public.ci_requirements(company_id, purpose, status);

drop trigger if exists ci_requirements_touch on public.ci_requirements;
create trigger ci_requirements_touch before update on public.ci_requirements
  for each row execute function public.touch_updated_at();

drop trigger if exists ci_requirements_validate_custom on public.ci_requirements;
create trigger ci_requirements_validate_custom before insert or update of custom on public.ci_requirements
  for each row execute function public.trg_validate_custom();

drop trigger if exists ci_requirements_soft_delete on public.ci_requirements;
create trigger ci_requirements_soft_delete before delete on public.ci_requirements
  for each row execute function public.ci_borrado_logico();

drop trigger if exists ci_requirements_auditar on public.ci_requirements;
create trigger ci_requirements_auditar after insert or update or delete on public.ci_requirements
  for each row execute function public.ci_auditar();

drop trigger if exists ci_requirements_misma_empresa on public.ci_requirements;
create trigger ci_requirements_misma_empresa before insert or update of project_id on public.ci_requirements
  for each row when (new.project_id is not null)
  execute function public.ci_misma_empresa('ci_projects', 'project_id');

alter table public.ci_requirements enable row level security;

-- Un requisito SIN proyecto es de la organización: lo ve quien entra al
-- módulo. Con proyecto, sigue al proyecto, para que un inversionista
-- invitado vea la carpeta suya y no la de al lado.
--
-- Editar solo pide nivel 40 a propósito: marcar "recibido" y pegar un
-- enlace es trabajo de quien reúne los papeles, no de quien manda.
drop policy if exists ci_requirements_leer     on public.ci_requirements;
drop policy if exists ci_requirements_crear    on public.ci_requirements;
drop policy if exists ci_requirements_editar   on public.ci_requirements;
drop policy if exists ci_requirements_borrar   on public.ci_requirements;

create policy ci_requirements_leer on public.ci_requirements for select to authenticated
  using (deleted_at is null and (
    case when project_id is null then public.has_company_level(company_id, 40)
         else public.ci_ve_proyecto(project_id) end));
create policy ci_requirements_crear on public.ci_requirements for insert to authenticated
  with check (case when project_id is null then public.has_company_level(company_id, 60)
                   else public.ci_edita_proyecto(project_id) end);
create policy ci_requirements_editar on public.ci_requirements for update to authenticated
  using (case when project_id is null then public.has_company_level(company_id, 40)
              else public.ci_ve_proyecto(project_id) end)
  with check (case when project_id is null then public.has_company_level(company_id, 40)
                   else public.ci_ve_proyecto(project_id) end);
create policy ci_requirements_borrar on public.ci_requirements for delete to authenticated
  using (public.has_company_level(company_id, 60));

create or replace function public.ci_sembrar_requisitos(p_company uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if not public.has_company_level(p_company, 60) then
    raise exception 'No tienes permiso para preparar esta organización';
  end if;

  insert into public.ci_requirements
    (company_id, purpose, area, name, why, format, required, priority, sort, created_by)
  select p_company, 'puesta_en_marcha', x.area, x.nombre, x.para_que, x.formato,
         x.obligatorio, x.prioridad, x.orden, (select auth.uid())
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
revoke execute on function public.ci_sembrar_requisitos(uuid) from public, anon;
grant  execute on function public.ci_sembrar_requisitos(uuid) to authenticated;
