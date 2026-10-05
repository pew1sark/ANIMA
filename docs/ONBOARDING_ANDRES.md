# Onboarding de Andrés

Dos partes: lo que hace **SARK** antes de dar acceso, y lo que hace
**Andrés** para quedar trabajando (objetivo: menos de 30 minutos).

---

## Parte A — SARK, antes de invitar

### 1. Proteger las ramas (GitHub → Settings → Branches → Add rule)

Crear primero `develop` desde `main` (`git push origin main:develop`).
Hay una rama vieja `development` sin uso: borrarla para no confundir.

**Regla para `main`:**

- [ ] Require a pull request before merging
  - [ ] Require approvals: **1**
  - [ ] Require review from Code Owners
  - [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require status checks to pass: `Plataforma (tipos y build)`,
      `Sitio y STUDIO (sintaxis JS)`, `Migraciones`, `Secretos`
- [ ] Require branches to be up to date before merging
- [ ] Block force pushes · Restrict deletions
- [ ] **Do not allow bypassing the above settings: desactivado.**
      GitHub no deja aprobar el PR propio. Si es obligatorio para el admin,
      cada PR de SARK necesitaría la aprobación de Andrés, incluidos los de
      STUDIO. Dejar el bypass para SARK y usarlo solo para sus propios PRs.

**Regla para `develop`:** igual, con approvals en 1 y los mismos checks.

### 2. Invitar a Andrés

- Settings → Collaborators → Add people → su usuario de GitHub.
  En un repo personal, el colaborador tiene permiso de escritura (no hay
  roles más finos): lo que lo limita es la protección de ramas + CODEOWNERS.
- Descomentar su línea en `.github/CODEOWNERS` con su usuario real.

**Sobre "sin acceso a STUDIO":** el repo es público, así que cualquiera puede
**leer** STUDIO. Lo que sí se garantiza es que nada de STUDIO entra sin la
aprobación de SARK (CODEOWNERS sobre la raíz y `assets/`). Si hace falta que
ni lo lea, hay que separar COMPANY en un repo privado (decisión pendiente,
ver `docs/AUDITORIA.md` §11).

### 3. Entorno de staging (decisión pendiente)

Mientras no exista, Andrés no puede probar nada contra una base.

- [ ] Crear un proyecto Supabase nuevo, por ejemplo `anima-staging` (plan gratuito).
- [ ] Llevar el esquema. **Bloqueo actual:** las migraciones del repo no
      reproducen producción tal cual (ver auditoría §5). Hay que reconciliarlas
      antes, o partir de un volcado **solo de esquema** de producción
      (`supabase db dump --db-url "<conexión de prod>" -f esquema.sql`: por
      defecto no incluye datos). Lo hace SARK; el archivo no se versiona.
- [ ] Cargar datos ficticios (`supabase/seed.sql`, se escribe junto con staging).
- [ ] Crear los usuarios de prueba de Andrés allí.
- [ ] Pasarle **solo** la URL y la clave publicable de staging.

### 4. Lo que Andrés NO recibe

- Claves de producción (ni publicable de prod para desarrollo, ni `service_role`).
- Acceso al dashboard de Supabase de producción ni de JLIZ/Bilagay.
- Acceso de administrador al repo.
- Si además es usuario de la organización `asesoria-andres` en producción,
  esa cuenta es de **cliente**: no se usa para desarrollar.

---

## Parte B — Andrés, el primer día

### 1. Instalar (5 min)

- Node 22 (`node -v`), git, un editor, Claude Code.
- Aceptar la invitación al repo desde el correo de GitHub.

### 2. Clonar y correr (10 min)

```bash
git clone https://github.com/pew1sark/ANIMA.git
cd ANIMA
git checkout develop
cd platform
npm ci
cp .env.example .env.local
# Pegar en .env.local la URL y la clave publicable de STAGING que te pasó SARK
npm run dev
```

Abrir http://localhost:5180/app/ y entrar con el usuario de prueba de staging.

### 3. Leer (15 min)

1. `CLAUDE.md` — las reglas en una página.
2. `CONTRIBUTING.md` — ramas, commits, PRs.
3. `docs/AUDITORIA.md` §0 y §8 — cómo está el repo y Casa Click hoy.
4. `docs/real-estate-intelligence.md` y `docs/brokerage.md` — el módulo
   donde vive Casa Click.
5. `docs/multi-tenancy.md` — antes de escribir cualquier migración.

### 4. Primer PR (de prueba)

```bash
git checkout -b docs/andres-primer-pr
# un cambio pequeño en docs
git commit -m "docs: primer PR de Andrés"
git push -u origin docs/andres-primer-pr
```

Abrir el PR contra **`develop`**, ver CI en verde y pedir revisión a SARK.

---

## Dónde puede entrar cada uno

| Zona | Andrés | Revisión |
|---|---|---|
| `platform/src/components/inmobiliaria/`, `services/inmobiliaria.service.ts`, futuro `modules/casa-click/` | libre | SARK o Andrés |
| `platform/src/components/` (resto), `services/`, `docs/` | libre | SARK |
| `platform/src/core/`, `config/`, `lib/supabase.ts` | con cuidado | **SARK obligatorio** |
| `supabase/` (migraciones, funciones) | propone | **SARK obligatorio** y SARK aplica |
| `.github/`, `vite.config.ts`, `package.json` | propone | **SARK obligatorio** |
| Raíz `*.html`, `assets/` (STUDIO) | no | **SARK obligatorio** |
| `app/` (build publicado) | nunca | solo SARK al liberar |
