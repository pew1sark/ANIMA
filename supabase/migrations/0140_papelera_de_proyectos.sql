-- =====================================================================
-- 0140 · Papelera de proyectos (STUDIO → Proyectos → Mostrar: Eliminados)
--
-- Eliminar un proyecto ya no lo borra: le pone fecha en `deleted_at` y lo
-- saca de la lista, del resumen, del calendario y de los avisos. Desde la
-- papelera se restaura (deleted_at = null) o se elimina para siempre.
--
-- Por qué: el 1 oct 2026 se eliminó por error el proyecto «BILIGAY» y el
-- borrado era definitivo; se rescató solo lo que había quedado en una copia
-- del calendario (nombre, cliente, estado, inicio, comuna), sin valor ni
-- abonos. Las cotizaciones y solicitudes enlazadas ya no pierden el vínculo
-- (antes su project_id quedaba en null al borrar).
-- =====================================================================

alter table public.projects add column if not exists deleted_at timestamptz;
create index if not exists projects_papelera on public.projects (alma_id, deleted_at) where deleted_at is not null;
comment on column public.projects.deleted_at is 'Papelera de STUDIO: con fecha = eliminado (restaurable). Null = vivo.';
