# Auditoría — ANIMA COMPANY · Fase 0

> Fecha: 5 de octubre de 2026 · Rama: `claude/quirky-goldberg-69yhty` · Solo lectura.
> No se cambió código, ni base, ni configuración. Las consultas a Supabase fueron
> de catálogo y metadatos (advisors, lista de migraciones, conteos), sin leer
> datos de operación de ningún cliente.
>
> El repositorio es **público**. Por eso este documento resume los hallazgos de
> seguridad por categoría y deja el detalle explotable (nombres de funciones
> expuestas, etc.) en un anexo entregado a SARK fuera del repositorio.

---

## 0. Lo primero: el prompt maestro asume cosas que no son así

Antes de cualquier fase hay que corregir el mapa. Cinco supuestos del prompt no
coinciden con el repositorio real:

| El prompt asume | Lo que hay | Consecuencia |
|---|---|---|
| Dos repos: `anima-company` y `anima-studio` | **Un solo repo**, `pew1sark/ANIMA`, con las dos cosas: STUDIO es el sitio estático de la raíz (`studio.html`, `assets/`) y COMPANY es `platform/` (React) | La regla "Andrés sin acceso a Studio" **no se puede cumplir** con permisos de GitHub dentro de este repo |
| Repo privado | **Público** (y servido por GitHub Pages) | Andrés ya puede leer todo, incluido Studio. Cualquiera puede. "Sin acceso a Studio" solo puede significar "sin permiso de escritura sobre Studio" (CODEOWNERS + protección de rama) o separar repos |
| Deploy en Vercel | **GitHub Pages**, workflow `publicar.yml` en cada push a `main`. El build de Vite **se commitea** en `app/` | No hay previews por PR. Hoy `main` = producción en cuanto se hace push |
| Integración Bsale en este código | **No existe aquí.** Bsale vive en otro proyecto Supabase (`owfvuusxfvzjgxfmllpt`, "JLIZBUSINESS") con 9 Edge Functions `bsale-*`, y su código en otro repo (JLIZ). En ANIMA, la organización Bilagay tiene 0 miembros | El riesgo "romper Bsale" desde este repo es **bajo**: nada de aquí lo toca. El riesgo real está en mezclar los dos proyectos Supabase |
| CASA CLICK hay que crearlo desde cero | **Ya existe** como organización en producción (`casa-click`, línea COMPANY, plan Enterprise en estado `prueba`, 2 miembros, 13 módulos) y opera sobre los módulos **Real Estate Intelligence** y **Brokerage** (migraciones 0120-0133), con datos reales cargados | La Fase 5 no es "crear un módulo": es decidir si lo de Casa Click sigue siendo módulo genérico (`realestate`) o se separa |

Además: en producción existe la organización **"Asesoría de inversión · Andrés"**
(`asesoria-andres`, Enterprise en `prueba`, 2 miembros) y la migración aplicada
`0111_la_firma_de_andres`. Hay que confirmar si es el mismo Andrés que se suma
como desarrollador: en ese caso ya es **usuario de producción**, y eso cambia
cómo se separan sus credenciales de desarrollo.

---

## 1. Stack real

| Capa | Qué | Versión |
|---|---|---|
| Sitio público + STUDIO | HTML/CSS/JS sin build, sin framework | — |
| Cliente Supabase en el sitio | `@supabase/supabase-js@2` desde jsDelivr **sin versión fija** | la última 2.x que sirva el CDN |
| Mapa en STUDIO | Leaflet 1.9.4 desde unpkg, cargado bajo demanda | 1.9.4 |
| Plataforma (COMPANY) | React + Vite + Tailwind v4 + TypeScript estricto | React 19.2.8 · Vite 6.4.3 · TS 5.9.3 · Tailwind 4 |
| Datos | Supabase (Postgres 17.6, Auth, RLS, Storage, Realtime, Vault, pg_cron, pg_net) | proyecto `jwxeowowuxmijuexdrua` |
| Edge Functions | Deno: `activar-invitacion`, `calendario`, `lumbre-ai`, `meta-ads`, `meta-leads`, `push` | 6, todas en el repo y desplegadas |
| Hosting | GitHub Pages + dominio `animatsc.com` (CNAME) | — |
| CI | **Ninguno.** El único workflow publica | — |

