# ANIMA_GUIDE.md

> **Guía oficial y contexto permanente del proyecto ANIMA TSC.**
> Documento de solo lectura generado a partir del análisis completo del código fuente y de la base de datos Supabase.
> No describe cómo *debería* ser ANIMA, sino cómo **es hoy**. Antes de desarrollar, leer este archivo.

Última actualización del análisis: estado del repositorio en la rama de trabajo, Service Worker `anima-v46`.

---

## 1. Resumen general de ANIMA

### Qué es ANIMA
ANIMA TSC ("The Soul of Creativity") es **un sistema vivo para organizar la memoria, la trayectoria, los proyectos y el crecimiento de una persona creativa**. Su premisa cultural fundacional:

> *"Aquí no existen usuarios. Existen **Almas**."*

No es un CRM, no es una red social, no es "solo una IA". Es un espacio personal (y opcionalmente colectivo) donde cada creador —un **Alma**— acumula su identidad, su obra, sus vínculos, sus finanzas y su progreso, sin perder nunca su identidad.

### Objetivo del proyecto
- Dar a cada Alma un **hogar digital permanente** para su trabajo creativo.
- Acompañar su **crecimiento** mediante un camino de niveles (gamificación ceremonial).
- Permitir crear **en solitario, en Clan o en Santuario** sin fragmentar la identidad.
- Llegar a una IA acompañante (**LUMBRE**) que lea la memoria del Alma.
- Esta es la **primera Alpha (The Founding Era)**, limitada por diseño a **100 Almas** (50 forman el "Consejo").

### Filosofía (principios que el código respeta literalmente)
1. **Privado por defecto.** Nada se comparte al Mundo automáticamente; compartir es siempre una elección explícita.
2. **ANIMA no depende obligatoriamente de internet.** Si no hay nube, funciona en modo local (localStorage). La capa Cloud es *best-effort*.
3. **Minimalismo y rapidez.** Estética sobria, pixel-art para iconografía, sin frameworks pesados.
4. **Lenguaje propio.** Conceptos con nombre (Alma, Esencia, Reino, Vínculo, Raíz, Huella…). No se sustituyen por términos genéricos.
5. **Llegada progresiva.** Los módulos se revelan a medida que el Alma sube de nivel.

### Estructura general
Aplicación **multipágina (MPA)** de HTML estático + JavaScript vanilla, sin build step. Cada `.html` carga sus scripts directamente. La app principal (el "Studio") vive en `studio.html` y concentra casi toda la lógica en `assets/js/anima.js`. Persiste en **Supabase** (Postgres + Auth + Storage + Realtime) con respaldo en **localStorage**. Se instala como **PWA** vía `manifest.webmanifest` + `sw.js`.

---

## 2. Arquitectura

### 2.1 Carpetas
```
/                        Raíz: páginas .html + manifest + sw.js + docs
  assets/
    css/                 Hojas de estilo (5 archivos)
    js/                  Lógica (8 archivos)
    img/                 icon.svg, lumbre.svg (la iconografía real es pixel-art en icons.js)
  supabase/
    migrations/          31 migraciones SQL (0002 … 0032) — historia del esquema
  README.md              Visión y mapa de páginas
  BIBLIA.md              Canon narrativo
  PROMPT-MAESTRO.md      Prompt Maestro Final (canon de la Alpha)
```

### 2.2 Páginas (rutas HTML)
Cada página es una "ruta" independiente (no hay router SPA). Navegación entre páginas = navegación de archivos.

| Archivo | Rol |
|---|---|
| `home.html` | **Morada principal / landing tras entrar.** `AnimaState.entryHref()` siempre devuelve `home.html`. |
| `index.html` | Portada pública de ANIMA TSC. |
| `studio.html` | **La App (el Studio).** Aquí vive el Taller, Mi Alma, Mundo, Clan, Santuario. |
| `entrar.html` | Inicio de sesión del Alma. |
| `recuperar.html` | Recuperación de contraseña (enlace + nueva clave). |
| `despertar.html` | Rito de entrada / onboarding ("Primer Despertar"). |
| `arbol.html` | Árbol de Almas público (mapa por país, contador X/100, Ecos). |
| `portfolio.html` | Portafolio público compartible (`?alma=<id>` o `?u=<slug>`, sin login). |
| `fundador.html` | Panel del Fundador (solo el Creador). |
| `planes.html` | Planes (Alma / Clan / Santuario). |
| `roadmap.html` | Master Roadmap V6. |
| `legal.html` | Legal. |
| `umbral.html`, `index.legacy-umbral.html` | **Versiones antiguas del umbral** (ver §9 Riesgos). |

