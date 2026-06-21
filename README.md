# ANIMA TSC — The Soul of Creativity

> Aquí no existen usuarios. Existen **Almas**.

ANIMA no es un CRM. No es una red social. No es solo una IA.
Es **un sistema vivo** para organizar la memoria, la trayectoria, los proyectos y el
crecimiento de una Alma —sola, en un Clan o en un Santuario— sin perder nunca su identidad.

Este repositorio contiene la **primera Alpha** de ANIMA (The Founding Era), sembrada con
**10 Almas Fundadoras** de LATAM y España.

---

## 🌐 Páginas

| Archivo | Qué es |
|---|---|
| `alpha.html` | **ANIMA · Alpha** — la experiencia definitiva del *Prompt Maestro Final*: Origen ceremonial (una sola vez), menú definitivo (Mi Alma · Taller · Clan · Mundo · Mi Plan), la Esencia única, los Despertares y el Árbol vivo en pixel art |
| `PROMPT-MAESTRO.md` | **Prompt Maestro Final** — el canon de la Alpha (junto a `BIBLIA.md`) |
| `index.html` | Portada pública de ANIMA TSC |
| `entrar.html` | **Entrar** — inicio de sesión del Alma |
| `recuperar.html` | **Recuperar contraseña** — pide enlace y fija la nueva clave |
| `studio.html` | **La Alpha** — la app del Studio con las 10 Almas |
| `arbol.html` | **Árbol de Almas** — mapa vivo por país, contador `X / 100`, Ecos de ANIMA y LUMBRE despertando |
| `fundador.html` | **Panel del Fundador** — comunidad, activos, obras, feedback y estado (solo el Creador) |
| `roadmap.html` | Master Roadmap V6 · The Founding Era |

### Arquitectura Alpha 2026

La Alpha oficial está limitada a **100 Almas** (exclusividad por diseño) y añade:

- **Cronología del Alma** (`soul_timeline`) — *"Porque ANIMA recordará."* Cada hito
  (despertar, obra, nivel, insignia) queda escrito y se ve en el Studio → Esencia → Cronología.
- **Ecos de ANIMA** (`echoes`) — el espacio vivo: *"✦ Alicia despertó en España"*. Feed
  suave **en tiempo real** (Supabase Realtime), sin scroll infinito.
- **Árbol de Almas** — el mapa de Almas (puntos sobre el planeta) es la referencia dentro
  de la ventana de **Comunidad**, con panel de Ecos, conteo por país y contador `X / 100`.
  `arbol.html` es la versión pública de la misma pantalla.
- **Insignias secretas** (`badges` / `soul_badges`) — no se anuncian, se descubren
  (Primer Latido, Alma Fundadora, Explorador, Eco Vivo, Guardián, Persistencia).
- **Consejo de Almas** — las primeras **50** Almas (`almas.council`) reciben la insignia
  *Alma Fundadora* y acceden a **Votaciones**: proponen funciones y votan cambios
  (`proposals` / `votes`, vista *Consejo* en el Studio).
- **Sistema de logs** (`activity_log`) — registro privado de cada acción (login, logout,
  obra subida, nivel desbloqueado…).
- **Navegación que crece con el nivel** — el menú revela ventanas a medida que el Alma sube; las que aún no alcanza aparecen **bloqueadas** (candado + nivel que las abre) y muestran una pantalla explicativa.
- **Planificación del Santuario** — los ADMIN de un Santuario coordinan a gran escala (tablero, proyectos y calendario): `santuario_tasks` / `santuario_projects` / `santuario_events` (RLS por `in_my_santuario` / `admin_santuario`).
- **Resumen del Mundo** — en Comunidad, panorama de Clanes/Santuarios/niveles; acceso restringido que **concede el Fundador** desde la Consola (`almas.world_access`).
- **Almacenamiento por nivel** — `storage_quota(level)` + **buckets separados**
  (`avatars` ≤ 2 MB, `portfolio` ≤ 10 MB, `temp` privado).
