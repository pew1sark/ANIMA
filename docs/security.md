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

## Prueba de aislamiento · 01-09-2026

Ejecutada contra la base real con dos usuarios y dos empresas de prueba, eliminados al
terminar. Resultado: **13 / 13**, antes y después de la migración `0082`.

`commerce_isolation.sql` el mismo día: **8 / 8**. Entre la ejecución anterior
(22-08-2026) y esta habían entrado 15 migraciones que tocaban políticas sin que
nadie volviera a comprobar el aislamiento. No había roto nada, pero eso se supo
después de mirar, no antes.

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

## Cerrado en la 0082 · 01-09-2026

- ✅ **`__wf_test()` fuera de producción.** Una función de pruebas del motor de
  flujos había quedado viva con `EXECUTE` para `anon` y `authenticated`,
  `search_path` mutable, y un cuerpo que suplantaba a un usuario concreto para
  escribir en una empresa cliente. Era el único aviso de `search_path` mutable de
  toda la base; ahora son cero.
- ✅ **`companies_insert` restringida a `is_platform_admin()`.** Antes solo exigía
  `created_by = auth.uid()`: cualquier usuario autenticado podía crear su empresa
  y quedar de `owner` por el disparador `handle_new_company`, saltándose plan y
  suscripción. El alta va por `crear_cliente()`, que sigue funcionando porque es
  `SECURITY DEFINER` y `companies` no tiene `FORCE ROW LEVEL SECURITY`.

## Deuda de seguridad pendiente

Revisada contra la base el 01-09-2026.

- ✅ **RESUELTO — las vistas ya respetan RLS.** Las 6 vistas `SECURITY DEFINER`
  heredadas de JLIZ que figuraban aquí como 🔴 pasaron a `security_invoker`. Se
  comprobó en la base: **las 15 vistas del esquema lo tienen activo**.
- 🟠 **41 funciones ejecutables por `anon`** vía `/rest/v1/rpc/` — no 34: la deuda
  creció. Revisadas por muestra, la mayoría se autoprotege (`is_clan_admin()`,
  `is_creator()`, `admin_santuario()`) o depende de `auth.uid()`, que es nulo para
  `anon`. Las del levantamiento (`survey_*`, `intake_*`) son públicas **a
  propósito**: el cliente responde con un enlace, sin cuenta. Falta recorrerlas una
  a una y revocar las que no deban serlo.
- 🟠 **`give_spark()` escribe sin sesión y sin freno.** Es intencionadamente
  pública —un visitante da su Chispa desde el portafolio, sin cuenta— y el único
  tope es `localStorage`, que se salta cualquiera. No hay fuga ni crecimiento de
  filas: `soul_badges` y `echoes` solo se escriben la primera vez. Lo que se
  corrompe es el contador. Necesita decisión de producto antes que código: ver
  `roadmap.md`.
- 🟠 **`survey_sessions.token` sin formato forzado, sin caducidad y sin límite de
  intentos.** Un enlace de levantamiento filtrado vale para siempre.
- 🟠 **`almas.visibility` no se aplica en RLS.** La política es `using (true)`; el
  filtro vive en el cliente. Quien pone su perfil en privado sigue siendo legible
  por la API.
- 🟠 **Protección de contraseñas filtradas desactivada** en Supabase Auth.
- 🟠 **`access_requests` acepta `INSERT` de `anon`** sin límite de frecuencia.
- 🟠 **Bucket `media` público, sin límite de tamaño ni de tipo MIME.**
- 🟠 **33 políticas con `auth.uid()`** sin envolver en `(select …)` — no 26.
- 🟠 **`audit_row()` existe y ningún disparador la usa.** Las únicas escrituras a
  `audit_logs` son las llamadas explícitas de `crear_cliente`, `import_intake`,
  `update_purchase_costs`, `void_purchase` y `workflow_advance`.

## Storage

Bucket `companies`, **privado**. Ruta obligatoria:

```
companies/<company_id>/<área>/<archivo>
```

Las políticas leen el `company_id` de la primera carpeta de la ruta y comprueban
pertenencia. Borrar exige nivel `manager` (60).
