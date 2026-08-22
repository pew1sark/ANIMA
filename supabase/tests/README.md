# Pruebas de aislamiento multiempresa

`isolation_test.sql` crea dos usuarios y dos empresas de prueba, comprueba que
ninguna ve nada de la otra, y **elimina todo al terminar** (incluso si una
comprobación falla).

Se ejecuta con el MCP de Supabase (`execute_sql`) y devuelve una tabla de
resultados. Al terminar hay que **borrar la función**:

```sql
drop function if exists public.__isolation_test();
```

Dejarla viva sería un agujero: inserta en `auth.users`.

Repetir esta prueba después de CADA migración que toque políticas RLS.
Última ejecución: 22-08-2026 · 13 de 13 correctas.