- **Panel del Fundador** — `founder_stats()` (gated por el correo del Creador).

- **El Árbol Vivo del Mundo** (`world_tree_state` · `world_tree_events` · `world_tree_nodes`
  · `world_tree_connections`) — el **corazón vivo** de ANIMA dentro de la ventana de
  **Comunidad** (la vista *Mundo*). No es decoración ni una barra de progreso: un Árbol
  en **pixel art** que reacciona a cada acción de las Almas. *Toda acción deja una Huella;
  toda Huella altera el Árbol.* Cada Huella, Chispa, Eco, Memoria, Constelación, nivel o
  Ritual entrega **Esencia** al Árbol, enciende hojas/flores/frutos/raíces, recalcula el
  **Estado del Mundo** (Latente · Sereno · Resonando · Floreciendo · Luminoso · Despertar)
  y puede desatar **Fenómenos** (Lluvia de Ecos, Nueva Rama, Fruto del Árbol, Nueva
  Estrella, Aurora, Latido Mayor, Origen Renacido). Motor: `assets/js/world-tree.js`
  (`WorldTreeSystem`), con respaldo **local** si no hay nube. Migración: `0020_world_tree.sql`.

Todo vive en la **migración `0013_alpha_2026.sql`** (idempotente): Supabase → SQL Editor →
pega TODO → Run.

El frontend es **estático** (HTML + CSS + JS, sin build). El backend es **Supabase**
(Postgres + Auth) para auth real y persistencia. Si no hay conexión, ANIMA sigue
funcionando en **modo Fundadores local** — fiel a la filosofía: *ANIMA no depende
obligatoriamente de internet.*

### Backend (Supabase)

- **Auth real**: cada usuario que se registra **nace como un Alma** (trigger
  `on_auth_user_created`).
- **Esquema**: `almas` (Nivel 1) + módulos `projects`, `finance_entries`,
  `trajectory`, `portfolio`, `memories`, `library`, `agenda`.
- **Privacidad por RLS** (Mi Alma ≠ Mi Clan):
  - *Cara pública* (lectura para todos): `almas`, `trajectory`, `portfolio`.
  - *Privado* (solo el dueño): `projects`, `finance_entries`, `memories`,
    `library`, `agenda`.
- Las **10 Almas Fundadoras** están sembradas en la nube (perfil público) y
  alimentan la constelación.
- La clave usada en el cliente es la **publishable key** (segura para frontend);
  la seguridad real vive en las políticas RLS.

### Estructura

```
.
├── index.html              · Portada
├── studio.html             · App (Alpha)
├── roadmap.html            · Roadmap V6
└── assets/
    ├── css/
    │   ├── anima.css        · Sistema de diseño (paleta, marca, componentes)
    │   └── studio.css       · Layout de la app
    └── js/
        ├── seed.js          · Niveles, modos de LUMBRE y las 10 Almas fundadoras
        └── anima.js         · Lógica del Studio (vistas, LUMBRE, persistencia)
```

---

## 🧬 La estructura del sistema

- **Nivel 1 · Alma** — espacio privado: Perfil, Trayectoria, Portafolio, Proyectos, Finanzas, Agenda, Memorias, Biblioteca y LUMBRE.
- **Nivel 2 · Clan** — 2 a 8 Almas. Comunidad privada **por invitación**.
- **Nivel 3 · Santuario** — más de 8 Almas. Organización avanzada.

**Privacidad absoluta:** Mi Alma ≠ Mi Clan ≠ Mi Santuario. Nada se comparte automáticamente.

### El camino del creador
`FOUNDING → EMBER → ROOT → WILD → TOTEM → AETHER → SPIRIT → ANIMA`

### LUMBRE — el motor agente
Funciona en 4 modos y **no depende obligatoriamente de internet**:
`OFF` (manual) · `Básico` (sin IA) · `IA Local` (PDF/CV/imágenes sin salir del dispositivo) · `IA Conectada` (Claude, OpenAI, Gemini, Ollama — opcional).

