-- 0076 · Las 21 Almas de la Alpha quedan en pausa, no borradas.
--
-- ANIMA pasa a ser la plataforma, y el ingreso se reabre de a poco por
-- invitacion. Mientras tanto, las cuentas de la Alpha no entran.
--
-- POR QUE NO SE BORRAN. `almas.user_id` apunta a auth.users con ON DELETE
-- CASCADE, igual que soul_timeline, soul_badges, activity_log, votes, feedback
-- y profiles. Borrar una cuenta borraria su Alma y toda su historia: su
-- trayectoria, sus insignias, sus huellas en el Arbol. Es justo lo contrario de
-- conservarlas.
--
-- Lo que se hace es cerrar la puerta: banned_until en una fecha lejana. La
-- cuenta y todos sus datos quedan intactos, y reincorporar a alguien es un
-- UPDATE de una linea:
--
--   update auth.users set banned_until = null where email = '...';
--
-- SARK queda fuera de la pausa: es quien administra la plataforma.

do $$
declare v_pausadas int;
begin
  update auth.users
     set banned_until = timestamptz '2099-12-31 00:00:00+00'
   where email <> 'sarkgraff@gmail.com'
     and banned_until is null;
  get diagnostics v_pausadas = row_count;

  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
  select null, (select id from auth.users where email = 'sarkgraff@gmail.com'),
         'PAUSAR_ALMAS_ALPHA', 'auth.users', null,
         jsonb_build_object(
           'cuentas_pausadas', v_pausadas,
           'motivo', 'ANIMA pasa a ser la plataforma; el ingreso se reabre por invitacion.',
           'datos', 'intactos: no se borro ninguna cuenta ni ninguna Alma',
           'revertir', 'update auth.users set banned_until = null where email = ...');

  raise notice 'Almas en pausa: %', v_pausadas;
end $$;
