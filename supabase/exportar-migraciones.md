# Migraciones: qué está en el repo y qué hay que exportar

Supabase guarda el SQL de cada migración aplicada en
`supabase_migrations.schema_migrations`. Todo lo aplicado está ahí, íntegro.

## Estado de los archivos

| Migración | Archivo en el repo |
|---|---|
| 0040–0046 | ✅ completo |
| **0047** `commerce_operacion` | ⚠️ solo cabecera |
| 0048, 0049 | ✅ completo |
| 0050 | ✅ completo |
| 0051, 0052 | ✅ completo |
| **0053** `commerce_ciclo_pedido` | ⚠️ falta |
| **0054** `commerce_inventario_funciones` | ⚠️ falta |
| **0055** `commerce_finish_preparation` | ⚠️ falta |

## Cómo exportarlas

Ejecutar en el SQL Editor de Supabase, una por una:

```sql
select array_to_string(statements, E';\n') || ';' as sql
from supabase_migrations.schema_migrations
where name = '0047_commerce_operacion';
```

Guardar el resultado como `supabase/migrations/0047_commerce_operacion.sql`.
Repetir con `0053_commerce_ciclo_pedido`, `0054_commerce_inventario_funciones`
y `0055_commerce_finish_preparation`.

O de una vez, con la contraseña de base de datos:

```bash
psql "postgresql://postgres:[CONTRASEÑA]@db.jwxeowowuxmijuexdrua.supabase.co:5432/postgres" -At -c \
"select name || E'\n' || array_to_string(statements, E';\n') from supabase_migrations.schema_migrations
 where name in ('0047_commerce_operacion','0053_commerce_ciclo_pedido',
                '0054_commerce_inventario_funciones','0055_commerce_finish_preparation')"
```

**Por qué importa:** sin estos archivos la base actual funciona igual, pero no se
puede recrear desde cero en un proyecto nuevo. Es deuda, no un fallo.