### Dependencias (`platform/package.json`)

- **Sin uso:** `react-router-dom` y `@tanstack/react-query` están instaladas y
  ningún archivo las importa. La navegación es por estado (`useState`), no por URL.
- **Atrasadas (menor):** supabase-js 2.112 → 2.117, react 19.2 → 19.3. Sin riesgo.
- **Mayores disponibles:** Vite 8, `@vitejs/plugin-react` 6, TypeScript 7. No
  urgentes; actualizar en un PR propio.
- `npm audit --omit=dev`: **0 vulnerabilidades**.
- No hay ESLint, Prettier, ni framework de tests en `platform/`.

### Verificación hecha

- `npm ci` ✅ · `tsc --noEmit` ✅ sin errores.
- `vite build` (con variables ficticias, a una carpeta temporal) ✅ en 2,8 s.
  Un único bundle de **913 KB** (253 KB gzip): sin división de código.
- El CSS generado coincide byte a byte con el publicado (`index-BsKl1TL1.css`):
  lo publicado en `app/` corresponde al código actual.

---

## 2. Mapa de carpetas y problemas de organización

```
/                    sitio público + STUDIO (producción directa vía Pages)
├── *.html           12 páginas en la raíz
├── assets/          css (6), js (13 + lumbre/6 + services/2), img
├── app/             BUILD de platform/ — versionado
├── platform/        ANIMA COMPANY (React)
│   └── src/
│       ├── components/   pantallas + UI mezcladas (capital/, company/, inmobiliaria/, datos/, graficos/, mapa/, panel/)
│       ├── core/         auth, tenant, modules (registro + pestañas), datos (motor de esquemas), permissions
│       ├── services/     acceso a datos por dominio (15)
│       ├── modules/      VACÍA — solo un README
│       ├── lib/ hooks/ types/ config/ vitrina/
├── supabase/        migrations (150), functions (6), seed, tests
└── docs/            23 documentos + 3 HTML de levantamiento
```

**Problemas:**

1. **Dos productos en un repo y en la raíz.** STUDIO no está en una carpeta: es
   la raíz. No se le puede poner un CODEOWNERS limpio sin enumerar archivos.
2. **El build vive en el repo.** `app/assets/` tiene **7 bundles JS (~6 MB) y 4
   CSS**, de los cuales `index.html` usa **uno de cada uno**. Los otros 6 JS y 3
   CSS son restos de builds anteriores (Vite tiene `emptyOutDir`, así que
   entraron por commits manuales). Cada build ensucia los diffs y genera
   conflictos seguros entre dos personas que compilen en paralelo.
3. **`platform/src/modules/` está vacía.** La "arquitectura por módulos" existe en
   el registro (`core/modules/registry.ts`) y en la base, pero el código de cada
   módulo está repartido entre `components/<dominio>/` y `services/<dominio>`.
4. **Pantallas y componentes base mezclados** en `components/`
   (`Login.tsx` 605 líneas junto a `Cargando.tsx` 19).
5. **Archivos grandes:** `core/datos/esquemas.ts` 2.206 líneas (declarativo, pero
   todos los módulos en un archivo), `Espacio.tsx` 641, `Login.tsx` 605.
   En STUDIO: `assets/js/anima.js` 456 KB, `assets/css/studio.css` 173 KB.
6. **Ramas remotas sueltas:** `development` (1 commit propio, 151 atrás de
   `main`, sin uso desde el 2-sep), `fix/session-refresh-loop` (1 commit sin
   fusionar) y 9 ramas `claude/*`, varias con commits no fusionados.
7. **Raíz con documentos de producto** (`BIBLIA.md`, `PROMPT-MAESTRO.md`) que son
   de STUDIO y no de COMPANY; `README.md` mezcla las dos cosas y contiene
   instrucciones de la beta antigua (códigos de invitación, "Restaurar Almas").

---

## 3. Inventario de pantallas

### ANIMA COMPANY (`platform/`, servida en `/app/`)

