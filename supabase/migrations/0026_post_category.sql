-- 0026 · Muro: categoría de publicación (para filtrar/buscar a futuro)
-- Aditivo y seguro: columna nullable. Las Huellas previas quedan intactas.
alter table public.posts add column if not exists category text;
