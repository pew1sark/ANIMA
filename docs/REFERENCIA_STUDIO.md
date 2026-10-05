# Referencia visual de ANIMA STUDIO

> Fase 0 · 5 de octubre de 2026 · Solo lectura.
>
> STUDIO no es un repo aparte: es el sitio estático de la raíz de este mismo
> repositorio (`studio.html`, `home.html`, `assets/css/*`, `assets/js/*`). Esta
> página extrae su lenguaje visual para que el sistema de diseño de COMPANY
> (Fase 3) lo herede **copiando los valores aquí**, no importando archivos de
> STUDIO.
>
> Fuentes: `assets/css/anima.css` (tokens), `studio.css` (layout y
> componentes de la app), `umbral.css` (entrada clara), `home.css` (portal
> oscuro). Comparado con `platform/src/index.css`, que ya adoptó casi todo.

---

## 1. Color

### Claro (la app de trabajo)

| Token STUDIO | Valor | En COMPANY (`@theme`) | Uso |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `--color-bg` ✅ igual | fondo de la página |
| `--card` | `rgba(255,255,255,.78)` + `backdrop-filter: blur(22px)` | `--color-surface` `#fff` (opaco) | tarjetas de vidrio |
| `--card-solid` | `#ffffff` | `--color-surface` ✅ | superficies opacas |
| `--text` / `--ink` | `#111` | `--color-ink` ✅ | texto principal |
| `--muted` | `#6e6e73` | `--color-muted` ✅ | texto secundario |
| `--soft` | `#d9d7ce` | — | pastillas neutras, degradados de fondo |
| `--warm` | `#b8a892` | — | acento cálido secundario, barras de progreso |
| `--gold` | `#d0aa63` | `--color-accent` ✅ | marca |
| `--gold-deep` | `#7b5920` | `--color-accent-deep` ✅ | texto sobre dorado |
| `--line` | `rgba(0,0,0,.08)` | `--color-line` `#e6e3dd` (opaco equivalente) | bordes |
| `--line-strong` | `rgba(0,0,0,.14)` | — | bordes con más peso |
| `--ok` | `#3a8a5f` | `--color-ok` ✅ | éxito |
| `--warn` | `#b8862f` | `--color-aviso` ✅ | aviso |
| `--danger` | `#b23b3b` | `--color-danger` ✅ | error |

**Fondo con luz:** el `body` no es plano. Dos o tres `radial-gradient`
(dorado/arena al 10-30 % de opacidad) en las esquinas sobre `--bg`, con
`background-attachment: fixed`. COMPANY ya lo hace.

### Oscuro (el portal de entrada, `home.css`)

| Token | Valor |
|---|---|
| `--bg` | `#070708` |
| `--ink` | `#f4f2ed` |
| `--muted` | `#a09c93` |
| `--soft` / `--faint` | `#8a867e` / `#6f6c66` |
| `--line` / `--line-2` | `rgba(255,255,255,.10)` / `.18` |
| `--gold` / `--gold-deep` | `#d6b36e` / `#e4c78e` (el dorado se aclara en oscuro) |
| `--glass` | `linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.025))` |

El oscuro existe **solo en el portal**, no dentro de la app. Un modo oscuro de
trabajo para COMPANY sería nuevo y debe derivarse de esta tabla.

### Colores de datos (`dashboard.js`, `paneles-y-mapa.md`)

Etapas: Cotizando `#2a78d6`, Aprobado `#1baf7a`, En producción `#eda100`,
Revisión `#e87ba4`, Entregado `#4a3aa7`, Cerrado `#eb6834`. Validados en ese
orden y siempre con su nombre al lado. COMPANY tiene su propia paleta de datos
(`--dato-1/2`, `--rampa-0..6`) también validada: **no mezclar las dos**.

---

## 2. Tipografía

- **Familia:** `"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display",
  "Helvetica Neue", Arial, sans-serif`. Inter variable 100-900.
- **Pesos usados:** 450 · 600 · 650 · 700 · 750 · 760 · 800 · 850. COMPANY los
  redujo a cuatro: 450 / 600 / 760 / 850 — mantener eso.
- **Titulares:** peso 850, `letter-spacing: -.04em` a `-.05em` (marca y
  `topbar h1` de 24 px).
- **Rótulos ("eyebrow"):** mono, 9,5-11 px, `letter-spacing: .14em-.3em`,
  mayúsculas, color `--muted` o `--gold-deep`. Mono:
  `ui-monospace, "SF Mono", "DejaVu Sans Mono", monospace` (STUDIO mezcla dos
  pilas; unificar en una).
- **Etiquetas de menú:** 10,5 px, peso 850, `.08em`, mayúsculas.
- **Cuerpo:** 13,5-14 px, interlineado **1,45**.
- **Cifras:** `font-variant-numeric: tabular-nums` en tablas.
- **Pixel:** `"Press Start 2P"` solo para LUMBRE y el Árbol. **No llevar a COMPANY.**

---

## 3. Espaciado, radios, sombras

- **Espaciado:** sin escala formal; en la práctica 4 · 6 · 8 · 10 · 12 · 14 ·
  16 · 18 · 20 · 24 px. Propuesta para COMPANY: escala de 4 px.
- **Radios observados (frecuencia):** `999px` (pastillas, botones) ≫ `50%`
  (avatares) > `12px` > `10px` > `14px` > `16px` > `9/8px` > `18px` >
  `28px` (tarjeta grande). Propuesta: `sm 8 · md 12 · lg 18 · xl 28 · full`.