### 2.3 Módulos JavaScript (`assets/js/`)
| Archivo | Líneas | Responsabilidad |
|---|---:|---|
| `anima.js` | ~4837 | **Núcleo del Studio.** Estado, navegación, todas las vistas (`v*`), el sistema de editores (`EDITORS`), renderizado, delegación de eventos. |
| `supabase.js` | ~377 | **Capa Cloud.** Cliente Supabase, Auth, y el objeto `Cloud` con todos los métodos de datos. Define `dbAlmaToState()`. |
| `anima-state.js` | ~277 | **Estado ceremonial** (`window.AnimaState`): onboarding, niveles de Esencia, afinidades, "última visita". Sistema **paralelo** al del Studio (ver §9). |
| `world-tree.js` | ~635 | **El Árbol Vivo del Mundo** (`window.WorldTree`): visualización global reactiva. |
| `seed.js` | ~114 | Configuración base: ladder de **niveles del Studio** (`LEVELS`), cuotas de almacenamiento (`LEVEL_STORAGE`), Alma invitada por defecto. |
| `portfolio.js` | ~131 | Lógica de la página pública `portfolio.html` (independiente del Studio). |
| `icons.js` | ~74 | Iconografía oficial pixel-art (grid 9×9, monocromo `currentColor`). |
| `rite.js` | ~98 | Helpers de partículas/transiciones para el rito de entrada. |

**Orden de carga en `studio.html`:** supabase-js (CDN) → `supabase.js` → `anima-state.js` → `seed.js` → `icons.js` → `world-tree.js` → `anima.js`. `anima.js` asume que todo lo anterior ya existe (variables globales compartidas, sin módulos ES).

### 2.4 Layouts
- **Studio:** `div.app` con menú lateral (`#nav`), área de contenido (`#view`) y barra inferior móvil (`nav.botnav#botnav`). En escritorio manda el menú lateral; en móvil manda la barra inferior (como Instagram).
- **Grid de tarjetas:** sistema de 12 columnas con clases `.s3 .s4 .s5 .s6 .s7 .s8 .s12` (definidas en `studio.css`). En móvil colapsan a `span 12`.
- **Páginas públicas** (home, arbol, portfolio): layouts propios y más simples.

### 2.5 Navegación (modelo de "Reinos / Moradas")
La navegación del Studio se organiza en **Reinos** (también llamados Moradas), definidos en `NAV_TREE` (`anima.js`):

| Reino (key) | Vistas hijas (sub-pestañas) |
|---|---|
| **Mi Alma** (`mialma`) | Núcleo, Trayectoria, Portafolio, Cronología, Insignias, Estadísticas, Visibilidad, Memorias, Biblioteca (+ Mi Plan plegado) |
| **Taller** (`taller`) | Resumen, **Proyectos, Tareas, Vínculos, Cotizador, Raíz, Agenda** |
| **Clan** (`clan`) | Panel, Plan de trabajo, Calendario, Proyectos, Recordatorios |
| **Santuario** (`santuario`) | (vistas `sant_*`) |
| **Mundo** (`mundo`) | Comunidad, Consejo, Crónica, Wandering Traces |

Funciones clave de navegación (todas en `anima.js`):
- `go(view)` — **único punto de cambio de vista.** Fija `state.view`, resetea sub-estados de detalle (`projOpen`, `vinOpen`, `cotMode`, `pfEdit`), `save()`, `renderAll()`, y dispara cargas según la vista.
- `sectionOfView(v)` — mapea una vista a su Reino.
- `moradaTabs(view)` — renderiza las sub-pestañas del Reino actual. En **escritorio**: fila con subrayado. En **móvil**: **stepper `‹ Pestaña ›`** (botones grandes cíclicos) — ver §6 y §9.
- `renderNav()` — construye el menú lateral + Mundo/Mi Plan según plan/nivel.
- `renderBotnav()` (dentro de `renderNav`) — barra inferior móvil con Reinos núcleo + LUMBRE.

### 2.6 Estados
No hay framework de estado. Existe **un único objeto global `state`** (en `anima.js`) persistido íntegro en `localStorage` bajo la clave `anima_alpha_state_v2` (`save()` = `JSON.stringify(state)`; `load()` al arrancar).

Claves de `state` observadas (no exhaustivo de valores, sí de nombres):
```
view, viewAs, almas, currentId, navOpen, almaTab,
cotMode, cotTab, projOpen, projView, vinOpen, vinView, tareaView,
finPeriod, finCat, pfEdit, postCat, wallFilter, lumbreMode,
cloudAlmas, cloudQuotes, cloudPosts, cloudEcos, cloudTimeline,
cloudBadges, cloudNotices, cloudChangelog, cloudProposals, cloudSoulsCount,
following, followers, whispers, commentCount, postSparkCount, mySparkSet,
clanMeta, clanSearch, clanAddOpen, santMeta, santCache, santSearch, santAddOpen,
teamCache, rewardCfg, badgeCatalog, calMode, calCursor, calSel, scalCursor, scalSel,
tourI, tourPool, wt* (wtPool, wtCurrent, wtConstel, wtRecent, wtSaved, wtSparked), …
```
Hay **un segundo estado ceremonial** en `localStorage` bajo `anima_state` gestionado por `AnimaState` (`anima-state.js`), independiente del anterior.