No hay rutas por URL: todo cuelga de `App.tsx` → `Espacio.tsx` y un `useState`.
No hay enlace directo a una pantalla, el botón "atrás" del navegador no navega
dentro de la app, y recargar depende de `sessionStorage`.

| Pantalla | Archivo | Estado |
|---|---|---|
| Entrar / crear cuenta (invitación) / pedir acceso | `components/Login.tsx` | funcional |
| Nueva contraseña (recuperación) | `NuevaContrasena.tsx` | funcional |
| Puertas STUDIO / COMPANY / Consola | `Puertas.tsx` | funcional |
| Elegir organización | `Elegir.tsx` | funcional |
| Sin acceso / sin organización | `App.tsx` | funcional |
| Shell (menú lateral por zonas, cabecera, búsqueda global) | `Espacio.tsx` | funcional |
| Mi espacio · Inicio (panel) | `company/MiEspacio.tsx`, `company/Inicio.tsx` | funcional |
| Resumen por módulo | `company/ResumenModulo.tsx` | funcional (8 módulos) |
| Datos genéricos (tabla + ficha) para crm, commerce, operations, delivery, finance, food, agenda, creator | `datos/Vista.tsx` + `core/datos/esquemas.ts` | funcional — motor declarativo |
| Informes | `company/Informes.tsx` | funcional |
| Análisis financiero (addon) | `company/AnalisisFinanciero.tsx` | funcional |
| Configuración: Empresa, Equipo, Marca, Campos propios, Módulos, Mi plan, Cuotas | `company/*` | funcional |
| Novedades (changelog) | `company/Novedades.tsx` | funcional |
| Capital Intelligence: levantamiento, panel, modelo, presupuesto/real, ronda | `capital/*` | funcional |
| Real Estate Intelligence + Brokerage: panel, comercial, calificación, prefactibilidad, semanal, ciudades, calidad, 360, buscador | `inmobiliaria/*` | funcional — **lo que usa Casa Click** |
| Consola de plataforma (super admin) | `Consola.tsx` | funcional |
| `support`, `ai` | — | **sin pantalla** ("por construir") |
| Vitrina de diseño (Capital con datos falsos) | `vitrina/` + `vitrina.config.ts` | herramienta de desarrollo, no se publica |

### Sitio y ANIMA STUDIO (raíz, estático)

| Página | Qué | Estado |
|---|---|---|
| `index.html` | portada ANIMA TSC | funcional, producción |
| `planes.html`, `legal.html` | precios, términos | funcional |
| `home.html` | entrada a STUDIO (hogar del Alma) | funcional |
| `studio.html` + `anima.js` (+ dashboard, centro-clientes, anuncios, avisos, calendario, lumbre) | **la app de STUDIO** | funcional, en desarrollo activo (últimos 20 commits) |
| `arbol.html`, `portfolio.html`, `fundador.html` | Árbol de Almas, portafolio público, panel del fundador | funcional |
| `entrar.html`, `recuperar.html` | login antiguo del sitio | **probablemente duplicado** del login de `/app/` — confirmar |
| `despertar.html`, `umbral.html` | solo redirigen a `app/` | redirección de enlaces viejos — mantener |

---

## 4. Componentes UI y estilos

**Conviven tres sistemas de estilo:**

1. `platform/src/index.css` (863 líneas) — Tailwind v4 con `@theme` + clases
   propias en español: `.b .b-pri .b-sec .b-acento .b-mal`, `.campo`,
   `.etiqueta`, `.tarjeta`, `.tabla`, `.pest`, `.marca-*`, `.panel`, `.cifra-*`,
   `.grupo`, `.nav-item`, `.aparece`, `.toque`. **Ya es un sistema de diseño**,
   con tokens, escala tipográfica, paleta de datos validada y
   `prefers-reduced-motion`.
2. `assets/css/anima.css` + `studio.css` + `umbral.css` + `home.css` — el de
   STUDIO, CSS plano con variables (`--gold`, `--line`, `--radius`).
3. Estilos en línea dentro de los HTML de la portada (`index.html`, `planes.html`).

