-- 0030 · Experiencia / Esencia: recompensas durables (cross-device) + config del Creador
-- Aditivo y seguro. Dos tablas nuevas + RPCs security-definer.
--  · alma_rewards : registro de recompensas cobradas (1 sola vez por Alma/clave).
--  · reward_config: parámetros editables de la experiencia (montos por acción).

create table if not exists public.alma_rewards (
  alma_id    uuid not null references public.almas(id) on delete cascade,
  reward_key text not null,
  amount     int  not null default 0,
  awarded_at timestamptz not null default now(),
  primary key (alma_id, reward_key)
);
alter table public.alma_rewards enable row level security;
drop policy if exists "alma_rewards read" on public.alma_rewards;
create policy "alma_rewards read" on public.alma_rewards for select using (
  exists(select 1 from public.almas a where a.id=alma_id and a.user_id=auth.uid())
  or lower(coalesce(auth.jwt()->>'email',''))='sarkgraff@gmail.com'
);
-- Escritura SOLO vía claim_reward (security definer).

create table if not exists public.reward_config (
  key     text primary key,
  label   text not null,
  amount  int  not null default 0,
  enabled boolean not null default true,
  sort    int  not null default 0
);
alter table public.reward_config enable row level security;
drop policy if exists "reward_config read" on public.reward_config;
create policy "reward_config read" on public.reward_config for select using (true);
-- Escritura SOLO vía reward_config_set (security definer, Creador).

insert into public.reward_config(key,label,amount,enabled,sort) values
  ('crear_alma',       'Nacer en ANIMA',                    100, true, 1),
  ('completar_nucleo', 'Completar tu Núcleo',               150, true, 2),
  ('primera_obra',     'Tu primera obra',                   200, true, 3),
  ('primer_proyecto',  'Tu primer Proyecto',                150, true, 4),
  ('primera_huella',   'Tu primera Huella en la Comunidad', 300, true, 5),
  ('huella',           'Nueva Huella en la Comunidad',      150, true, 6),
  ('vinculo',          'Vincularte con otra Alma',          100, true, 7),
  ('ingreso_diario',   'Primer ingreso del día',             30, true, 8)
on conflict (key) do nothing;

-- ¿El llamante es el Creador?
create or replace function public.is_creator()
returns boolean language sql security definer set search_path='public' stable as $$
  select lower(coalesce(auth.jwt()->>'email','')) = 'sarkgraff@gmail.com';
$$;
grant execute on function public.is_creator() to authenticated;

-- Cobra una recompensa única y suma su Esencia (xp) de forma atómica.
-- El monto sale de reward_config (fuente de verdad); el cliente solo envía la clave.
-- Las claves diarias llegan como 'ingreso_diario:2026-06-23' (base + fecha).
create or replace function public.claim_reward(p_key text)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_alma uuid; v_amount int; v_enabled boolean; v_xp int; v_base text;
begin
  select id, coalesce(xp,0) into v_alma, v_xp from public.almas where user_id=auth.uid() limit 1;
  if v_alma is null then return jsonb_build_object('granted',false,'xp',0); end if;
  v_base := split_part(p_key, ':', 1);
  select amount, enabled into v_amount, v_enabled from public.reward_config where key=v_base;
  if not found or not v_enabled or coalesce(v_amount,0)=0 then
    return jsonb_build_object('granted',false,'xp',v_xp);
  end if;
  insert into public.alma_rewards(alma_id,reward_key,amount)
    values(v_alma,p_key,v_amount) on conflict (alma_id,reward_key) do nothing;
  if not found then  -- ya estaba cobrada
    return jsonb_build_object('granted',false,'xp',v_xp);
  end if;
  update public.almas set xp=coalesce(xp,0)+v_amount where id=v_alma returning xp into v_xp;
  return jsonb_build_object('granted',true,'xp',v_xp,'amount',v_amount);
end; $$;
grant execute on function public.claim_reward(text) to authenticated;

-- El Creador ajusta los parámetros de la experiencia.
create or replace function public.reward_config_set(p_key text, p_amount int, p_enabled boolean)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_creator() then raise exception 'Solo el Creador edita la experiencia.'; end if;
  update public.reward_config
     set amount = greatest(0, coalesce(p_amount, amount)),
         enabled = coalesce(p_enabled, enabled)
   where key = p_key;
end; $$;
grant execute on function public.reward_config_set(text,int,boolean) to authenticated;

-- Estadísticas de la experiencia (Creador): cuántas Almas cobraron cada recompensa.
create or replace function public.reward_stats()
returns jsonb language plpgsql security definer set search_path='public' stable as $$
declare v jsonb;
begin
  if not public.is_creator() then raise exception 'Solo el Creador ve las métricas.'; end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v from (
    select split_part(reward_key,':',1) as key,
           count(*)::int as claims,
           coalesce(sum(amount),0)::int as total
    from public.alma_rewards
    group by split_part(reward_key,':',1)
  ) t;
  return v;
end; $$;
grant execute on function public.reward_stats() to authenticated;
