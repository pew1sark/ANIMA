# Separar ANIMA STUDIO y ANIMA COMPANY

> Decidido por SARK el 5 de octubre de 2026. **Nunca mezclar ambas
> plataformas.** Solo comparten interfaz y mecánicas reutilizables, y lo hacen
> por **copia**: ninguna depende de la otra.

## Decisiones

| Tema | Decisión |
|---|---|
| Código | COMPANY pasa a un **repositorio privado propio**. STUDIO se queda en `pew1sark/ANIMA`. |
| Base y cuentas | COMPANY tendrá **su propio proyecto Supabase** con sus usuarios. STUDIO se queda en `jwxeowowuxmijuexdrua`. |
| Entrada | La app de COMPANY deja de mostrar STUDIO: sin puerta, sin alta de Almas, sin `ANIMA-2026`. |
| Lo compartido | Tokens de diseño y patrones se **copian** (base: `docs/REFERENCIA_STUDIO.md`). Nada se importa entre plataformas. |
| Equipo | Andrés (socio, desarrollador) trabaja solo en el repo de COMPANY. Su cuenta en la organización `asesoria-andres` es de cliente y no se usa para desarrollar. |

## Dónde están mezcladas hoy

**Repositorio.** STUDIO es la raíz; COMPANY es `platform/` y se publica en
`animatsc.com/app/` desde el mismo Pages.

**Entrada.** Todo el acceso de STUDIO pasa por `/app/`: `home.html`,
`entrar.html`, `index.html`, `umbral.html` y `despertar.html` mandan ahí. La app
de COMPANY tiene la puerta a STUDIO (`acceso/Puertas.tsx`, `App.tsx`), crea
cuentas de STUDIO (`acceso.service.ts`: `crearCuentaStudio`, `ANIMA-2026`) y
devuelve a `home.html` (`config/env.ts`).

**Base.** Un solo proyecto, una sola `auth.users`. De 169 tablas:

| Grupo | Tablas | Qué son |
|---|---:|---|
| Solo COMPANY (`company_id`) | 85 | comercio, inventario, reparto, Capital, Real Estate, Brokerage, configuración por empresa |
| Solo STUDIO (`alma_id` o colgadas de `almas`) | 27 + ~25 del mundo | almas, clanes, santuarios, ecos, Árbol, insignias, LUMBRE, portafolio |
| **Las dos a la vez** (`company_id` **y** `alma_id`) | **6** | `projects`, `quotes`, `clients`, `tasks`, `agenda`, `finance_entries`: el Taller |
| Catálogo y plataforma | ~25 | planes, módulos, roles, líneas, consola y cobros de la plataforma |

El Taller es el único cruce de verdad: en STUDIO es del Alma; en COMPANY es el
módulo `creator` de una empresa. Al separar, cada base se queda con **sus**
filas y su propia copia del esquema.

## Etapas

Ninguna corta producción. Cada una es un PR (o una ventana coordinada, la 4) y
espera la aprobación de SARK.

### 1 · STUDIO entra por su propia puerta *(repo actual)*
- Login y alta de cuentas propias en STUDIO (`entrar.html`), con la invitación
  `ANIMA-2026` y `complete_awakening` que hoy viven en `/app/`.
- `home.html`, `umbral.html`, `despertar.html`, `index.html`: «Entrar» y las
  invitaciones de STUDIO llevan a la entrada de STUDIO, no a `/app/`.
- COMPANY sigue igual. Se puede probar sin tocar la base.

### 2 · COMPANY sin STUDIO *(repo actual, `platform/`)*
- Fuera `Puertas` de STUDIO, `EntrandoAStudio`, `crearCuentaStudio`,
  `invitacionStudio` y `env.studio`.
- `App.tsx`: sin sesión → login de COMPANY; con sesión → su organización (o la
  consola si es super admin). Sin «elegir plataforma».
- `ProductLine 'studio'` y los módulos de línea `AMBAS` se revisan: COMPANY
  solo conoce COMPANY.

### 3 · El esquema de COMPANY, solo
- Migración base de COMPANY generada de la base reconstruida, **sin** tablas
  de STUDIO (almas, mundo, clanes…) y con el Taller como módulo `creator` de
  empresa (`company_id` obligatorio, sin `alma_id`).
- `reconstruir.sh` y el seed adaptados al esquema nuevo. Staging de COMPANY
  sale de aquí.

### 4 · Proyecto Supabase de COMPANY y traslado *(ventana coordinada)*
- Proyecto nuevo con el esquema de la etapa 3.
- Copiar las organizaciones de COMPANY (Casa Click, Asesoría · Andrés,
  ANIMA TSC/Murales, Bilagay vacía) con sus filas, y sus usuarios
  (`auth.users` con su hash de contraseña: nadie tiene que cambiar la clave).
- Edge Functions que use COMPANY y sus secretos, en el proyecto nuevo.
- Comprobación fila por fila antes del corte. Producción de STUDIO no se toca.

### 5 · Repo privado y hosting de COMPANY
- `anima-company` (privado) con la historia de `platform/` y lo de COMPANY en
  `supabase/`, `docs/`, CI, CODEOWNERS, `CLAUDE.md`.
- Hosting propio con previews por PR; dominio propio de COMPANY.
- `animatsc.com/app/` redirige al dominio nuevo durante la transición.

### 6 · Limpieza
- Del repo de STUDIO salen `platform/`, `app/` y la documentación de COMPANY.
- Del proyecto de STUDIO salen las tablas y funciones de COMPANY, **después**
  de un período de convivencia y con respaldo.

## Lo que hace falta para avanzar

| Para | Hace falta |
|---|---|
| Etapas 1-3 | Nada: se trabaja en el repo y en la base desechable local |
| Etapa 4 | Reautorizar el conector de Supabase en claude.ai. El plan gratuito de Supabase permite **2 proyectos gratuitos activos** y ya están los dos (ANIMA y JLIZ): el proyecto de COMPANY (y su staging) requiere pasar a plan **Pro** (verificar el límite vigente en el panel de Supabase) |
| Etapa 5 | Elegir hosting (GitHub Pages en repo privado requiere GitHub Pro; Vercel o Cloudflare Pages lo hacen gratis y con previews) y el dominio de COMPANY |
