begin;

-- ---------------------------------------------------------------------------
-- Las insignias dejan de ser un misterio y pasan a ser hitos de oficio
-- ---------------------------------------------------------------------------
-- Las seis insignias de la Alpha estaban escritas para un mundo: "Primer
-- Latido", "Eco Vivo", "Guardián". Secretas a propósito — "no se anuncian, se
-- descubren"— y otorgadas desde el navegador con `award_badge(code)`, que se
-- cree cualquier código que le pasen.
--
-- A quien abre ANIMA STUDIO para trabajar eso no le dice nada. Lo que sí le
-- dice algo es su propia trayectoria: el primer proyecto, los diez proyectos,
-- la primera entrega, el primer vínculo. Hitos que ya están pasando en sus
-- tablas y que nadie estaba contando.
--
-- Esta migración hace tres cosas:
--
-- 1 · Amplía el catálogo para que una insignia sepa a qué se refiere:
--     `category` la agrupa, `metric` dice qué se cuenta y `threshold` cuánto
--     hace falta. Así la pantalla puede mostrar "7 de 10" en vez de un enigma.
--
-- 2 · Escribe las diecinueve insignias del oficio y retira las de la Alpha.
--     Retirar no es borrar: `active = false` las saca del muro y quien las
--     ganó las conserva. Borrarlas arrastraría filas de `soul_badges` por la
--     clave foránea, que es quitarle a alguien algo que ya tenía.
--
-- 3 · Da una función que las otorga CONTANDO, no creyendo. Hasta ahora el
--     cliente decía "gané ésta" y la base le hacía caso; con veinte Almas eso
--     es una insignia inventada desde la consola del navegador. Ahora el
--     navegador solo pide "revisa", y quien cuenta es la base.
--
-- `award_badge` sigue existiendo: la Crónica y la Chispa la usan desde dentro.
-- Lo que se le quita es el permiso de ser llamada desde el navegador.

-- 1 · El catálogo aprende a describir un hito -------------------------------

alter table public.badges add column if not exists category  text    not null default 'Oficio';
alter table public.badges add column if not exists metric    text;
alter table public.badges add column if not exists threshold integer;
alter table public.badges add column if not exists sort      integer not null default 500;
alter table public.badges add column if not exists active    boolean not null default true;

comment on column public.badges.metric is
  'Qué se cuenta para ganarla: proyectos, entregas, vinculos, obras, documentos, movimientos, tareas_hechas, hitos, nucleo, equipo o dias.';
comment on column public.badges.threshold is
  'Cuánto hace falta de esa cuenta. La pantalla lo usa para dibujar el avance.';
comment on column public.badges.active is
  'false retira la insignia del muro sin quitársela a quien ya la tenía.';

-- 2 · Las insignias del oficio ----------------------------------------------

insert into public.badges (code, name, description, glyph, secret, category, metric, threshold, sort) values
  -- Proyectos: el pulso del Taller.
  ('primer_proyecto',     'Primer proyecto',      'Abriste tu primer proyecto en el Taller.',              '◷', false, 'Proyectos',   'proyectos',     1,  10),
  ('diez_proyectos',      'Diez proyectos',       'Diez trabajos registrados en tu Taller.',               '◷', false, 'Proyectos',   'proyectos',    10,  11),
  ('cincuenta_proyectos', 'Cincuenta proyectos',  'Cincuenta trabajos registrados. Esto ya es oficio.',    '◷', false, 'Proyectos',   'proyectos',    50,  12),
  ('primera_entrega',     'Primera entrega',      'Cerraste tu primer proyecto.',                          '✓', false, 'Proyectos',   'entregas',      1,  13),
  ('diez_entregas',       'Diez entregas',        'Diez trabajos entregados de principio a fin.',          '✓', false, 'Proyectos',   'entregas',     10,  14),

  -- Vínculos: con quién se trabaja.
  ('primer_vinculo',      'Primer vínculo',       'Sumaste tu primer cliente o colaborador.',              '☺', false, 'Vínculos',    'vinculos',      1,  20),
  ('diez_vinculos',       'Diez vínculos',        'Diez personas en tu cartera.',                          '☺', false, 'Vínculos',    'vinculos',     10,  21),
  ('cartera_consolidada', 'Cartera consolidada',  'Veinticinco vínculos activos en tu Taller.',            '☺', false, 'Vínculos',    'vinculos',     25,  22),

  -- Portafolio: lo que se muestra.
  ('primera_obra',        'Primera obra',         'Publicaste tu primera obra en el portafolio.',          '▦', false, 'Portafolio',  'obras',         1,  30),
  ('portafolio_diez',     'Portafolio de diez',   'Diez obras que te representan.',                        '▦', false, 'Portafolio',  'obras',        10,  31),

  -- Documentos: lo que se firma.
  ('primer_documento',    'Primer documento',     'Emitiste tu primera cotización o propuesta.',           '₵', false, 'Documentos',  'documentos',    1,  40),
  ('veinte_documentos',   'Veinte documentos',    'Veinte documentos emitidos desde ANIMA STUDIO.',        '₵', false, 'Documentos',  'documentos',   20,  41),

  -- Gestión: lo que sostiene el trabajo.
  ('raiz_en_marcha',      'Raíz en marcha',       'Diez movimientos registrados en tu Raíz.',              '🌱', false, 'Gestión',     'movimientos',  10,  50),
  ('agenda_al_dia',       'Agenda al día',        'Veinticinco tareas completadas.',                       '☰', false, 'Gestión',     'tareas_hechas',25,  51),

  -- Oficio: el tiempo y la identidad.
  ('perfil_profesional',  'Perfil profesional',   'Tu Núcleo completo: foto, oficio, ubicación y bio.',    '◆', false, 'Oficio',      'nucleo',        1,  60),
  ('trayectoria_viva',    'Trayectoria viva',     'Cinco hitos escritos en tu trayectoria.',               '⤴', false, 'Oficio',      'hitos',         5,  61),
  ('tres_meses',          'Tres meses de oficio', 'Noventa días trabajando en ANIMA STUDIO.',              '☷', false, 'Oficio',      'dias',         90,  62),
  ('un_ano',              'Un año de oficio',     'Trescientos sesenta y cinco días. Constancia.',         '☷', false, 'Oficio',      'dias',        365,  63),

  -- Equipo.
  ('primer_equipo',       'Primer equipo',        'Fundaste un Clan o entraste a uno.',                    '❂', false, 'Equipo',      'equipo',        1,  70)
