# Base de datos

Proyecto Supabase: `jwxeowowuxmijuexdrua` · PostgreSQL 17.

## Núcleo de plataforma (migración 0040)

| Tabla | Qué guarda |
|---|---|
| `profiles` | identidad de plataforma, 1:1 con `auth.users` |
| `platform_admins` | Super Admins. Autoridad sobre toda la plataforma |
| `companies` | **el tenant**: nombre, slug, estado, país, moneda, branding, settings, `product_line_id` y `tenant_type` |
| `roles` | catálogo de roles con `level` numérico |
| `permissions` | catálogo de permisos por módulo |
| `role_permissions` | qué permisos trae cada rol |
| `company_members` | qué usuario pertenece a qué empresa y con qué rol |
| `modules` | catálogo de módulos de la plataforma |
| `company_modules` | qué módulos tiene encendidos cada empresa |
| `audit_logs` | registro inmutable de acciones |

`audit_logs.company_id` nulo significa acción de plataforma (Super Admin).

## Relaciones

```
auth.users ─1:1─ profiles
auth.users ─1:N─ company_members ─N:1─ companies
company_members ─N:1─ roles ─N:M─ permissions
companies ─N:M─ modules  (via company_modules)
companies ─1:N─ audit_logs
```

## Líneas de producto (migración 0067)

| Tabla | Qué guarda |
|---|---|
| `product_lines` | **STUDIO** y **COMPANY**. Una organización pertenece a una. |
| `plans` | 3 tramos de Studio · 4 de Company. `plans.slug` es único global. |
| `plan_modules` | qué módulos trae cada plan |

`industry` sigue en la tabla con `active = false`: se retiró, no se borró, para
conservar el historial y poder revertir.

## De quién son los datos: `tenant_type` (migración 0068)

`companies.tenant_type` distingue dos formas de ser tenant:

| Valor | Qué significa | Casos |
|---|---|---|
| `operator` | administra **su propia** data | ANIMA, Bilagay |
| `advisor` | administra la de **terceros** | un contador o asesor con varios clientes |

Es un **eje distinto al de la línea de producto**. La línea dice *qué hace* la
organización; `tenant_type` dice *de quién son los datos*. Un asesor puede estar
en COMPANY y ser `advisor` a la vez.

`advisor` habilita la capa `clients → locations → transacciones` de la Fase 6.
Mientras no exista esa capa, el valor no cambia el comportamiento de nada: solo
está declarado, y `is_advisor()` permite preguntarlo.

## Herencia de ANIMA

Las tablas de ANIMA siguen intactas y funcionando. Están en dos grupos:

**Tablas de trabajo — ya con `company_id`** (migración 0043): `projects`, `clients`,
`quotes`, `tasks`, `agenda`, `finance_entries`. Conviven con `alma_id` y tienen dos
políticas: la vieja por alma y la nueva por empresa.

> **Decisión pendiente.** Mientras las dos políticas convivan, una misma fila es
> alcanzable por dos caminos con reglas distintas. Hay que definir cuál manda antes
> de meter una segunda organización en estas tablas.

**Comunidad y juego — aún por `alma_id`**: `almas`, `portfolio`, `trajectory`,
`soul_timeline`, `echoes`, `posts`, `clans`, `santuarios`, `world_tree_*`, `badges`,
`alma_rewards`, `proposals`/`votes`, `whispers`. Son del **sitio público**, no de la
plataforma, y ahí se quedan: no pertenecen a un producto B2B multiempresa.

## Convenciones

- Migraciones numeradas: `0040_`, `0041_`, … Nunca se edita una ya aplicada.
- Toda clave foránea lleva índice de cobertura.
- `updated_at` se mantiene con el trigger `touch_updated_at()`.
- Enums para estados cerrados; `jsonb` solo para configuración abierta.
