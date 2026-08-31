# Migraciones: estado del versionado

Supabase guarda el SQL de cada migración aplicada en
`supabase_migrations.schema_migrations`. Todo lo aplicado está ahí, íntegro.

## Estado — 31 de agosto de 2026

**Todas las migraciones aplicadas tienen su archivo en el repo.** Comprobado
comparando la lista de `schema_migrations` contra `supabase/migrations/`: 0
faltantes.

El 31-08-2026 se recuperaron 16 archivos que solo existían dentro del proyecto
Supabase. Cada uno se exportó en base64 y se verificó con **md5 contra la base**:

| Migración | md5 | bytes |
|---|---|---|
| `0012_align_clan_permissions` | `2bc97a16488c8f871fad35545252b336` | 786 |
| `0047_commerce_operacion` † | `494572ae8f5fa1d459ebdb2bc8a4fab2` | 25.996 |
| `0053_commerce_ciclo_pedido` | `cbf08ebb57cd8abe8d8d113251c52278` | 10.102 |
| `0054_commerce_inventario_funciones` | `2a2a9792230c7f652164fcbcf49c771f` | 9.299 |
| `0055_commerce_finish_preparation` | `3cd7ff218052ec22aa2994d36c035073` | 5.944 |
| `0056_commerce_compras` | `20cf1178c15b918aafa323cb558a7f49` | 12.704 |
| `0057_commerce_cobros_y_precios` | `a2bea1a402a11c7d5092a65df6f18482` | 9.432 |
| `0058_commerce_paneles_y_margenes` | `2f172dff0dd25e18dfb0c3cddbd4a61a` | 9.275 |
| `0059_levantamiento_funciones` | `8cd6adab3f7c39066fc88636ffdde8a9` | 6.860 |
| `0060_commerce_proceso_y_auditoria` | `e3ccc406fac5b25e8f953b552f0172ea` | 11.191 |
| `0061_lineas_producto_y_features` | `cce4775d716dcfb0885a8677fce00bba` | 8.475 |
| `0062_campos_personalizados` | `cdd579fe13fed6b4707ae0bcec345099` | 8.500 |
| `0063_onboarding_dirigido_por_el_cliente` | `fb4c8369646a07ddbf56efbc24d03360` | 9.643 |
| `0064_workflows_configurables` | `546a1094e134973ba68f1d119c76f352` | 12.514 |
| `0065_estado_inicial_automatico` | `67112df7ee9f803b41b8f19d06e4595f` | 1.676 |
| `0066_kpis_con_empresa_explicita` | `11cb7bcd31c829760deeb2e7fecfbce0` | 5.945 |

† La 0047 sí tenía archivo, pero era **solo la cabecera**: 3.390 bytes de los
25.993 aplicados. Le faltaban las 21 tablas del motor operativo. Ahora está completa.

**Por qué importaba:** sin estos archivos la base funcionaba igual, pero el motor
operativo portado (21 tablas, 14 vistas y 52 funciones) no se podía recrear en un
proyecto nuevo. Dependía de que `jwxeowowuxmijuexdrua` siguiera vivo.

## Cómo volver a exportar, si hiciera falta

En el SQL Editor de Supabase, una por una:

```sql
select array_to_string(statements, E';\n') as sql
from supabase_migrations.schema_migrations
where name = '00XX_nombre_de_la_migracion';
```

O todas de una vez, con la contraseña de base de datos:

```bash
psql "postgresql://postgres:[CONTRASEÑA]@db.jwxeowowuxmijuexdrua.supabase.co:5432/postgres" -At -c \
"select name || E'\n' || array_to_string(statements, E';\n') from supabase_migrations.schema_migrations
 where version >= '20260822220853' order by version"
```

## Regla

Toda migración aplicada por MCP o desde el SQL Editor **se versiona en el mismo
día**. El historial de Supabase es un respaldo, no la fuente de verdad.
