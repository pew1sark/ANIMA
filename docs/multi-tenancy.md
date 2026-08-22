# Multi-tenancy

## La regla

> Un usuario de la Empresa A no puede leer, insertar, modificar ni borrar
> información de la Empresa B. **Lo impide PostgreSQL, no el frontend.**

## Cómo se consigue

1. Toda tabla de negocio lleva `company_id uuid not null references companies(id)`.
2. Toda tabla tiene RLS activo.
3. Las políticas no confían en un `company_id` enviado desde el navegador:
   preguntan a la base si el usuario pertenece a esa empresa.

## Funciones de apoyo

Todas son `SECURITY DEFINER` con `search_path` fijo, y **ninguna** concede `EXECUTE`
al rol `anon`:

| Función | Devuelve |
|---|---|
| `is_platform_admin()` | si el usuario es Super Admin |
| `current_company_ids()` | las empresas activas del usuario |
| `is_company_member(company)` | si pertenece a esa empresa |
| `company_role_level(company)` | su nivel de rol allí (0 si no pertenece) |
| `has_company_level(company, min)` | si alcanza ese nivel — o es Super Admin |

Son `SECURITY DEFINER` por una razón concreta: una política sobre `company_members` que
consultara `company_members` entraría en recursión infinita.

## Plantilla para una tabla nueva

```sql
create table public.<tabla> (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- … columnas del dominio …
  created_at timestamptz not null default now()
);
create index <tabla>_company_idx on public.<tabla>(company_id);
alter table public.<tabla> enable row level security;

create policy <tabla>_select on public.<tabla> for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

create policy <tabla>_write on public.<tabla> for all to authenticated
  using (public.has_company_level(company_id, 40))
  with check (public.has_company_level(company_id, 40));
```

Usa `(select auth.uid())` y nunca `auth.uid()` suelto: la segunda forma reevalúa el JWT
**en cada fila** y hunde el rendimiento a escala.

## Niveles de rol

```
owner 100 · admin 80 · manager 60 · employee 40 · viewer 20
```

Se comparan con `>=`. Nunca compares por slug: el día que agregues un rol intermedio,
todas las comparaciones por nombre se rompen.

## Prueba de aislamiento

Ejecutada el 22-08-2026 sobre la base real: **13 comprobaciones, 13 correctas.**
Ver `security.md`. Repetir esta prueba después de cada migración que toque políticas.