**Coherencia entre COMPANY y STUDIO: ya es alta.** Mismo fondo `#f5f5f7`,
misma tinta `#111`, mismo dorado `#d0aa63`, misma Inter, mismo interlineado
1,45, misma curva `cubic-bezier(.22,.61,.36,1)`, mismo cargador (la marca
trazándose). El trabajo de la Fase 3 es **formalizar y completar**, no rehacer.

**Lo que falta en COMPANY** frente a la lista de la Fase 3: no hay componentes
React reutilizables (todo es clase CSS + JSX repetido), ni Modal/Drawer, Toast,
Tooltip, Dropdown, Skeleton, ni tabla con orden/filtro/paginación genérica
(`Vista` resuelve parte), ni modo oscuro en el espacio de trabajo (solo el
portal es oscuro), ni página de catálogo `/dev/ui` (la vitrina es solo de
Capital).

**Inconsistencias concretas:** radios repartidos entre 8, 9, 10, 11, 12, 14,
16, 18 y 28 px; transiciones entre .12 s y .26 s escritas a mano; dos familias
mono distintas (`ui-monospace` vs `"DejaVu Sans Mono"`).

---

## 5. Esquema Supabase

| | Repo (migraciones) | Producción (catálogo) |
|---|---:|---:|
| Archivos de migración | 150 | 157 registradas |
| Tablas en `public` | ~160 creadas | **169** |
| Tablas sin RLS | — | **0** ✅ |
| Políticas | 227 `create policy` | 362 |
| Vistas | 16 | 16 |
| Funciones | 233 | 236 |
| Funciones `SECURITY DEFINER` | 250 menciones | — |
| Disparadores | 80 | — |
| Cron | 4 en migraciones | 4 activos: `meta-leads-5min`, `meta-ads-hora`, `push-tick`, `calendario-30min` |
| Edge Functions | 6 | 6 (coinciden) |
| Branches de Supabase (staging) | — | **ninguna** |

**Dominios del esquema:** núcleo multiempresa (`companies`, `company_members`,
`roles`, `platform_admins`, planes, suscripciones, módulos, features),
mundo STUDIO (`almas`, ecos, árbol, clanes, santuarios, insignias), Taller
(`projects`, `quotes`, `clients`, `tasks`, `client_leads`), comercio portado de
Bilagay (21 tablas: pedidos, inventario por lotes, compras, reparto, cobros),
extensibilidad (campos propios, workflows), levantamiento/cuestionarios,
Capital Intelligence (`ci_*`), Real Estate Intelligence y Brokerage (`rei_*`).

**Aislamiento:** `company_id` + RLS con `is_company_member` /
`has_company_level` (SECURITY DEFINER, `search_path` fijo). Prueba de
aislamiento documentada 13/13 (22-08) y script en `supabase/tests/`.

### Desfase entre repo y producción

- **Numeración distinta.** Producción registra muchas migraciones con timestamp
  y nombre distinto al archivo (p. ej. `create_tasks_table`,
  `quotes_doctype_design`, `clients_kind_role`, `lumbre_stage1`,
  `consola_estado_y_alta_sin_cobros`, `0107b_el_token_sin_depender_de_pgcrypto`,
  `las_cuotas_solo_se_leen_por_la_puerta_con_guardia`) que no tienen un archivo
  con ese nombre. Puede que su SQL esté fusionado en otro archivo; **no está
  verificado**. El repo tiene dos números duplicados (`0012_*`, `0093_*`) y
  huecos (`0001`, `0112`, `0113`).
- **En producción y no en el repo:** `0111_la_firma_de_andres`,
  `0112_los_tres_proyectos_reales`, `0113_los_porcentajes_del_deck…`. Por los
  nombres y por la regla de `.gitignore` (datos de clientes nunca al repo
  público) parece deliberado: son cargas de datos reales. Hay que confirmarlo y
  dejarlo escrito.
- **En el repo y aplicadas fuera del registro:** `0133_brokerage_informe…`
  (sus funciones existen) y `0141_el_plan_lo_da_anima` (su disparador existe),
  pero ninguna aparece en `schema_migrations`: se aplicaron desde el SQL
  Editor. Consecuencia: `supabase db push` o una branch nueva **no las
  reproduciría igual**.
