# Cómo se trabaja en ANIMA

Somos dos: **SARK** (dueño, aprueba todo lo que llega a producción) y
**Andrés** (co-desarrollador de ANIMA COMPANY, foco en Casa Click y los
proyectos que se monten encima). Este documento es el acuerdo.

> **Lo que no se olvida:** `main` es producción. GitHub Pages publica cada
> push a `main` en animatsc.com en un minuto. Nada llega a `main` sin PR,
> sin CI verde y sin la aprobación de SARK.

---

## 1. Qué hay en el repo

| Carpeta | Qué es | Quién lo toca |
|---|---|---|
| `platform/` | **ANIMA COMPANY** — React 19 + Vite + Tailwind 4 | los dos |
| `app/` | el build de `platform/` que se publica | **solo SARK**, al liberar |
| raíz (`*.html`) + `assets/` | sitio público y **ANIMA STUDIO** | solo SARK |
| `supabase/` | migraciones, Edge Functions, semillas | los dos proponen, SARK aprueba y aplica |
| `docs/` | documentación | los dos |

Más contexto en [`docs/AUDITORIA.md`](docs/AUDITORIA.md) y
[`docs/architecture.md`](docs/architecture.md).

---

## 2. Poner el proyecto en marcha

Requisitos: Node 22, npm, git.

```bash
git clone https://github.com/pew1sark/ANIMA.git
cd ANIMA/platform
npm ci
cp .env.example .env.local      # rellenar con las claves de STAGING
npm run dev                     # → http://localhost:5180/app/
```

- `.env.local` **nunca** se versiona (está en `.gitignore`).
- Las claves de desarrollo son las del proyecto Supabase de **staging**. Las
  de producción no se usan en local, por nadie.
- Para ver el sitio/STUDIO: `python3 -m http.server 4180` en la raíz.

Comprobaciones antes de abrir un PR:

```bash
npm run typecheck      # tipos
npm run build:check    # compila a platform/.build-check (ignorado), no toca app/
```

`npm run build` escribe en `app/`. **No lo ejecutes en una rama de trabajo**:
el build publicado lo regenera SARK al liberar (sección 6), así dos personas
no chocan en archivos generados.

---

## 3. Ramas

```
main      ← producción. Protegida. Solo recibe PR desde develop (o hotfix/).
develop   ← integración. Protegida. Recibe los PR del día a día.
feature/<modulo>-<descripcion>   trabajo nuevo
fix/<descripcion>                corrección
ui/<descripcion>                 solo presentación
hotfix/<descripcion>             urgencia en producción, sale de main y vuelve a main y develop
```

Ejemplos: `feature/casa-click-visitas`, `ui/tabla-ordenable`,
`fix/sesion-se-pierde-al-recargar`.

Una rama vive poco: se abre, se hace una cosa, se fusiona. Antes de pedir
revisión, trae lo último de `develop`:

```bash
git fetch origin
git merge origin/develop
```

## 4. Commits

[Conventional Commits](https://www.conventionalcommits.org/es/), en español:

```
feat(casa-click): agenda de visitas por corredor
fix(sesion): no cerrar sesión al refrescar el token
ui(tablas): encabezado fijo al desplazar
refactor(core): mover el registro de módulos a core/modules
docs: onboarding de Andrés
chore(ci): cachear node_modules
```

Tipos: `feat`, `fix`, `ui`, `refactor`, `docs`, `chore`, `test`.

## 5. Pull requests

1. Un PR = un propósito. Rediseño visual y cambio de lógica **nunca** juntos.
2. Llenar la plantilla: qué, por qué, capturas antes/después si hay UI, cómo
   probarlo, checklist.
3. CI tiene que estar verde: tipos, build, sintaxis de STUDIO, reglas de
   migraciones, reconstrucción de la base con seed y aislamiento, y búsqueda
   de secretos.
4. Revisión: CODEOWNERS pide a quien corresponde. Todo lo que toque
   `supabase/`, `platform/src/core/`, configuración o STUDIO lo aprueba SARK.
5. Se fusiona con **squash** a `develop`.

## 6. Liberar a producción (solo SARK)

```bash
git checkout develop && git pull
cd platform && npm ci && npm run build     # regenera app/ con .env.local de PRODUCCIÓN
cd .. && git add app && git commit -m "chore(release): build de la plataforma"
# PR develop → main, CI verde, merge → Pages publica
```

Si se tocó STUDIO, subir la versión del service worker (`anima-vNN` en
`sw.js`) para que los navegadores no sigan con la copia vieja.

## 7. Base de datos

- Todo cambio de esquema es una **migración nueva** en `supabase/migrations/`:
  `NNNN_descripcion_en_minusculas.sql`, con el siguiente número libre.
- **Una migración aplicada no se edita ni se borra**: se escribe otra. CI lo
  comprueba.
- Toda tabla nueva lleva `company_id`, RLS activo y políticas con
  `is_company_member` / `has_company_level`. Plantilla en
  [`docs/multi-tenancy.md`](docs/multi-tenancy.md).
- Ninguna política se debilita. Funciones `SECURITY DEFINER` con
  `set search_path` y sin `EXECUTE` para `anon` salvo que sean públicas a
  propósito (ver [`SECURITY.md`](SECURITY.md)).
- Antes del PR, `supabase/tests/reconstruir/reconstruir.sh` tiene que pasar
  en local: todas las migraciones desde cero, el seed y el aislamiento. CI lo
  vuelve a correr (job *Base*).
- Orden: se escribe → se aplica en **staging** → PR → SARK revisa → SARK la
  aplica en producción. Nadie más aplica nada en producción.
- Datos de prueba: solo en `supabase/seed.sql`, ficticios y con dominio `.test`.
- Datos reales de clientes **nunca** en una migración del repo: el repo es
  público.

## 8. Lo que nunca se hace

- Push directo a `main` o `develop`.
- Usar claves de producción fuera del dashboard de SARK.
- `service_role` o cualquier secreto en el frontend o en el repo.
- Tocar el proyecto Supabase de Bilagay/JLIZ desde aquí.
- Commitear `app/` en una rama de trabajo.
- Saltarse un test o un check para que CI quede verde.