> En esta Alpha, LUMBRE responde con un motor local basado en reglas sobre los datos de
> cada Alma. La conexión a motores externos es opcional y aún no está cableada.

---

## 🧪 Beta cerrada (operación)

ANIMA está lista para una **beta cerrada por invitación**:

- **Acceso por invitación**: para crear un Alma se requiere un código.
  - Código reutilizable para amigos cercanos: **`ANIMA-2026`**
  - Códigos de un solo uso: `FUNDADOR-01` … `FUNDADOR-05`
  - Para crear más: insertar filas en la tabla `invites` (Supabase).
- **Login sin fricción** — recomendado para la beta:
  *Supabase → Authentication → Sign In / Providers → Email →* desactivar
  **"Confirm email"**. (Por defecto está activado; con amigos conviene apagarlo.)
- **Constelación viva**: cada Alma que entra aparece en *Comunidad* para los demás
  (solo su cara pública: nombre, rol, nivel, bio, trayectoria y portafolio).
- **Feedback**: botón **✦ Enviar feedback** en el Studio → tabla `feedback`
  (lee los resultados en Supabase → Table Editor).
- **Subida de nivel**: agregar proyectos, memorias e hitos da XP y sube de nivel
  automáticamente (FOUNDING → ANIMA).
- **Privacidad**: finanzas, memorias, proyectos, agenda y biblioteca son privados por
  RLS — nadie más los ve, ni siquiera en el Santuario.

### Interactividad y personalización

- **Todo editable**: cada ítem (proyectos, finanzas, hitos, obras, citas, documentos,
  memorias) se crea, **edita y elimina** con formularios reales. Los cambios sincronizan
  el resto de paneles al instante (KPIs, dashboard, etc.).
- **Personalizar** (⚙): cada Alma decide **qué módulos y secciones se muestran** en su
  espacio. La config se guarda por Alma.
- **Cotizador** (₵): editor de presupuestos profesional, adaptable a cualquier rama de
  arte (unidades libres: m², hora, pieza…), con impuestos, multi-moneda, cotizaciones
  guardadas y **exportación a PDF**.
- **Crear Alma** visible desde la portada de cada Alma de muestra y al editar perfil.

## 🔟 Las 10 Almas Fundadoras

SARK (Chile), Valentina Cruz (Argentina), Nicolás Herrera (Colombia), Diego Ramírez (México),
Camila Soto (Perú), Lucía Fernández (España), Mateo Vargas (Chile), Sofía Morales (México),
Tomás Rojas (Argentina) y Renata Díaz (Colombia).

Los datos se guardan en tu navegador (`localStorage`). Usa **Restaurar Almas** en el
Studio para volver al estado fundacional.

---

## ▶️ Cómo verlo

```bash
# opción simple
open index.html

# o servir localmente
python3 -m http.server 8080   # luego abre http://localhost:8080
```

### Publicar en la web (GitHub Pages)
1. Settings → Pages → Source: rama de despliegue, carpeta `/root`.
2. La portada quedará en `https://<usuario>.github.io/<repo>/`.

---

## 📐 La regla para todo el desarrollo

Cada nueva función debe responder **sí** a una de estas preguntas:

1. ¿Ayuda a un Alma a **recordar**?
2. ¿Ayuda a un Alma a **crecer**?
3. ¿Ayuda a un Alma a **crear**?

Si la respuesta es no, **no pertenece a ANIMA**.

---

## 📖 La Biblia del Universo

El canon fundacional de ANIMA vive en **[`BIBLIA.md`](BIBLIA.md)** — filosofía,
cosmogonía, el Árbol del Alma, símbolos, glosario oficial, iconografía, colores,
sonidos, Rituales, el sistema de Esencia y las reglas del universo.

> Toda nueva función deberá nacer desde esta Biblia. Si algo contradice ese
> documento, **la Biblia tiene prioridad absoluta**.

---

*SARK · Creator of ANIMA · First Soul of ANIMA*
