-- 0028 · Plan de trabajo profesional: campos ricos en las tareas del Clan.
-- Aditivo y seguro: columnas nullable; las tareas existentes quedan intactas.
alter table public.team_tasks add column if not exists description text;
alter table public.team_tasks add column if not exists work_type text;
alter table public.team_tasks add column if not exists priority text;
alter table public.team_tasks add column if not exists start_date date;
alter table public.team_tasks add column if not exists due_at date;
alter table public.team_tasks add column if not exists notes text;