`me()` devuelve el Alma activa. `getCfg(a)` lee la configuración/preferencias del Alma (módulos visibles, moneda, etc.) desde `localStorage` (`anima_cfg_<almaId>`), sincronizada con la tabla `preferences`.

### 2.7 "Hooks" / convenciones de eventos
No hay hooks de framework. Se usa **delegación de eventos sobre `document`**:
- `document.addEventListener("click", …)` — maneja `[data-view]`, `[data-go]`, `[data-add]`, `[data-edit]`, `[data-del]`, `[data-alma]`, `[data-pub]`, `[data-mode]`, y un largo etcétera de `id`/`data-*` específicos (modales, cotizador, proyectos, vínculos, tareas, stepper, etc.).
- `document.addEventListener("change", …)` — selects: moneda, estados de proyecto (`.kstatus`), estado de tarea (`.tk-status`), filtros de Raíz (`[data-finperiod]`, `[data-fincat]`), formato del cotizador (`#q_fmt`), inputs de archivo, roles.
- `document.addEventListener("input", …)` — live preview del cotizador (`.cot-inspector` → `qLive()`), búsquedas en vivo (clan/picker), conversor de moneda.

Convención: **los botones de acción llevan `type="button"`** (los de navegación se añadieron explícitamente para evitar submits accidentales en móvil).

### 2.8 Servicios (objeto `Cloud` en `supabase.js`)
Auth: `session, user, signUp, signIn, signOut, onAuth, resetPassword, updatePassword, onPasswordRecovery`.
Carga del Alma: `myAlma, loadModules, allAlmas, allPortfolio`.
CRUD genérico: **`insertRow, updateRow, deleteRow`** (usados por el sistema `EDITORS`).
Módulos: `addMemory, addProject, addFinance, addTrajectory, addPortfolio, addAgenda, addLibrary, clients, quotes, getPrefs, savePrefs`.
Progreso: `setXP, updateAlma, completeAwakening, addEssence, setEssence, claimReward, rewardConfig/Set, rewardStats`.
Comunidad: `posts, comments, allCommentCounts, allPostSparks, togglePostSpark, toggleFollow, myFollowing, myFollowers, sendFeedback`.
Susurros/avisos: `myWhispers, markWhispersRead, sendSignal, subscribeWhispers, changelog(+add/delete), worldNotices(+add/delete)`.
Clan: `clan, clans, clanCreate/Update/Rename/Delete`, invites (`checkInvite, redeemInvite`).
Equipo/recordatorios: `reminders(+add/update/delete), teamTasks(+add/update/delete)`.
Media: `uploadMedia, adminUpdateAlma`.

---

## 3. Tecnologías

- **Framework:** ninguno. **JavaScript vanilla** (ES2017+, sin transpilación, sin bundler). Render por *template strings* que se inyectan en `innerHTML`.
- **Librerías externas:** únicamente `@supabase/supabase-js@2` (CDN jsDelivr) y la fuente **Press Start 2P** (Google Fonts, para el pixel-art). El resto es propio.
- **Supabase** (proyecto `jwxeowowuxmijuexdrua`):
  - **Auth** real (email + contraseña; `persistSession`, `autoRefreshToken`, `detectSessionInUrl`). Clave publishable en cliente.
  - **Postgres** con **RLS** en todas las tablas de datos.
  - **Realtime** (Ecos / susurros).
  - **Storage** para media.
- **Autenticación:** `Cloud.signIn/signUp`. Un trigger `handle_new_user` crea el `almas` row al registrarse. El "Creador" se detecta en `refreshAuth` (`isCreator`) y desbloquea todo.
- **Storage:** buckets `avatars`, `media`, `portfolio` (públicos) y `temp` (privado). Cuotas por nivel en backend (`storage_quota()`) espejadas en `LEVEL_STORAGE` (cliente).
- **Deploy:** sitio estático (GitHub Pages — hay `.nojekyll`). **PWA** con `sw.js` *network-first* para archivos propios (cache `anima-vNN`, se sube el número en cada deploy) y *passthrough* para Supabase/CDN. `start_url: home.html`, `display: standalone`.

---

## 4. Base de datos (Supabase / Postgres `public`)

**46 tablas.** Todas las tablas de datos personales del Alma usan el mismo patrón de RLS: política `ALL` con `owns_alma(alma_id)`.

### 4.1 Tablas núcleo del Alma
| Tabla | Columnas clave | RLS |
|---|---|---|
| **almas** (43 cols) | `id, user_id, slug, name, role, city, country, bio, color, level, xp, clan, santuario, tags, plan, team_role, council, world_access, essence, affinity, avatar_url, banner_url, handle, visibility, awakening_completed, is_founding, origin_soul, origin_number, era, …` | 7 políticas (SELECT/INSERT/UPDATE/DELETE) |
| **preferences** | `alma_id, data(jsonb)` | ALL |