- **Sombras:**
  - `--shadow`: `0 28px 90px rgba(0,0,0,.09)` (elevación alta)
  - `--shadow-soft`: `0 18px 50px rgba(0,0,0,.06)` (tarjetas)
  - hover de botón: `0 14px 34px rgba(0,0,0,.12)`
  - drawer: `-30px 0 80px rgba(0,0,0,.18)`
  - anillo de foco suave: `0 0 0 3px rgba(21,21,26,.06)`

Las sombras de STUDIO son largas y difusas, nunca duras.

---

## 4. Componentes base

| Componente | STUDIO | Rasgos |
|---|---|---|
| Botón | `.btn`, `.secondary`, `.ghost`, `.gold`, `.sm` | píldora `999px`, negro `#111` primario, peso 760, 14 px, hover sube 2 px con sombra |
| Pastilla / estado | `.pill`, `.gold/.ok/.warn/.danger`, `.chip` | 11 px, 850, mayúsculas, fondo del color al 13-18 % |
| Tarjeta | `.card` | vidrio: blanco 78 % + blur 22 px, radio 28 px, `--shadow-soft` |
| Campo | `.field input/select/textarea` | borde `--line`, radio 12 px, 11×13 px de relleno, fondo blanco |
| Avatar | `.avatar`, `.lg`, `.sm` | cuadrado redondeado (radio 13/24/10), iniciales en 850 |
| Barra de progreso | `.bar > span` | 9 px, degradado `#111 → warm → gold` |
| Drawer lateral | `.drawer` + `.drawer-bg` | derecha, `min(420px, 92vw)`, vidrio 97 % + blur 26, velo `rgba(20,18,14,.32)` + blur 3 |
| Toast | `toast()` en `anima.js` | función única, usada ~35 veces |
| Tour | `.tour` | coachmarks sobre velo `rgba(20,18,14,.55)` |
| Cargador | `#animaBoot` | la marca ∧ trazándose (`stroke-dasharray: 145`, 1,7 s) — **ya está en COMPANY** como `.anima-cargando` |

---

## 5. Navegación

- **Shell:** `grid-template-columns: 264px 1fr`.
- **Sidebar:** `sticky`, 100vh, vidrio (`rgba(255,255,255,.55)` + blur 22),
  marca arriba, tarjeta del usuario (`.who`), etiquetas de grupo, ítems con
  ícono de 20 px. **Ítem activo: fondo negro `#111`, texto blanco**, radio
  13 px. Grupos desplegables con animación de `grid-template-rows: 0fr → 1fr`
  en .22 s.
- **Topbar:** título 24 px peso 850, subtítulo en `--muted`, acciones a la
  derecha.
- **Móvil (≤ 960 px):** el sidebar se esconde, la topbar queda `sticky` con
  degradado translúcido y blur 10, el título se oculta. Botón flotante de
  LUMBRE abajo a la derecha (56 px). Cortes secundarios en 760, 720, 640 y
  560 px.
- **COMPANY hoy:** sidebar por zonas (Operación · Administración · Sistema)
  con `.nav-item[aria-current="page"]`. Mismo concepto; el activo usa acento
  dorado en vez de negro — **decidir cuál manda**.

---

## 6. Movimiento

Una sola gramática, compartida ya por las dos:

- **Curva principal:** `cubic-bezier(.22,.61,.36,1)` (salida suave).
- **Curva de paneles:** `cubic-bezier(.4,0,.2,1)` (drawer .3 s).
- **Duraciones:** .12-.2 s para hover/press · .22-.3 s para desplegar y velos
  · .34-.42 s para entrada de vista.
- **Entrada de vista:** opacidad 0 → 1 y `translateY(8px) → 0`. COMPANY:
  `.aparece` con escalonado `.aparece-1/2/3` (+50 ms).
- **Entre páginas:** View Transitions API (`@view-transition { navigation:
  auto }`): sale con `scale(.985)` + blur 3 px en .22 s, entra subiendo 8 px en
  .34 s. Solo STUDIO (multipágina).
- **Hover:** sube 1-2 px. Nada rebota, nada gira (salvo spinners).
- **`prefers-reduced-motion`:** respetado en las dos; se anulan animaciones y
  transformaciones.
- **Ambiente** (respiración del portal, chispas de LUMBRE, pulsos): exclusivo
  del mundo STUDIO. **No llevar a COMPANY.**

---

## 7. Librerías

| | STUDIO | COMPANY |
|---|---|---|
| Framework | ninguno (JS plano) | React 19 |
| Estilos | CSS plano con variables | Tailwind v4 + clases propias |
| Datos | supabase-js 2 (CDN, sin versión fija) | supabase-js 2 (npm) |
| Mapas | Leaflet 1.9.4 (unpkg, carga diferida) | SVG propio (`components/mapa/`) |
| Gráficos | SVG a mano | SVG a mano (`components/graficos/`) |
| Íconos | `assets/js/icons.js` (SVG en línea) | SVG en línea |

---

## 8. Qué NO se hereda en COMPANY

El vocabulario de la Biblia (Almas, Esencia, Ecos, Núcleo), la gamificación
(niveles, insignias, Árbol, Chispas), la tipografía pixel, LUMBRE como
criatura, los sonidos y la animación ambiental. Lo dice el README: el mundo de
las Almas vive **solo dentro de STUDIO**; la plataforma es profesional.

## 9. Conclusión para la Fase 3

COMPANY ya comparte el 80 % del ADN (color, letra, curva, cargador). Lo que
falta es: (1) formalizar radios, espaciado, sombras y z-index como tokens;
(2) pasar las clases CSS a componentes React; (3) traer el vidrio y el drawer
de STUDIO; (4) decidir el ítem activo del menú (negro STUDIO vs dorado
COMPANY); (5) diseñar el modo oscuro de trabajo a partir de la paleta del
portal.
