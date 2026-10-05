# Migraciones: estado y reconstrucción

> 5 de octubre de 2026. Reemplaza el bloqueo descrito en la auditoría §5.

## La regla

**Las migraciones del repo reconstruyen el esquema de producción desde una base
vacía.** CI lo comprueba en cada PR (job *Base*): aplica todo
`supabase/migrations/` en orden de nombre sobre un Postgres 17 limpio, carga
`supabase/seed.sql` y verifica el aislamiento entre organizaciones.

Antes no era así, por dos motivos:

1. **Al repo le faltaba el comienzo.** Las tres primeras migraciones de
   producción (`anima_core_schema`, que crea `almas`, `projects`,
   `finance_entries`…; su endurecimiento; e `invites`/`feedback`) y tres de
   junio (`tasks` y columnas de `quotes` y `clients`) se aplicaron sin archivo.
2. **Al historial de producción le falta otra parte.** Diez tablas
   (`clients`, `quotes`, `posts`, el Árbol…) se crearon desde el editor y no
   figuran en `schema_migrations`. Sí están en el repo.

Juntos cubren todo. Se recuperaron los seis archivos faltantes del registro de
producción, tal como se aplicaron, en su lugar cronológico:

| Archivo | Origen en producción |
|---|---|
| `0001_anima_core_schema.sql` | `20260619205921 anima_core_schema` |
| `0001b_harden_security_definer_functions.sql` | `20260619210050` |
| `0001c_beta_invites_and_feedback.sql` | `20260619211026` |
| `0032b_create_tasks_table.sql` | `20260624084412` |
| `0032c_quotes_doctype_design.sql` | `20260624085931` |
| `0032d_clients_kind_role.sql` | `20260624091447` |

Y `0145_el_repo_alcanza_a_produccion.sql` fija **34 funciones** con el cuerpo
que tienen hoy en producción: ahí se corrigieron cosas desde el editor que el
repo no recogió. En producción es un no-op.

## Resultado comprobado

Base reconstruida contra producción (catálogo, 05-10-2026):

| | Producción | Repo reconstruido |
|---|---:|---:|
| Tablas · sin RLS | 169 · 0 | 169 · 0 |
| Columnas, tipos, vistas, firmas de funciones, políticas, disparadores | 3.080 | 3.080, idénticos |
| Cuerpos de función, expresiones de políticas, definiciones de vistas | — | idénticos salvo lo que dejó pendiente una migración del repo no aplicada en producción (anexo privado de la auditoría) |

## Lo que no está en el repo, a propósito

`0111_la_firma_de_andres`, `0112_los_tres_proyectos_reales` y
`0113_los_porcentajes_del_deck…` cargan **datos reales de clientes** en
producción. No crean esquema (la reconstrucción coincide sin ellas). No se
versionan: el repo es público.

## Deuda que queda

- **Numeración:** los nombres del repo no coinciden con los de
  `schema_migrations`, y hay sufijos con letra (`0001b`, `0032c`). La CLI de
  Supabase (`supabase db push`) no acepta ese formato, así que las
  migraciones se aplican con `psql`, en orden de nombre.
- **URLs de producción escritas en el SQL** (crons y avisos push de
  0134-0139). Deberían leerse de una configuración por proyecto. En staging,
  `preparar.sh` apaga los crons.
- **Cuenta del Creador** buscada por correo en migraciones de datos (0069 y
  siguientes): una base nueva necesita esa cuenta creada antes.

## Cómo se usa

```bash
# Comprobar en local (Postgres desechable; crea y borra la base `reconstruir`)
PGHOST=localhost PGUSER=postgres supabase/tests/reconstruir/reconstruir.sh

# Preparar un proyecto de staging NUEVO (se niega si la URL es de producción)
STAGING_DB_URL='postgresql://…' supabase/staging/preparar.sh
```

### Escribir una migración nueva

1. Siguiente número libre: `0146_descripcion.sql`.
2. Correr `reconstruir.sh` en local: tiene que pasar entera, seed incluido.
3. Aplicarla en staging. PR. SARK la revisa y la aplica en producción.
4. Si toca políticas, ampliar `aislamiento_seed.sql` con el caso nuevo.