### 4.2 Tablas del Taller (lo que el desarrollo reciente toca)
| Tabla | Columnas | RLS | Notas |
|---|---|---|---|
| **projects** | `id, alma_id, title, client, status, pct, description, started_at, due_at, budget, paid, deliverables, tags, client_id` | `ALL owns_alma` | `client` es texto; `client_id` enlaza a `clients`. |
| **tasks** | `id, alma_id, title, priority, status, due_at, project, notes, sort` | `ALL owns_alma` | Creada en Fase 3 (Tareas). `project` es texto. |
| **clients** | `id, alma_id, name, email, phone, notes, responsable, type, kind, role` | `ALL owns_alma` | `kind` (cliente/colaborador) + `role` = Fase 6. **`type` y `responsable` son legados** (ver §9). |
| **finance_entries** | `id, alma_id, kind(income/expense), title, amount, period, category, occurred_at, method, notes, project_id` | `ALL owns_alma` | `project_id` existe pero la UI de Raíz aún no lo usa. |
| **quotes** | `id, alma_id, client_id, project_id, title, client_name, discipline, currency, tax_pct, notes, items(jsonb), subtotal, total, status, doc_type, design(jsonb)` | `ALL owns_alma` | `doc_type` + `design` = Fase 4 (editor visual). |
| **agenda** | `id, alma_id, at_time, title, on_date, notes` | `ALL owns_alma` | |
| **library** | `id, alma_id, title, kind, url, notes` | `ALL owns_alma` | Base de la futura Biblioteca (Fase 8). |
| **memories** | `id, alma_id, title, detail, tags` | `ALL owns_alma` | |
| **trajectory** | `id, alma_id, year, title, detail` | `ALL/SELECT` | |
| **portfolio** | `id, alma_id, title, kind, color, year, link, description, images(jsonb), category` | `ALL/SELECT` (lectura pública) | Alimenta `portfolio.html`. |

### 4.3 Comunidad / Mundo
`posts, comments, post_sparks, post_likes, follows, echoes, proposals, votes, badges, soul_badges, soul_timeline, activity_log, feedback, whispers, changelog, world_notices, invites`.
`world_tree_state, world_tree_nodes, world_tree_events, world_tree_connections` (el Árbol Vivo).

### 4.4 Colectivos
- **Clan:** `clans, clan_invites, clan_projects, clan_events, team_tasks, reminders`.
- **Santuario:** `santuarios, santuario_invites, santuario_projects, santuario_tasks, santuario_events, santuario_reports`.
- Recompensas: `reward_config, alma_rewards`.

### 4.5 Relaciones principales
- `auth.users (1) → almas (1)` vía `user_id` (creado por trigger).
- `almas (1) → N` projects/tasks/clients/finance_entries/quotes/agenda/library/memories/trajectory/portfolio (vía `alma_id`).
- `clients (1) → N` projects/quotes (vía `client_id`; además enlace por **nombre** en la UI).
- `projects (1) → N` finance_entries (`project_id`, aún no explotado) y quotes (`project_id`).
- `clans`/`santuarios` agrupan Almas por el campo `almas.clan` / `almas.santuario` (texto).

### 4.6 Políticas (RLS)
- **Helper central:** `owns_alma(uuid)` → `true` si el `alma_id` pertenece al `auth.uid()` actual. Lo usan projects, tasks, clients, finance_entries, quotes, agenda, library, memories, preferences (política única `ALL`).
- Otras tablas combinan SELECT público (lectura del Árbol/Almas/portafolio/echoes/badges) con INSERT/UPDATE/DELETE restringidos por funciones de pertenencia (`in_my_clan`, `in_my_santuario`, `is_clan_admin`, `leads_clan`, `is_creator`, etc.).

### 4.7 Funciones (RPC) — ~55, destacadas
- Identidad/progreso: `owns_alma`, `is_creator`, `complete_awakening`, `add_essence`, `award_badge`, `claim_reward`, `claim_time_badges`, `give_spark`, `log_timeline`, `log_activity`.
- Mundo: `emit_echo`, `souls_count`, `souls_by_country`, `world_monitor`, `world_tree_get`, `world_tree_record`.
- Comunidad: `toggle_follow`, `toggle_post_spark`, `send_signal`, `mark_whispers_read`, `create_proposal`, `cast_vote`, `list_proposals`.
- Clan: `clan_create/update/rename/delete/leave`, `clan_add_member/remove_member/set_role`, `join_clan_by_code`, `is_clan_admin`, `leads_clan`, `can_edit_clan`, `in_my_clan`.
- Santuario: `santuario_create/update/leave`, `santuario_add_member/remove_member/set_role`, `santuario_gen_invite`, `santuario_join_by_code`, `admin_santuario`, `in_my_santuario`.
- Invitaciones/recompensas/fundador: `check_invite`, `redeem_invite`, `reward_config_set`, `reward_stats`, `founder_stats`, `storage_quota(p_level)`.

### 4.8 Triggers
- **`on_auth_user_created`** — `AFTER INSERT` en `auth.users` → ejecuta `handle_new_user()` (crea el Alma). **Es el único trigger** del esquema.

