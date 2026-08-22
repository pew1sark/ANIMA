# Seguridad

## Principios

1. **La seguridad vive en PostgreSQL.** El frontend oculta; la base prohíbe.
2. **Nunca un secreto en el repositorio.** Solo claves publicables.
3. **La auditoría es inmutable.** `audit_logs` no tiene políticas de UPDATE ni DELETE.
4. **Super Admin ≠ Company Admin.** Tablas distintas, autoridades distintas.

## Variables de entorno

| Prefijo | Dónde puede estar | Ejemplo |
|---|---|---|
| `VITE_*` | navegador; se asume público | `VITE_SUPABASE_ANON_KEY` |
| sin prefijo | solo servidor / Edge Functions / CI | `SUPABASE_SERVICE_ROLE_KEY` |

`.env.local` nunca se versiona. `.env.example` lleva **nombres, jamás valores**.

**Nunca** en este repositorio: `service_role`, secretos de pasarelas de pago, tokens de
webhook, claves privadas de API.

## Prueba de aislamiento · 22-08-2026

Ejecutada contra la base real con dos usuarios y dos empresas de prueba, eliminados al
terminar. Resultado: **13 / 13**.

| # | Prueba | Resultado |
|---|---|---|
| 1 | A ve únicamente su empresa | OK |
| 2 | A no ve la empresa de B | OK |
| 3 | A no lee la auditoría de B | OK |
| 4 | A no ve los miembros de B | OK |
| 5 | A no puede escribir en la empresa B | OK · rechazado por RLS |
| 6 | A no puede modificar la empresa B | OK · 0 filas |
| 7 | A no puede borrar la empresa B | OK · 0 filas |
| 8 | B ve únicamente su empresa | OK |
| 9 | B no ve la empresa de A | OK |
| 10 | El Super Admin ve ambas | OK |
| 11 | Sin sesión no se ve ninguna empresa | OK |
| 12 | `anon` no puede llamar `is_platform_admin()` | OK · EXECUTE denegado |
| 13 | Limpieza de datos de prueba | OK |

## Deuda de seguridad pendiente (de la auditoría del 22-08-2026)

Heredada de antes de la plataforma. **No afecta al núcleo nuevo**, pero hay que resolverla
antes de meter una segunda empresa en las tablas antiguas:

- 🔴 **6 vistas `SECURITY DEFINER` en JLIZ BUSINESS** (`v_pedidos_operativos`,
  `v_stock_operativo`, `v_hoja_ruta`, `v_lotes_operativos`,
  `v_pedido_items_operativos`, `v_reportes_operativos`). Ignoran el RLS de quien
  consulta. Deben pasar a `SECURITY INVOKER` antes de migrar sus datos aquí.
- 🟠 **34 funciones heredadas de ANIMA ejecutables por `anon`** vía `/rest/v1/rpc/`.
  Revisar una a una y revocar `EXECUTE`. Las del núcleo 0040 ya nacen revocadas.
- 🟠 **Protección de contraseñas filtradas desactivada** en Supabase Auth.
- 🟠 **26 políticas antiguas con `auth.uid()`** sin envolver en `(select …)`.

## Storage

Bucket `companies`, **privado**. Ruta obligatoria:

```
companies/<company_id>/<área>/<archivo>
```

Las políticas leen el `company_id` de la primera carpeta de la ruta y comprueban
pertenencia. Borrar exige nivel `manager` (60).
