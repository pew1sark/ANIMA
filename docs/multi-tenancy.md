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
| `has_company_level(company, min)` | si alcanza ese nivel **en esa empresa**. Nada más |

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

## El Super Admin no es un empleado del cliente (migración 0073)

Hasta la 0073, `has_company_level()` empezaba con `is_platform_admin() or …`. Eso
significaba que **el Super Admin pasaba toda política que la usara** — es decir,
las 39 tablas de negocio. Quitarle la membresía a alguien no le quitaba nada:
seguía entrando por ahí. Y no se veía revisando el texto de las políticas, porque
el permiso entraba de forma indirecta.

Hoy la separación es explícita:

| | Qué alcanza |
|---|---|
| **Operación del cliente** — productos, clientes, pedidos, facturas, compras, inventario, pagos, proyectos, cotizaciones | solo sus miembros |
| **Configuración** — módulos, campos personalizados, flujos, levantamiento, invitaciones | sus administradores **y** el Super Admin |
| **Relación comercial** — empresa, plan, suscripción, cobros, pagos a la plataforma | el Super Admin, y el cliente lo suyo |

La regla, dicha corta: **el Super Admin administra el software; no opera la
empresa.** Puede implementar un cliente sin poder mirarle las ventas.

Al escribir una política nueva sobre una tabla de negocio, `has_company_level` es
lo correcto y ya no abre nada de más. Si la tabla es de configuración o de la
relación comercial, hay que agregar `or public.is_platform_admin()` a mano — y esa
decisión debe ser deliberada.

## Niveles de rol

```
owner 100 · admin 80 · manager 60 · employee 40 · viewer 20
```

Se comparan con `>=`. Nunca compares por slug: el día que agregues un rol intermedio,
todas las comparaciones por nombre se rompen.

## Prueba de aislamiento

Ejecutada el 22-08-2026 sobre la base real: **13 comprobaciones, 13 correctas.**
Ver `security.md`. Repetir esta prueba después de cada migración que toque políticas.
