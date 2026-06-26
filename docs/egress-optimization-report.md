# ANIMA Alpha - reporte de optimizacion de Cached Egress

Fecha: 2026-06-26

## Contexto

Supabase reporta Cached Egress alto frente al tamano real de Storage y Database. La causa probable no es falta de espacio, sino descarga repetida de imagenes publicas desde Storage/CDN al navegar por portafolios, muro y mundo.

## Componentes auditados

- `assets/js/supabase.js`: consultas a `almas`, modulos, portafolio publico, posts, clientes y cotizaciones.
- `assets/js/anima.js`: Mi Alma, Portafolio, Comunidad, Huellas Errantes, modal publico y subidas de imagen.
- `assets/js/portfolio.js`: portafolio publico compartible.
- `studio.html` y `portfolio.html`: imagenes HTML directas.

## Cambios aplicados

- Cache de URL por sesion en frontend para centralizar reutilizacion de avatares, banners, huellas e imagenes de posts.
- Portafolio interno y portafolio publico renderizan 6 obras iniciales y cargan mas bajo demanda.
- Huellas Errantes reduce la lectura publica de portafolios de 600 a 120 registros por defecto.
- Muro de comunidad reduce la lectura inicial de posts de 100 a 40.
- La visita a un Alma publica usa una consulta publica minima para trayectoria y titulos de portafolio, sin cargar todos los modulos del Alma.
- `select("*")` reemplazado por columnas explicitas en rutas de alto uso.
- Nuevas subidas de imagen tienen limites recomendados:
  - Avatar: 1 MB.
  - Imagen visible: 2 MB.
  - Documento: 5 MB queda como regla futura, porque no hay flujo documental dedicado en esta optimizacion.
- Compresion defensiva en cliente antes de subir imagenes grandes, manteniendo el formato actual cuando es posible y sin convertir archivos existentes.
- `loading`/`decoding` agregado donde aplica a imagenes HTML.

## Riesgo por archivo

- `assets/js/supabase.js`: riesgo medio-bajo. Si una columna no existe o falta una columna usada por la UI, una seccion podria quedar vacia. Se incluyeron los campos que la interfaz mapea actualmente.
- `assets/js/anima.js`: riesgo bajo. La compresion tiene fallback al archivo original; la carga incremental solo reduce imagenes renderizadas inicialmente.
- `assets/js/portfolio.js`: riesgo bajo. Los datos se mantienen y el usuario puede cargar mas obras manualmente.
- `studio.html`, `portfolio.html`, `sw.js`: riesgo bajo. Solo se agregaron atributos de carga/decodificacion y se actualizo version de cache PWA.

## No aplicado por seguridad

- No se eliminaron archivos.
- No se modificaron buckets.
- No se cambiaron nombres ni rutas actuales.
- No se modificaron tablas ni estructura de base de datos.
- No se migraron imagenes existentes.
- No se convirtieron archivos antiguos a WebP.

## Propuesta futura

- Crear variantes/tamanos derivados para imagenes nuevas con rutas compatibles.
- Medir con logs o analytics internos cuantas imagenes se descargan por vista.
- Evaluar paginacion real en Supabase para posts/portafolios si la comunidad supera la escala Alpha.
