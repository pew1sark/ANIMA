# Exportar migraciones aplicadas

Supabase guarda el SQL de cada migración aplicada en `supabase_migrations.schema_migrations`.
Si falta algún archivo en `supabase/migrations/`, se recupera desde ahí:

```sql
select version, name, array_to_string(statements, E';\n') as sql
from supabase_migrations.schema_migrations
where name in ('0047_commerce_operacion','0048_commerce_vistas_base',
               '0049_commerce_vistas_operativas','0050_capa_compatibilidad_jliz')
order by version;
```

Guardar cada resultado como `supabase/migrations/<name>.sql`.

Las migraciones 0040 a 0046 y 0051 a 0052 ya están en el repositorio.
