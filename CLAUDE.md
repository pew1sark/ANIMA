# CLAUDE.md — ANIMA

Contexto para Claude Code. SARK y Andrés trabajan con el mismo archivo para
que Claude aplique el mismo criterio a los dos.

## Qué es esto

Un solo repositorio **público** (`pew1sark/ANIMA`) con dos productos sobre un
mismo Supabase (`jwxeowowuxmijuexdrua`):

- **ANIMA COMPANY** — `platform/`: SaaS multiempresa en React 19 + Vite 6 +
  Tailwind 4 + TypeScript estricto. Se compila a `app/` y se sirve en
  `animatsc.com/app/`.
- **ANIMA STUDIO** — la raíz (`studio.html`, `home.html`, `assets/`): HTML/CSS/JS
  sin build. Tiene su propio lenguaje (Almas, Esencia, Biblia) que **no** se usa
  en COMPANY.

Deploy: GitHub Pages publica la raíz de `main` en cada push
(`.github/workflows/publicar.yml`). **`main` = producción.**

Documentos clave: `docs/AUDITORIA.md` (estado real y riesgos),
`docs/architecture.md`, `docs/multi-tenancy.md`, `docs/lineas-de-producto.md`,
`docs/REFERENCIA_STUDIO.md` (lenguaje visual), `CONTRIBUTING.md` (flujo).

## Reglas que no se rompen

1. **Producción es intocable.** Nunca push a `main`; nunca aplicar migraciones,
   `execute_sql` de escritura ni deploy de Edge Functions contra
   `jwxeowowuxmijuexdrua` sin que SARK lo pida explícitamente en ese momento.
   Por defecto, todo contra **staging**.
2. **Nunca** tocar el proyecto Supabase `owfvuusxfvzjgxfmllpt` (JLIZ/Bilagay,
   integración Bsale en vivo).
3. **STUDIO** (raíz y `assets/`) solo se cambia si SARK lo pide.
4. UI y lógica de negocio van en PRs separados. Un PR = un propósito.
5. Migraciones: siempre nuevas (`supabase/migrations/NNNN_descripcion.sql`),
   nunca editar una existente. RLS en toda tabla, con `company_id` y
   `is_company_member` / `has_company_level`. Nunca debilitar una política.
   `SECURITY DEFINER` con `set search_path = public` y `revoke execute ... from anon`.
6. El repo es público: ni secretos, ni datos reales de clientes, ni detalles
   explotables de seguridad en archivos versionados.
7. No inventar requisitos de negocio. Si es ambiguo, preguntar.
8. No ejecutar `npm run build` en ramas de trabajo (escribe `app/`); usar
   `npm run build:check`.

## Comandos

```bash
cd platform
npm ci
npm run dev            # http://localhost:5180/app/
npm run typecheck
npm run fronteras      # ningún módulo importa de otro
npm run build:check    # build de comprobación, no toca app/
npm run vitrina        # pantallas de Capital con datos falsos, sin Supabase
```

No hay linter ni tests de frontend todavía.

Base de datos (Postgres desechable, nunca staging ni producción):

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/reconstruir/reconstruir.sh
# migraciones desde cero + seed.sql + 15 pruebas de aislamiento
```

Estado de las migraciones y cómo preparar staging: `docs/MIGRACIONES.md`.

## Estructura de `platform/src`

- `core/auth`, `core/tenant` — sesión y organización activa (`useAuth`, `useTenant`).
- `core/modules/registry.ts` — catálogo de módulos. Qué ve cada empresa lo
  decide la base (`plan_modules` + `company_modules`), no el código.
- `core/modules/pestanas.ts` + `core/datos/esquemas.ts` + `components/datos/Vista.tsx`
  — motor declarativo: una entidad nueva es un esquema, no una pantalla.
- `modules/<modulo>/` — un módulo vertical con sus pantallas y su servicio
  (`capital`, `inmobiliaria`, `analisis`). **Un módulo nunca importa de otro**; lo común va
  a `ui/` o `core/`. `npm run fronteras` lo comprueba (también en CI).
- `ui/` — piezas compartidas de interfaz: cifras con trazabilidad, período,
  cuadros de panel, gráficos y mapas. No importa de ningún módulo.
- `acceso/` (antes de entrar), `consola/` (super admin) y `espacio/` (el
  shell de una organización: inicio, informes, ajustes). El shell monta
  módulos; un módulo nunca importa del shell.
- `components/datos/` — pantallas del motor declarativo (pasan a `core/datos`).
- `services/<dominio>.service.ts` — acceso a datos compartido.
- `index.css` — sistema visual (tokens en `@theme`, clases `.b`, `.campo`,
  `.tarjeta`, `.tabla`, `.aparece`…).
- No hay router: la navegación es estado en `espacio/Espacio.tsx`.

## Convenciones

- Código, nombres y comentarios en **español**, como el resto del repo.
  Comentarios que explican el *por qué*, no el *qué*.
- Alias `@/` → `platform/src/`.
- Un módulo nunca lee sesión o empresa por su cuenta: usa `useTenant()`.
- Niveles de rol: owner 100 · admin 80 · manager 60 · employee 40 · viewer 20.
  Comparar con `>=`, nunca por nombre.
- Commits: Conventional Commits (`feat:`, `fix:`, `ui:`, `refactor:`, `docs:`, `chore:`).
- Ramas: `feature/<modulo>-<desc>`, `fix/…`, `ui/…` desde `develop`.

## Formato de reporte por fase

```
FASE X — [nombre]
✅ Hecho:
⚠️ Riesgos o dudas:
🔒 Impacto en producción:
📋 PRs abiertos:
➡️ Propuesta para la siguiente fase:
❓ Decisiones que necesito de SARK:
```