### 4.9 Storage
| Bucket | Público | Uso |
|---|---|---|
| `avatars` | sí | fotos de perfil del Alma |
| `media` | sí | media general (`Cloud.uploadMedia`) |
| `portfolio` | sí | imágenes de obras del portafolio |
| `temp` | no | temporales |
Cuotas por nivel: `public.storage_quota(level)` (backend) espejado en `LEVEL_STORAGE` (cliente). **Tope actual: 100 MB / Alma máx.** (ver §9 respecto a la Fase 8 "Biblioteca 200 MB").

---

## 5. Componentes reutilizables (NO duplicar)

ANIMA no tiene "componentes" en sentido de framework: son **funciones que devuelven HTML** y **sistemas de datos compartidos**. Reutilizar estos; no recrearlos.

### 5.1 Sistema de Editores — `EDITORS` (lo más importante)
Objeto en `anima.js` que define el **CRUD genérico** de cada tipo de registro. Claves existentes:
`proyecto, tarea, cliente, ingreso, egreso, hito, obra, memoria, cita, doc`.

Cada editor declara: `{ title, table, get(a), push, xp, fields[], toRow(v) }`.
- `openRecord(kind, idx)` abre el modal genérico (`#recordModal`) y pinta `fields` (soporta tipos: texto, `num`, `ta` textarea, `sel` select, `date`, `color`, `img`, `clients` con datalist).
- `saveRecord()` / `deleteRecord(kind, idx)` persisten local + nube vía `Cloud.insertRow/updateRow/deleteRow`.
- `acts(kind, i)` genera los botones **editar/eliminar** (`data-edit="kind:idx"`, `data-del="kind:idx"`).

**Para un módulo CRUD nuevo: añadir una entrada a `EDITORS` y reutilizar `openRecord`/`acts`. No escribir modales ni guardado a medida.**

### 5.2 Navegación
- `moradaTabs(view)` — sub-pestañas + stepper móvil. Único lugar para las pestañas de un Reino.
- `go(view)` — único cambio de vista.
- `renderNav()` / `renderBotnav()` — menú lateral y barra inferior.
- `navItem()`, `lockedNavItem()` — ítems de menú (con gating de nivel).

### 5.3 Patrones de vista (Taller)
- **Grid + detalle:** `vProyectos` (Tarjetas/Lista/Kanban + `vProyectoDetalle`) y `vClientes` (`vVinculoDetalle`). Mismo patrón de "grid de tarjetas → panel de detalle" con `state.<x>Open`.
- **Lista/Kanban con segmento:** Tareas (`vTareas`) y Proyectos comparten el control `.seg` y los estilos `.tk-*`, `.kanban/.kcol/.kcard`.
- **Botón flotante:** clase `.fab` (`＋ Nuevo …`), redondo en móvil.
- **Editor visual de documento:** `renderQDoc(a, opt)` (lienzo del Cotizador, también base del PDF) + `vCotEditor` (inspector con pestañas). `qLive()` actualiza el lienzo sin perder foco.

### 5.4 Helpers de UI/datos (en `anima.js`, reutilizar)
`esc(s)` (escape HTML), `money(n)` / `fmtq(n,cur)` (formato moneda), `initials(name)`, `shade(hex,p)`, `tallerDate(d)` / `finFmtMonth(k)`, `animaMark(color)` (logo SVG), `pixelSprite(level)`, `ANIMA_ICON(ic, fallback)` (iconos pixel), `sum(arr)`.

### 5.5 Estado/nivel (compartidos vía `seed.js`)
`LEVELS`, `levelByKey`, `levelRank`, `levelProgress(xp)`, `storageLimit(key)`, `LEVEL_STORAGE`.

### 5.6 Qué NO duplicar
- ❌ Otro objeto cliente de Supabase: usar **`Cloud`** (existe uno en `supabase.js` y otro independiente en `portfolio.js` para la página pública — no añadir más).
- ❌ Modales/guardado CRUD propios: usar **`EDITORS` + `openRecord`**.
- ❌ Helpers `esc/shade/initials/isImg`: ya existen (ojo: `portfolio.js` los redefine por ser página aislada).
- ❌ Lógica de cambio de vista: usar **`go()`**, nunca tocar `location` ni re-render manual del `#view`.
- ❌ Ladders de nivel nuevas: ya hay dos (ver §9); no crear una tercera.

---

## 6. Sistema visual

Definido sobre todo en `assets/css/anima.css` (base + tokens) y `assets/css/studio.css` (Studio). Otros: `identity.css`, `umbral.css`, `world-tree.css`.

### 6.1 Tipografías
- **UI:** stack del sistema — `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Arial, sans-serif`.
- **Pixel-art / acentos ceremoniales:** `"Press Start 2P"` (clase `.pixel-font`).
- **Monoespaciada (etiquetas tipo "kicker"):** `ui-monospace, "DejaVu Sans Mono", monospace` (usada en `.pd-k`, `.fin-flabel`, etc.).
- **Documento del Cotizador:** `Georgia/Times` (serif) según la opción de tipografía elegida (`.qf-serif/.qf-mixta/.qf-sans`).

