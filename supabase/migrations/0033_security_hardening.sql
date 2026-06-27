-- 0033 · Hardening de seguridad para repo publico
-- Objetivo:
--   1. Cerrar EXECUTE implicito de PUBLIC/anon en RPC sensibles.
--   2. Mantener publicas solo las RPC de lectura/gesto publico intencional.
--   3. Hacer que give_spark respete portafolios privados.
--
-- No borra datos, no cambia buckets y no modifica rutas de archivos.

-- Helpers y RPC autenticadas: nunca deben depender del permiso PUBLIC por defecto.
revoke execute on function public.is_creator() from public, anon;
grant execute on function public.is_creator() to authenticated;

revoke execute on function public.in_my_clan(text) from public, anon;
grant execute on function public.in_my_clan(text) to authenticated;

revoke execute on function public.leads_clan(text) from public, anon;
grant execute on function public.leads_clan(text) to authenticated;

revoke execute on function public.in_my_santuario(text) from public, anon;
grant execute on function public.in_my_santuario(text) to authenticated;

revoke execute on function public.admin_santuario(text) from public, anon;
grant execute on function public.admin_santuario(text) to authenticated;

revoke execute on function public.can_edit_clan(text) from public, anon;
grant execute on function public.can_edit_clan(text) to authenticated;

revoke execute on function public.is_clan_admin(text) from public, anon;
grant execute on function public.is_clan_admin(text) to authenticated;

revoke execute on function public.log_timeline(text, text, text) from public, anon;
grant execute on function public.log_timeline(text, text, text) to authenticated;

revoke execute on function public.emit_echo(text, text) from public, anon;
grant execute on function public.emit_echo(text, text) to authenticated;

revoke execute on function public.award_badge(text) from public, anon;
grant execute on function public.award_badge(text) to authenticated;

revoke execute on function public.log_activity(text, jsonb) from public, anon;
grant execute on function public.log_activity(text, jsonb) to authenticated;

revoke execute on function public.add_essence(integer) from public, anon;
grant execute on function public.add_essence(integer) to authenticated;

revoke execute on function public.claim_time_badges() from public, anon;
grant execute on function public.claim_time_badges() to authenticated;

revoke execute on function public.complete_awakening() from public, anon;
grant execute on function public.complete_awakening() to authenticated;

revoke execute on function public.founder_stats() from public, anon;
grant execute on function public.founder_stats() to authenticated;

revoke execute on function public.world_monitor() from public, anon;
grant execute on function public.world_monitor() to authenticated;

revoke execute on function public.create_proposal(text, text) from public, anon;
grant execute on function public.create_proposal(text, text) to authenticated;

revoke execute on function public.cast_vote(uuid, integer) from public, anon;
grant execute on function public.cast_vote(uuid, integer) to authenticated;

revoke execute on function public.list_proposals() from public, anon;
grant execute on function public.list_proposals() to authenticated;

revoke execute on function public.world_tree_record(text, text, uuid, int, text, text) from public, anon;
grant execute on function public.world_tree_record(text, text, uuid, int, text, text) to authenticated;

revoke execute on function public.toggle_follow(uuid) from public, anon;
grant execute on function public.toggle_follow(uuid) to authenticated;

revoke execute on function public.toggle_post_spark(uuid) from public, anon;
grant execute on function public.toggle_post_spark(uuid) to authenticated;

revoke execute on function public.send_signal(uuid, text) from public, anon;
grant execute on function public.send_signal(uuid, text) to authenticated;

revoke execute on function public.mark_whispers_read() from public, anon;
grant execute on function public.mark_whispers_read() to authenticated;

revoke execute on function public.claim_reward(text) from public, anon;
grant execute on function public.claim_reward(text) to authenticated;

revoke execute on function public.reward_config_set(text, int, boolean) from public, anon;
grant execute on function public.reward_config_set(text, int, boolean) to authenticated;

revoke execute on function public.reward_stats() from public, anon;
grant execute on function public.reward_stats() to authenticated;

revoke execute on function public.join_clan_by_code(text) from public, anon;
grant execute on function public.join_clan_by_code(text) to authenticated;

