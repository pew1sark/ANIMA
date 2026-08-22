# Base de datos

Proyecto Supabase: `jwxeowowuxmijuexdrua` · PostgreSQL 17.

## Núcleo de plataforma (migración 0040)

| Tabla | Qué guarda |
|---|---|
| `profiles` | identidad de plataforma, 1:1 con `auth.users` |
| `platform_admins` | Super Admins. Autoridad sobre toda la plataforma |
| `companies` | **el tenant**: nombre, slug, estado, país, moneda, branding, settings |
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

## Herencia de ANIMA

Las ~40 tablas de ANIMA (`almas`, `projects`, `clients`, `quotes`, `echoes`, …) siguen
intactas y funcionando. Su aislamiento actual es **por usuario** (`alma_id`). El retrofit
a `company_id` es la siguiente fase y se hará tabla por tabla, con backfill: cada Alma
pasa a ser miembro de la empresa que corresponda.

## Convenciones

- Migraciones numeradas: `0040_`, `0041_`, … Nunca se edita una ya aplicada.
- Toda clave foránea lleva índice de cobertura.
- `updated_at` se mantiene con el trigger `touch_updated_at()`.
- Enums para estados cerrados; `jsonb` solo para configuración abierta.