### 6.2 Paleta (tokens en `:root` de `anima.css`)
```
--bg #f5f5f7      --card rgba(255,255,255,.78)   --card-solid #fff
--text #111       --muted #6e6e73               --soft #d9d7ce   --warm #b8a892
--gold #d0aa63    (dorado de marca)
--line rgba(0,0,0,.08)   --line-strong rgba(0,0,0,.14)
--ok #3a8a5f      --warn #b8862f                --danger #b23b3b
--shadow / --shadow-soft (sombras)
--radius 28px     --radius-sm 18px
```
Acentos del Cotizador (`QD_ACCENTS`): `#d0aa63 #c8543f #3a8a5f #3a6e8a #6a4a78 #b23b8a #111`.
Cada nivel tiene un color propio (`LEVELS[].color`).

### 6.3 Espaciados y grid
- Radios: tarjetas `~16–28px`, chips/pills `999px`.
- Grid de 12 columnas (`.s3…s12`), gap ~14–16px; colapsa a 1 columna ≤960px.

### 6.4 Animaciones / transiciones
- Transición de cuerpo de vista: `.anima-page-transition` (envuelve solo el cuerpo, no la barra de pestañas → sin parpadeo).
- `@keyframes` existentes: `ptrspin` (spinner), `cpulse` (pulso dorado de constelación), entre otros.
- Transiciones suaves estándar `.16–.3s ease` en botones, tarjetas, drawer, toggles, pestañas (subrayado con `transform: scaleX`).
- En móvil el auto-scroll de la pestaña activa se **desactiva** (solo escritorio).

### 6.5 Primitivos
- **Botones `.btn`:** pill negra por defecto; variantes `.secondary` (blanco), `.ghost` (borde), `.gold` (degradado dorado), `.sm` (pequeño). Icono-acción `.ia` (cuadrado), `.ia.danger`.
- **Tarjetas `.card`** (+ `.s*` para ancho). Variantes contextuales: `.tl-card` (resumen), `.proj-card`, `.vin-card`, `.tk-card`, `.kcard`.
- **Inputs `.field`** (`label` + `input/select/textarea`): borde `--line`, foco `--gold`.
- **Segmento `.seg/.seg-b`** (toggles Tarjetas/Lista/Kanban, Todos/Clientes/Colaboradores).
- **Modales:** `#recordModal` (editor genérico), `#editModal`, `#publicModal`, `#postModal`, `#feedbackModal`, etc. Patrón: backdrop + `.classList.add("open")`; cierre por `#xClose` o `bdClose`.
- **Badges/pills:** `.pill`, `.pill.gold`, badges de estado (`.proj-badge .st-*`, `.tk-badge .ts-*`, `.vin-badge .vb-*`, prioridades `.pr-*`).
- **Botón flotante `.fab`.** **Stepper móvil `.morada-step/.morada-step-btn/.morada-step-cur`.**

---

## 7. Lenguaje de ANIMA (conceptos vigentes — no inventar)

| Concepto | Significado en el código |
|---|---|
| **Alma** | La persona/usuario. Tabla `almas`. Nunca decir "usuario". |
| **Esencia** | Moneda de progreso ceremonial (`almas.essence`, `AnimaState`). |
| **XP** | Experiencia del Studio (`almas.xp`) que mueve los niveles del Studio. |
| **Nivel / Camino** | Escalera de crecimiento. **Ojo:** existen dos (ver §9). |
| **Reino / Morada** | Sección mayor del menú: Mi Alma, Taller, Clan, Santuario, Mundo. |
| **Mi Alma** | Identidad: Núcleo, Trayectoria, Portafolio, Cronología, Insignias, Memorias, Biblioteca. |
| **Taller** | El trabajo: Proyectos, Tareas, Vínculos, Cotizador, Raíz, Agenda. |
| **Raíz** | Las **finanzas** del Alma (ingresos/egresos/rentabilidad). |
| **Vínculos** | Los **contactos**: Clientes y Colaboradores (`clients.kind`). |
| **Proyectos / Flujo de trabajo** | Trabajos con etapas (`FLOW`: Cotizando→Aprobado→En producción→Revisión→Entregado→Cerrado). |
| **Cotizador** | Creador de propuestas/documentos (cotización, propuesta, factura, orden, anticipo, acuerdo). |
| **Huella** | Lo que el Alma deja en el mundo (obra publicada, entrada en el Muro). |
| **Memoria / Cronología** | Recuerdos y línea de tiempo del Alma (`soul_timeline`). |
| **LUMBRE** | La IA acompañante (se "despierta" en niveles altos). |
| **Clan** | Crear con otras Almas (equipo). |
| **Santuario** | Estructura colectiva mayor (academia/organización). |
| **Mundo / Árbol de Almas** | El espacio común: mapa de Almas, **Ecos**, Crónica, Muro/Comunidad. |
| **Ecos** | Feed suave en tiempo real ("✦ Alicia despertó"). Tabla `echoes`. |
| **Insignias** | Logros secretos (`badges`/`soul_badges`). |
| **Consejo** | Las primeras 50 Almas (`almas.council`). |
| **Despertar / Primer Despertar** | Onboarding/rito de entrada (`awakening_completed`). |
| **Founding Era / Origen** | La Alpha actual; Almas fundadoras (`is_founding`, nivel `FOUNDING`/ORIGEN). |
| **Afinidad** | Naturaleza creadora (Creador, Constructor, Visionario, Explorador, Estratega). |
| **Forma / Plan** | Plan del Alma: ALMA, CLAN, SANTUARIO (`PLAN_TIERS`). |

