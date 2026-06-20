-- ===========================================================
-- ANIMA TSC — Migración 0008: Storage de medios (fotos en alta calidad)
--
-- Crea el bucket público "media" para que cada Alma suba sus fotos
-- de portafolio, foto de perfil y banner en ALTA CALIDAD (no más
-- pegar enlaces). Lectura pública (portafolios compartibles); cada
-- quien sólo escribe dentro de su propia carpeta /<uid>/...
--
-- CÓMO APLICAR:
--   Supabase → SQL Editor → New query → pega TODO → Run.  (Idempotente)
-- ===========================================================

-- ---------- 1. Bucket público "media" ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- ---------- 2. Lectura pública ----------
-- Cualquiera puede ver las imágenes (portafolios públicos compartibles).
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select
  using (bucket_id = 'media');

-- ---------- 3. Subir: sólo a TU carpeta (/<uid>/...) ----------
-- La sesión autenticada sólo puede escribir bajo su propio user id.
drop policy if exists "media_auth_insert" on storage.objects;
create policy "media_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media_auth_delete" on storage.objects;
create policy "media_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Fin 0008.