revoke execute on function public.clan_create(text, text, text) from public, anon;
grant execute on function public.clan_create(text, text, text) to authenticated;

revoke execute on function public.clan_update(text, text, text) from public, anon;
grant execute on function public.clan_update(text, text, text) to authenticated;

revoke execute on function public.clan_rename(text, text) from public, anon;
grant execute on function public.clan_rename(text, text) to authenticated;

revoke execute on function public.clan_delete(text) from public, anon;
grant execute on function public.clan_delete(text) to authenticated;

revoke execute on function public.clan_set_role(uuid, text) from public, anon;
grant execute on function public.clan_set_role(uuid, text) to authenticated;

revoke execute on function public.clan_remove_member(uuid) from public, anon;
grant execute on function public.clan_remove_member(uuid) to authenticated;

revoke execute on function public.clan_add_member(uuid, text) from public, anon;
grant execute on function public.clan_add_member(uuid, text) to authenticated;

revoke execute on function public.clan_leave() from public, anon;
grant execute on function public.clan_leave() to authenticated;

revoke execute on function public.santuario_leave() from public, anon;
grant execute on function public.santuario_leave() to authenticated;

revoke execute on function public.santuario_create(text, text, text) from public, anon;
grant execute on function public.santuario_create(text, text, text) to authenticated;

revoke execute on function public.santuario_update(text, text, text) from public, anon;
grant execute on function public.santuario_update(text, text, text) to authenticated;

revoke execute on function public.santuario_set_role(uuid, text) from public, anon;
grant execute on function public.santuario_set_role(uuid, text) to authenticated;

revoke execute on function public.santuario_add_member(uuid, text) from public, anon;
grant execute on function public.santuario_add_member(uuid, text) to authenticated;

revoke execute on function public.santuario_remove_member(uuid) from public, anon;
grant execute on function public.santuario_remove_member(uuid) to authenticated;

revoke execute on function public.santuario_gen_invite(text, text) from public, anon;
grant execute on function public.santuario_gen_invite(text, text) to authenticated;

revoke execute on function public.santuario_join_by_code(text) from public, anon;
grant execute on function public.santuario_join_by_code(text) to authenticated;

-- Funcion de trigger: no debe invocarse como API publica.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RPC publicas intencionales.
grant execute on function public.souls_count() to anon, authenticated;
grant execute on function public.souls_by_country() to anon, authenticated;
grant execute on function public.storage_quota(text) to anon, authenticated;
grant execute on function public.world_tree_get() to anon, authenticated;

-- Chispas anonimas: se mantienen por compatibilidad con portafolios publicos,
-- pero solo suman a Almas cuya vista publica no este desactivada.
create or replace function public.give_spark(p_alma uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sparks integer;
  v_uid    uuid;
  v_name   text;
  v_ctry   text;
  v_new    boolean := false;
begin
  update public.almas
     set sparks = coalesce(sparks, 0) + 1
   where id = p_alma
     and coalesce(visibility->>'public', 'true') <> 'false'
  returning sparks, user_id, name, country into v_sparks, v_uid, v_name, v_ctry;

  if v_sparks is null then
    return null;
  end if;

  if v_uid is not null then
    insert into public.soul_badges (user_id, code) values (v_uid, 'eco_vivo')
      on conflict do nothing;
    get diagnostics v_new = row_count;
    if v_new then
      insert into public.soul_timeline (user_id, event_type, title, description)
      values (v_uid, 'eco', 'Recibiste tu primer Eco', 'Otra Alma aprecio tu trabajo.');
      insert into public.echoes (alma_id, alma_name, country, kind, text)
      values (p_alma, split_part(coalesce(v_name,'Alma'),' ',1), v_ctry, 'eco',
              '* ' || split_part(coalesce(v_name,'Alma'),' ',1) || ' recibio una senal');
    end if;
  end if;

  return v_sparks;
end;
$$;
revoke execute on function public.give_spark(uuid) from public;
grant execute on function public.give_spark(uuid) to anon, authenticated;
