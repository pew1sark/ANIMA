-- ===========================================================
-- 0125 · Tres funciones de REI quedaron abiertas a `anon`
-- -----------------------------------------------------------
-- `rei_banda`, `rei_decision` y `rei_dias_en_mercado` se escribieron en
-- 0122 con su `grant execute ... to authenticated` pero SIN el `revoke
-- ... from public, anon` que llevan todas las demás.
--
-- PostgreSQL concede EXECUTE a PUBLIC por defecto al crear una función.
-- Nombrar a `authenticated` en el grant no le quita nada a nadie: solo
-- agrega. Así que las tres quedaron ejecutables por `anon`.
--
-- Ninguna filtra datos —las tres son aritmética sobre sus argumentos y
-- no leen una sola tabla— pero este repositorio lleva contada su deuda
-- de seguridad («47 funciones heredadas ejecutables por anon») y
-- sumarle tres más, sabiéndolo, sería empezar a mentir en esa cuenta.
--
-- 0122 ya quedó corregida en el repositorio, así que una réplica desde
-- cero nace bien. Esta migración existe para las bases donde 0122 ya
-- corrió — que es el caso de producción.
-- ===========================================================

revoke execute on function public.rei_banda(numeric)                    from public, anon;
revoke execute on function public.rei_decision(text)                    from public, anon;
revoke execute on function public.rei_dias_en_mercado(date, date, text) from public, anon;

grant  execute on function public.rei_banda(numeric)                    to authenticated;
grant  execute on function public.rei_decision(text)                    to authenticated;
grant  execute on function public.rei_dias_en_mercado(date, date, text) to authenticated;
