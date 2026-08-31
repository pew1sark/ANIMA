-- 0072 · SARK deja de ser miembro de Pescaderia Bilagay.
--
-- Bilagay es un CLIENTE de la plataforma, no una empresa de SARK. Ser miembro
-- Propietario le daba acceso a sus ventas, clientes, compras e inventario, que
-- no le corresponde ver.
--
-- Lo que SI conserva, por ser platform_admin: la empresa, su plan, su
-- suscripcion, sus modulos, sus cobros y pagos. Es decir, la relacion comercial
-- —que es lo que administra— y nada de la operacion del cliente.
--
-- Esto vale SOLO para esta base (la plataforma nueva). El proyecto donde Bilagay
-- opera hoy, owfvuusxfvzjgxfmllpt, NO se toca: ahi sigue en desarrollo y SARK
-- necesita su acceso.
--
-- Cuando Bilagay migre, sus tres usuarios se dan de alta y entran a lo suyo.
-- Mientras tanto la empresa queda sin miembros, que es correcto: nadie de
-- Bilagay usa todavia esta plataforma.

do $$
declare v_user uuid; v_company uuid; v_borradas int;
begin
  select id into v_user    from auth.users        where email = 'sarkgraff@gmail.com';
  select id into v_company from public.companies  where slug  = 'bilagay';
  if v_user is null or v_company is null then
    raise notice 'No estan el usuario o la empresa: no se hace nada';
    return;
  end if;

  delete from public.company_members
   where user_id = v_user and company_id = v_company;
  get diagnostics v_borradas = row_count;

  if v_borradas > 0 then
    insert into public.audit_logs (company_id, user_id, action, entity, entity_id, metadata)
    values (v_company, v_user, 'QUITAR_MIEMBRO', 'company_members', v_company::text,
            jsonb_build_object(
              'motivo', 'Bilagay es cliente de la plataforma, no una empresa de SARK.',
              'conserva', 'acceso de platform_admin a la relacion comercial',
              'pierde',   'acceso a la operacion del cliente',
              'alcance',  'solo la plataforma; el proyecto de JLIZ no se toca'));
  end if;
end $$;