on conflict (code) do update
  set name        = excluded.name,
      description = excluded.description,
      glyph       = excluded.glyph,
      secret      = excluded.secret,
      category    = excluded.category,
      metric      = excluded.metric,
      threshold   = excluded.threshold,
      sort        = excluded.sort,
      active      = true;

-- Las de la Alpha salen del muro. Quien las ganó las conserva.
update public.badges
   set active = false,
       category = 'Alpha',
       sort = 900
 where code in ('primer_latido','explorador','eco_vivo','guardian','persistencia');

-- "Alma fundadora" se queda, porque distingue a las primeras cuentas y eso
-- sigue siendo cierto en una plataforma profesional.
update public.badges
   set name        = 'Alma fundadora',
       description = 'Una de las primeras cincuenta cuentas de ANIMA STUDIO.',
       category    = 'Reconocimiento',
       secret      = false,
       metric      = null,
       threshold   = null,
       sort        = 80,
       active      = true
 where code = 'alma_fundadora';

-- 3 · Otorgar contando, no creyendo -----------------------------------------

create or replace function public.sincronizar_insignias()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_alma  public.almas;
  v_cuenta jsonb;
  v_badge record;
  v_nuevas text[] := '{}';
  v_es_nueva boolean;
begin
  if v_uid is null then
    return v_nuevas;
  end if;

  select * into v_alma from public.almas where user_id = v_uid;
  if v_alma.id is null then
    return v_nuevas;
  end if;

  -- Una sola pasada por las tablas del Taller. Lo que cuenta la base es lo que
  -- hay; el navegador no participa de esta cuenta.
  select jsonb_build_object(
    'proyectos',     (select count(*) from public.projects        where alma_id = v_alma.id),
    'entregas',      (select count(*) from public.projects        where alma_id = v_alma.id
                        and coalesce(status,'') in ('Entregado','Cerrado','Terminado')),
    'vinculos',      (select count(*) from public.clients         where alma_id = v_alma.id),
    'obras',         (select count(*) from public.portfolio       where alma_id = v_alma.id),
    'documentos',    (select count(*) from public.quotes          where alma_id = v_alma.id),
    'movimientos',   (select count(*) from public.finance_entries where alma_id = v_alma.id),
    'tareas_hechas', (select count(*) from public.tasks           where alma_id = v_alma.id
                        and coalesce(status,'') in ('Hecho','Finalizada','Completada','Terminada')),
    'hitos',         (select count(*) from public.trajectory      where alma_id = v_alma.id),
    'dias',          greatest(0, floor(extract(epoch from (now() - coalesce(v_alma.created_at, now()))) / 86400)),
    'equipo',        case when btrim(coalesce(v_alma.clan,'')) <> '' then 1 else 0 end,
    -- El Núcleo completo: foto, oficio, ubicación y bio. Los cuatro, o no está.
    'nucleo',        case when btrim(coalesce(v_alma.name,'')) <> ''
                           and btrim(coalesce(v_alma.discipline, v_alma.role, '')) <> ''
                           and btrim(coalesce(v_alma.city, v_alma.country, '')) <> ''
                           and btrim(coalesce(v_alma.bio,'')) <> ''
                           and btrim(coalesce(v_alma.avatar_url,'')) <> ''
                      then 1 else 0 end
  ) into v_cuenta;

  for v_badge in
    select code, name, metric, threshold
      from public.badges
     where active is true
       and metric is not null
       and threshold is not null
     order by sort
  loop
    continue when coalesce((v_cuenta ->> v_badge.metric)::numeric, 0) < v_badge.threshold;

    insert into public.soul_badges (user_id, code)
    values (v_uid, v_badge.code)
    on conflict (user_id, code) do nothing;

    get diagnostics v_es_nueva = row_count;
    if v_es_nueva then
      v_nuevas := v_nuevas || v_badge.code;
      insert into public.soul_timeline (user_id, event_type, title, description)
      values (v_uid, 'insignia', 'Nueva insignia', v_badge.name);
    end if;
  end loop;

  return v_nuevas;
end;
$$;

comment on function public.sincronizar_insignias() is
  'Revisa el Taller del Alma y otorga las insignias alcanzadas. Devuelve las nuevas. La cuenta la hace la base, no el navegador.';

revoke execute on function public.sincronizar_insignias() from public, anon;
grant  execute on function public.sincronizar_insignias() to authenticated;

-- `award_badge` se queda para lo que la usa por dentro (la Chispa otorga
-- "Eco Vivo" desde `give_spark`), pero deja de estar al alcance del navegador:
-- una insignia que se puede pedir por su nombre no distingue nada.
revoke execute on function public.award_badge(text) from public, anon, authenticated;

commit;
