-- 0099b · Un aviso que se comía dos palabras.
--
-- El aviso de tipo de cambio ausente decía "distinta a la del
-- modeloacsin tasa registrada". Es el texto que un asesor le muestra
-- a su cliente cuando le explica por qué no puede consolidar, así
-- que importa que esté bien escrito.
--
-- Se corrige sobre la definición que ya está en la base en vez de
-- volver a pegar la función entera: menos superficie para
-- equivocarse, y queda escrito qué cambió exactamente.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ci_validar_modelo';

  if v_src is null then raise exception 'ci_validar_modelo no existe'; end if;
  if position('modeloacsin tasa' in v_src) = 0 then
    raise notice 'ya estaba corregido';
    return;
  end if;

  execute replace(v_src, 'del modeloacsin tasa registrada', 'del modelo y sin tasa registrada');
end $$;
