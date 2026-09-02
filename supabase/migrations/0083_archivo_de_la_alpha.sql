-- ===========================================================
-- 0083 · El archivo de la Alpha
--
-- ANIMA STUDIO deja de tener capa de juego: niveles, XP, Esencia,
-- Chispas, bonificaciones, insignias, Árbol del Mundo, Consejo y
-- votaciones. La línea actual de ANIMA TSC es una herramienta de
-- trabajo, y lo que abre puertas es el plan contratado, no un
-- rango ganado.
--
-- Esta migración NO borra nada. Solo copia.
--
-- Lo que se va tiene más de 1.500 filas escritas por 22 personas
-- reales entre junio y septiembre de 2026: 432 acciones en el
-- registro, 241 Ecos, 213 latidos del Árbol, 142 hitos de
-- cronología, 96 recompensas, 52 insignias entregadas. Borrarlo
-- sin copia sería destruir la memoria de la Alpha, y la regla de
-- la casa es que ningún dato se borra sin respaldo.
--
-- El esquema alpha_2026 no está expuesto por PostgREST —solo lo
-- está `public`— y además se le revoca todo acceso a anon y
-- authenticated. Es memoria, no una API.
--
-- Para consultarlo:  select * from alpha_2026.almas;
-- Para restaurar:    insert into public.X select * from alpha_2026.X;
-- ===========================================================

create schema if not exists alpha_2026;

comment on schema alpha_2026 is
  'Memoria de la Alpha de ANIMA (jun–sep 2026): la capa de juego que STUDIO retiró en la 0084. Solo lectura, fuera de la API.';

-- Copia íntegra de lo que se elimina en la 0084.
create table if not exists alpha_2026.almas                  as select * from public.almas;
create table if not exists alpha_2026.alma_rewards           as select * from public.alma_rewards;
create table if not exists alpha_2026.reward_config          as select * from public.reward_config;
create table if not exists alpha_2026.badges                 as select * from public.badges;
create table if not exists alpha_2026.soul_badges            as select * from public.soul_badges;
create table if not exists alpha_2026.world_tree_state       as select * from public.world_tree_state;
create table if not exists alpha_2026.world_tree_events      as select * from public.world_tree_events;
create table if not exists alpha_2026.world_tree_nodes       as select * from public.world_tree_nodes;
create table if not exists alpha_2026.world_tree_connections as select * from public.world_tree_connections;
create table if not exists alpha_2026.proposals              as select * from public.proposals;
create table if not exists alpha_2026.votes                  as select * from public.votes;
create table if not exists alpha_2026.post_sparks            as select * from public.post_sparks;

-- Cuándo se archivó y cuánto había. Sin esto, dentro de un año
-- nadie sabrá si el archivo está completo o a medias.
create table if not exists alpha_2026.acta (
  tabla        text primary key,
  filas        bigint not null,
  archivado_at timestamptz not null default now()
);

insert into alpha_2026.acta (tabla, filas)
select 'almas', count(*) from alpha_2026.almas
union all select 'alma_rewards', count(*) from alpha_2026.alma_rewards
union all select 'reward_config', count(*) from alpha_2026.reward_config
union all select 'badges', count(*) from alpha_2026.badges
union all select 'soul_badges', count(*) from alpha_2026.soul_badges
union all select 'world_tree_state', count(*) from alpha_2026.world_tree_state
union all select 'world_tree_events', count(*) from alpha_2026.world_tree_events
union all select 'world_tree_nodes', count(*) from alpha_2026.world_tree_nodes
union all select 'world_tree_connections', count(*) from alpha_2026.world_tree_connections
union all select 'proposals', count(*) from alpha_2026.proposals
union all select 'votes', count(*) from alpha_2026.votes
union all select 'post_sparks', count(*) from alpha_2026.post_sparks
on conflict (tabla) do nothing;

-- Memoria, no API.
revoke all on schema alpha_2026 from anon, authenticated;
revoke all on all tables in schema alpha_2026 from anon, authenticated;