---

## 8. Flujo de navegación

### 8.1 Cómo entra y navega un Alma
1. **Entrada:** todas las rutas de entrada conducen a `home.html` (`AnimaState.entryHref()`). Quien no ha despertado ve el Resumen del Mundo; quien despertó ve su Alma.
2. **Sesión:** `entrar.html` → `Cloud.signIn`. Sin nube, ANIMA funciona local (Alma "Invitada" de `seed.js`).
3. **Studio (`studio.html`):** carga `state`, refresca Auth, `renderAll()`.
4. **Dentro del Studio:**
   - **Escritorio:** menú lateral (Reinos) → al elegir un Reino se entra a su vista por defecto y aparecen las **sub-pestañas** (fila con subrayado).
   - **Móvil:** barra inferior (Reinos núcleo + LUMBRE) → dentro, **stepper `‹ Pestaña ›`** para moverse entre sub-pestañas.
   - `go(view)` ejecuta el cambio; resetea detalles abiertos; persiste; re-renderiza.
5. **Gating:**
   - **Por nivel** (`levelAllows` / `VIEW_MIN_LEVEL`): algunas vistas se "abren" al subir (p. ej. `estadisticas`, `visibilidad` → TOTEM; `clientes/agenda/biblioteca/cronologia/insignias` → ROOT).
   - **Por plan** (`planAllows`): Clan/Santuario solo con la Forma correspondiente.
   - El **Creador** (`isCreator`) ve todo; "Ver como" (`state.viewAs`) previsualiza otros umbrales sin alterar datos.

### 8.2 Rutas (páginas) que existen
Ver §2.2. Las "rutas internas" del Studio son **vistas** (`state.view`), no URLs.

### 8.3 Módulos (vistas) que existen
Cada Reino y sus hijos (§2.5). Funciones de vista: el conjunto `v*` (`vMiAlma, vTaller, vProyectos, vProyectoDetalle, vTareas, vClientes, vVinculoDetalle, vCotizador/vCotEditor/vCotGaleria, vFinanzas, vAgenda, vMemoria, vBiblioteca, vTrayectoria, vPortafolio, vCronologia, vInsignias, vEstadisticas, vVisibilidad, vMundo, vComunidad, vConsejo, vCronica, vClanPanel, vEquipo, vCalendario, vProyectosClan, vRecordatorios, vSant*, vConfig, vConsola, vWanderingTraces, …`).

---

## 9. Riesgos y observaciones (sin modificar nada)

### 9.1 Dos sistemas de niveles en paralelo ⚠️ (el más importante)
- **`anima-state.js` → `AnimaState.LEVELS`**: 7 niveles basados en **Esencia** con claves `CHISPA, RAIZ, PULSO, HUELLA, TOTEM, AURA, ANIMA`. Usado por el rito, `home.html` y el menú ceremonial.
- **`seed.js` → `LEVELS`**: 8 niveles basados en **XP** con claves `FOUNDING, EMBER, ROOT, WILD, TOTEM, AETHER, SPIRIT, ANIMA` (sus `label` muestran ORIGEN/CHISPA/RAÍZ/PULSO/HUELLA/TÓTEM/AURA/ANIMA). Usado por el Studio (`anima.js`, `almas.level`, `almas.xp`).
- **Colisión de nombres:** `TOTEM` y `ANIMA` existen en ambos con significados distintos; los `label` cruzan términos (`AETHER` se muestra como "TÓTEM"). Cualquier trabajo sobre niveles debe declarar **a cuál sistema** se refiere. No unificar sin decisión explícita.

### 9.2 Columnas legadas / redundantes en `clients`
`clients` tiene `type`, `responsable` (antiguas) **y** `kind`, `role` (nuevas, Fase 6). La UI vigente usa `kind`/`role`. `type`/`responsable` parecen sin uso → candidatas a deprecación (no tocar sin auditar lecturas).

### 9.3 `finance_entries.project_id` sin explotar
La columna existe (permitiría rentabilidad por proyecto), pero la vista **Raíz** filtra por mes/categoría, no por proyecto. Oportunidad de mejora, no bug.

### 9.4 Cuota de almacenamiento 100 MB vs "Biblioteca 200 MB"
`LEVEL_STORAGE`/`storage_quota()` topan en **100 MB** por Alma. Si la Fase 8 (Biblioteca) exige 200 MB, hay que **reconciliar backend + cliente** antes de construirla. Discrepancia a resolver explícitamente.

