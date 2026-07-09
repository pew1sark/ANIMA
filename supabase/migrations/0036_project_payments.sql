-- 0034 · Abonos, etapas de proceso e historial de estado por proyecto
-- payments : lista de abonos [{a:monto, on:"AAAA-MM-DD", method, note}]
-- checklist: etapas del proceso [{t:texto, done:bool}]
-- history  : cambios de estado [{st:estado, at:ISO}]
alter table public.projects add column if not exists payments  jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists history   jsonb not null default '[]'::jsonb;
