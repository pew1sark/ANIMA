begin;

-- ---------------------------------------------------------------------------
-- La solicitud también se hace desde la portada
-- ---------------------------------------------------------------------------
-- Hasta ahora la única puerta para pedir acceso era el login de /app/: quien
-- llegaba al sitio sin cuenta solo tenía un `mailto:`. Ahora el formulario
-- vive en la portada, que es donde de verdad pasa la gente que todavía no es
-- cliente, y trae una oferta colgando — un mes gratis.
--
-- Con dos formularios importa de cuál vino cada solicitud, y con una oferta
-- importa que quede escrita en la fila: al abrir la cuenta hay que honrarla,
-- y una promesa que solo existe en una portada no se puede honrar.

alter table public.access_requests
  add column if not exists telefono text,
  add column if not exists fuente   text not null default 'login'
    check (fuente in ('login', 'portada')),
  add column if not exists promo    text
    check (promo is null or promo in ('mes-extra'));

comment on column public.access_requests.telefono is
  'Opcional. Acá la conversación empieza por WhatsApp más veces que por correo.';
comment on column public.access_requests.fuente is
  'Dónde se llenó: el login de /app/ o la portada del sitio.';
comment on column public.access_requests.promo is
  'La oferta con la que entró. Hoy solo `mes-extra`: un mes gratis sobre el plan que se contrate.';

commit;