### 9.5 Helpers duplicados
`esc`, `shade`, `initials`, `isImg` están en `anima.js` **y** redefinidos en `portfolio.js` (página pública aislada, por lo que es deliberado). No "arreglar" fusionándolos sin entender que `portfolio.html` no carga `anima.js`.

### 9.6 Archivos potencialmente obsoletos
- `index.legacy-umbral.html` (sufijo "legacy").
- `umbral.html` + `umbral.css` (el rito ahora es opcional; `entryHref` siempre va a `home.html`). Verificar si siguen enlazados antes de eliminar.

### 9.7 Service Worker network-first + cache manual
`sw.js` es *network-first*; la versión `anima-vNN` se incrementa **a mano** en cada deploy para invalidar caché. Olvidar subirla deja a las Almas con assets viejos (especialmente en PWA instalada). En móvil puede requerir cerrar/reabrir la app.

### 9.8 Estado monolítico en `localStorage`
Todo `state` se serializa íntegro (incluye `cloud*` cacheado). Riesgo de crecer mucho y de incoherencias si cambia la forma del objeto entre versiones. No hay migración de esquema de `state`.

### 9.9 `anima.js` muy grande (~4.8k líneas)
Concentra casi toda la lógica. Es manejable pero conviene seguir agrupando por secciones comentadas (como ya está) y **no** fragmentar en módulos ES sin replantear el orden de carga global.

### 9.10 Superficie amplia ya construida
Clan, Santuario, World Tree, Comunidad, Recompensas, Consejo y votaciones ya tienen tablas, RPCs y vistas. Cambios en helpers compartidos (`go`, `renderAll`, `EDITORS`, RLS `owns_alma`) impactan muchas pantallas: probar transversalmente.

---

## 10. REGLAS PARA CODEX

> Reglas obligatorias para cualquier sesión/agente que modifique ANIMA. Pensadas para no romper lo construido ni la identidad del proyecto.

1. **No modificar funcionalidades existentes** sin pedirlo: extender, no reemplazar. Si una vista ya funciona (Proyectos, Tareas, Raíz, Vínculos, Cotizador…), añadir sin quitar.
2. **No romper la navegación.** Cambiar de vista **solo** con `go(view)`. No tocar `location`, no re-renderizar `#view` a mano, no introducir routers. Mantener `sectionOfView`, `moradaTabs` y el stepper móvil coherentes.
3. **Reutilizar componentes/sistemas.** CRUD nuevo → entrada en `EDITORS` + `openRecord`/`acts`. UI → `.btn .card .field .seg .fab .proj-card .tk-*`. Datos → métodos de `Cloud` (`insertRow/updateRow/deleteRow`, etc.).
4. **No crear componentes/duplicados** ya existentes: nada de segundos clientes Supabase, segundos modales de edición, segundos helpers `esc/shade/initials`, ni terceras escaleras de nivel.
5. **Mantener la identidad visual.** Usar los tokens de `:root` (`--gold`, `--text`, `--muted`, radios, sombras). No introducir paletas, fuentes ni librerías UI nuevas sin autorización.
6. **No modificar Supabase sin autorización.** Nada de `apply_migration`/DDL, cambios de RLS, funciones o buckets sin permiso explícito. Si una feature exige esquema nuevo, **proponerlo primero**. Toda tabla de datos del Alma debe llevar RLS `owns_alma(alma_id)`.
7. **No cambiar nombres definidos en ANIMA** (Alma, Esencia, Reino/Morada, Vínculo, Raíz, Huella, Proyecto, Cotizador, Clan, Santuario, Mundo, Ecos, LUMBRE…). El lenguaje es parte del producto.
8. **Mantener compatibilidad móvil.** Targets táctiles grandes, sin pull-to-refresh accidental (`overscroll-behavior`), botones de navegación con `type="button"`, layouts que colapsen a 1 columna, probar el stepper de pestañas.
9. **Mantener el rendimiento y el modo offline.** Sin dependencias pesadas; render por template strings; `Cloud` siempre *best-effort* (la app debe seguir viva sin internet). No bloquear la UI esperando la nube.
10. **Privacidad por defecto.** Ningún dato del Alma se publica al Mundo automáticamente; compartir es siempre una acción explícita del Alma.
11. **Versionar el Service Worker.** Si se tocan assets (`assets/**`, `.html`), subir `CACHE = "anima-vNN"` en `sw.js`.
12. **Probar transversalmente.** Cambios en `go`, `renderAll`, `EDITORS`, `dbAlmaToState`, `owns_alma` o helpers compartidos afectan muchas pantallas: validar Mi Alma, Taller y Mundo antes de cerrar.
13. **Documentar decisiones que afecten esquema o niveles** y reflejarlas aquí (`ANIMA_GUIDE.md`) para futuras sesiones.

---

*Fin de ANIMA_GUIDE.md — documento de análisis. No se modificó ningún archivo del proyecto para generarlo.*