- **Conclusión:** hoy **no se puede levantar una base de staging fiel desde el
  repo** sin antes reconciliar el historial. Es el bloqueo principal de la Fase 1.

### Seed

`supabase/seed/` tiene solo el cuestionario de levantamiento. **No existe
`seed.sql`** con datos ficticios para desarrollo local, ni `supabase/config.toml`
(el proyecto no está inicializado para la CLI de Supabase).

---

## 6. Puntos críticos de producción

1. **El push a `main` publica.** Sin protección de rama, sin CI, sin preview.
   Un commit roto en `main` llega a `animatsc.com` en un minuto.
2. **Una sola base para todo:** STUDIO, COMPANY, Casa Click, la firma de
   asesoría y los Almas en `jwxeowowuxmijuexdrua`. No hay entorno de pruebas.
3. **Casa Click** es el cliente activo de COMPANY con datos reales (inmuebles,
   propietarios, compradores, teléfonos). Las pantallas `inmobiliaria/*` y las
   funciones `rei_*` son la zona más sensible de COMPANY.
4. **Bilagay/Bsale** opera en el proyecto JLIZ, no aquí. Nadie de este repo
   debe tener credenciales de ese proyecto. Pendiente documentado: "portar
   cobranza, conector Bsale y correo saliente" — eso sí sería tocar producción
   de Bilagay y debe ser un proyecto aparte, con plan propio.
5. **Autenticación:** una sola sesión de Supabase compartida entre `/` (STUDIO)
   y `/app/` (COMPANY) en el mismo origen. Cualquier cambio en auth afecta a
   los dos productos. Hay un arreglo de sesión pendiente en la rama
   `fix/session-refresh-loop`.
6. **Integraciones activas en esta base:** Meta (leads y anuncios, con tokens
   en Vault), push web, calendario, LUMBRE (Anthropic, clave como secreto de
   Edge Function). Los crons llaman Edge Functions con `x-cron-key`.

---

## 7. Secretos

Historial completo revisado (463 commits, todas las ramas; el clon venía
superficial y se completó con `git fetch --unshallow`).

- **No se encontraron secretos reales.** Ni `service_role`, ni `sb_secret_`,
  ni tokens de GitHub, Anthropic, Meta, AWS, Google, claves privadas, VAPID
  privadas ni cadenas de conexión con contraseña. Las coincidencias fueron
  marcadores (`sk-ant-...`, `[CONTRASEÑA]`) y código minificado de supabase-js.
- **Nunca se commiteó un `.env`.** Solo `platform/.env.example`, sin valores.
  `.gitignore` cubre `.env`, `.env.*`, claves y `supabase/datos-clientes/`.
- **Sí son públicos (por diseño o por descuido):**
  - La clave **publicable** y la URL del proyecto, en `assets/js/supabase.js`,
    `portfolio.js` e `index.html`. Es correcto si RLS es correcto.
  - El código de invitación de STUDIO (`ANIMA-2026`) en el README, en
    `anima-state.js` y en `acceso.service.ts`. La validación es solo del
    navegador; la protección real es la 0141 (nadie se sube de plan solo).
  - El correo del Creador en varias migraciones, usado como **criterio de
    autorización** (`is_creator()` compara correos).

**Veredicto: no hace falta rotar nada antes de dar acceso a Andrés.** Sí hay que
decidir qué hacer con los puntos de seguridad de la sección 9.

---

## 8. CASA CLICK hoy

- Organización `casa-click` en producción desde el 13-09-2026: línea COMPANY,
  plan Enterprise en `prueba`, 2 miembros, 13 módulos encendidos.
- Usa los módulos genéricos `realestate` (Real Estate Intelligence) y el
  componente comercial (Brokerage), migraciones 0120-0133, pantallas en
  `platform/src/components/inmobiliaria/` y servicio
  `services/inmobiliaria.service.ts` (584 líneas).
- `docs/real-estate-intelligence.md` y `docs/brokerage.md` describen la carga de
  su base (222 inmuebles, 105 propietarios) y la deduplicación por teléfono.
- **No hay nada con el nombre Casa Click en el código**: está construido como
  módulo genérico reutilizable, lo que es una buena decisión y choca con la
  idea de `modules/casa-click/` del prompt.

