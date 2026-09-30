-- 0134b · pg_net quedó registrada en el esquema public (linter 0014).
-- Sus funciones viven en el esquema `net` de todas formas; se reinstala
-- registrada en `extensions`. El cron solo nombra net.http_post al correr,
-- así que no hay nada que rehacer en cron.job.
-- (La 0134 ya la crea en `extensions`; esto corrige la base donde la 0134
-- original se aplicó sin esquema.)
drop extension if exists pg_net;
create extension pg_net with schema extensions;
