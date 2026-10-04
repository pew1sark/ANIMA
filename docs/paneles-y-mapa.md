# Paneles de STUDIO y mapa de Chile

Código: `assets/js/dashboard.js` (se carga antes que `anima.js`) · estilos `.dsh-*` al final de `assets/css/studio.css` · migración `0144_lugares_del_mapa.sql`.

## Núcleo (Mi Alma → Resumen)

El pulso del mes:

- **Cuatro cifras.** Cobrado en el mes, por cobrar, en cotización y trabajos activos. El cobrado del mes se compara con el mismo tramo del mes anterior (del día 1 a hoy), no con el mes completo.
- **Raíz de los últimos 12 meses.** Barras de abonos y egresos, con la ganancia al pasar el dedo y una vista en tabla.
- **Flujo de trabajos por etapa.**
- **Trabajos en curso y próximas entregas** (30 días).
- **Mapa compacto.**
- **Clientes potenciales, Hoy, tareas y la última memoria.**

## Resumen del Taller

Mantiene el selector de tramo (`state.tallerPeriod`). Cada cifra se cuenta por su propia fecha:

- **Seis cifras.** Abonos, egresos, ganancia, por cobrar, en cotización y tasa de cierre, con tendencia de 12 meses cuando no hay tramo.
- **Raíz por mes y proyectos por etapa.**
- **Mapa completo.** Filtros por estado (realizados, en curso, cotizando), por cliente y por texto, más la capa de clientes potenciales. Al lado va la lista de lugares y la de proyectos sin ubicación.
- **Entregas, clientes que más encargan, embudo de clientes potenciales, agenda, tareas y actividad.**

## Colores

- **Etapas:** Cotizando `#2a78d6`, Aprobado `#1baf7a`, En producción `#eda100`, Revisión `#e87ba4`, Entregado `#4a3aa7`, Cerrado `#eb6834`. Pasan el validador de visualización en ese orden y siempre van con su nombre al lado.
- **Mapa:** solo tres grupos, que se distinguen bien entre sí aunque estén todos juntos. Realizados `#2a78d6`, En curso `#eb6834` y Cotizando `#1baf7a`. Los clientes potenciales van como círculos huecos.

## Cómo se ubica cada proyecto

La comuna y la ciudad se escriben a mano. `dshCoords(texto)` las resuelve en este orden:

1. **Descarta lo que no parece un lugar:** textos largos, frases o preguntas.
2. **Tabla `DSH_LUGARES`:** comunas de Santiago y ciudades de regiones, con alias como «Stgo» o «RM».
3. **Caché de la tabla `geo_lugares`:** por Alma, con RLS `owns_alma`.
4. **Búsqueda en OpenStreetMap (Nominatim):**
   - una consulta por segundo y un máximo de 40 por carga;
   - solo se envía el texto del lugar, nunca nombres ni teléfonos;
   - el resultado se guarda aunque no se encuentre nada (`lat = null`), para no repetirlo.

Si solo se reconoce «Santiago» y hay más texto («Lomas San Sebastián, Santiago»), primero se busca el lugar exacto. Si no aparece, queda en Santiago.

## Teselas

Las teselas son las de OpenStreetMap (`tile.openstreetmap.org`), con atribución y desaturadas por CSS. CARTO dejó de servir teselas sin clave (octubre 2026).

Leaflet 1.9.4 se carga desde unpkg con SRI la primera vez que se abre un panel con mapa.