---

## 9. Riesgos y deuda técnica, por prioridad

### 🔴 Alta

1. **Sin protección de `main`, sin CI, sin staging, sin previews.** Con dos
   personas, cualquier push accidental es un despliegue. Primer trabajo de la
   Fase 1.
2. **Historial de migraciones desincronizado** (sección 5). Bloquea crear un
   entorno de staging/branch fiel. Hay que reconciliar antes de que Andrés
   escriba una sola migración.
3. **48 funciones `SECURITY DEFINER` ejecutables por `anon`** según el advisor
   de Supabase (165 por `authenticated`). Varias son públicas a propósito
   (cuestionarios por token, conteos del Árbol) y muchas validan `auth.uid()`
   dentro, pero no está verificado una por una. La propia documentación ya lo
   tenía como deuda ("47 funciones heredadas"). Detalle en el anexo privado.
4. **Repo público + regla "Andrés sin acceso a Studio"**: incompatible.
   Decisión de SARK (ver sección 11).

### 🟠 Media

5. **Build commiteado en `app/`** con 6 bundles muertos. Dos personas
   compilando = conflictos y despliegues de builds viejos.
6. **Protección contra contraseñas filtradas desactivada** en Auth.
7. **4 funciones con `search_path` mutable** (de las migraciones 0142 y REI).
8. **supabase-js sin versión fija desde CDN** en el sitio: una versión nueva
   puede romper STUDIO sin ningún commit.
9. **Navegación sin URL** en COMPANY: sin enlaces directos, sin "atrás",
   sin compartir una pantalla.
10. **Bundle único de 913 KB** — Capital y Real Estate se descargan aunque la
    empresa no los tenga.
11. **Autorización del Creador por correo** en funciones de la base.

### 🟡 Baja

12. Dependencias sin uso (`react-router-dom`, `@tanstack/react-query`).
13. Sin linter, formateador ni tests de frontend.
14. Ramas remotas abandonadas o sin fusionar.
15. Tres sistemas de estilo y radios/transiciones sin escala.
16. README con instrucciones obsoletas de la beta.

---

## 10. Qué está bien (y no hay que romper)

- RLS en el 100 % de las tablas y un modelo de tenancy bien pensado y
  documentado (`multi-tenancy.md`).
- Separación Super Admin ↔ operación del cliente (0073).
- Motor declarativo de datos (`esquemas.ts` + `Vista`) que evita una pantalla
  por tabla.
- Documentación abundante y con el "por qué" de cada decisión.
- TypeScript estricto y sin errores.
- Un sistema visual ya coherente entre STUDIO y COMPANY.

---

## 11. Decisiones que necesita SARK antes de la Fase 1

1. **Studio y Andrés.** Opciones: (a) mantener un solo repo y proteger STUDIO
   con CODEOWNERS + protección de rama — Andrés puede leerlo pero no fusionar
   cambios ahí; (b) separar COMPANY en un repo privado nuevo; (c) volver
   privado este repo (GitHub Pages en repo privado exige plan de pago).
   Recomendación: **(a) ahora**, y (b) solo si el aislamiento de Studio es un
   requisito de negocio y no de orden.
2. **Staging.** ¿Proyecto Supabase nuevo para staging/desarrollo (gratuito, sin
   datos reales) o Supabase Branching (de pago, requiere migraciones
   reconciliadas)? Recomendación: **proyecto nuevo** + `seed.sql` ficticio.
3. **Hosting y previews.** ¿Seguir en GitHub Pages (sin previews por PR) o
   mover `/app/` a Vercel/Netlify/Cloudflare Pages para tener previews y
   dejar de commitear el build?
4. **¿El Andrés de `asesoria-andres` es el mismo Andrés?** Si es así, su
   usuario de producción y su acceso de desarrollo deben quedar separados.
5. **Casa Click:** ¿tenant sobre los módulos genéricos (como hoy) o producto
   con módulo propio? La recomendación técnica es mantenerlo genérico.
6. **Las migraciones 0111-0113 con datos reales**: confirmar que quedan fuera
   del repo a propósito y documentar dónde viven.
