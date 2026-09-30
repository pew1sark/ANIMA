# Panel de anuncios (STUDIO → Taller → Anuncios)

Cada anuncio de Meta, de la inversión al trabajo ganado: lo que mide Meta
cruzado con lo que pasa después en ANIMA (Centro de clientes → Cotizador →
Proyectos).

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `meta_ads_connections` | migración 0137 | Qué cuenta publicitaria (`act_…`) alimenta a qué Alma, moneda, zona horaria, estado de la última sincronización. |
| `meta_ads_objects` | migración 0137 | Campañas, conjuntos y anuncios: estado real, objetivo, presupuesto (ya en unidades de la moneda), público, creativo y rechazos. |
| `meta_ads_daily` | migración 0137 | Métricas por anuncio y día: inversión, impresiones, alcance del día, clics, formularios, conversaciones, video 3 s / 25-100 % / ThruPlay. |
| cron `meta-ads-hora` | migración 0137 | Minuto 17 de cada hora, con la misma llave que `meta-leads`. |
| Edge Function `meta-ads` | `supabase/functions/meta-ads` | `connect`, `sync`, `alcance`, `desglose`, `disconnect` (JWT del Alma) y `cron`. Token en Vault: `meta_ads_token_<alma>`. |
| Pantalla | `assets/js/anuncios.js` | KPIs con variación vs. periodo anterior, barras por día, embudo anuncio → ganado, salud, tabla por nivel y panel por anuncio. |

Todas las tablas: RLS de solo lectura para el dueño; escribe la función con `service_role`.

## Conexión

Si el Centro de clientes ya está conectado, basta «Usar la conexión del Centro
de clientes»: `meta-leads` guarda ahora también el token de la persona
(`meta_user_token_<alma>`) y el ID de la app (`meta_app_id`). Si no, se pega un
token con `ads_read`/`ads_management`. La primera sincronización trae 90 días;
después se repasan los últimos 7 (Meta corrige la atribución).

## Qué número es cuál

- **Alcance y frecuencia** se piden a Meta en vivo para el periodo (no se pueden sumar día a día).
- **Formularios** = lo que cuenta Meta. **Solicitudes / contactadas / cotizadas / ganadas** = `client_leads` con ese `ad_id` (las CSV sin `ad_id` se cruzan por nombre de campaña; las manuales no cuentan).
- **Valor ganado** = presupuesto de los proyectos enlazados a solicitudes ganadas. **ROAS** = valor ganado / (inversión × tipo de cambio). El tipo de cambio (1 USD = 950 CLP por defecto) se ajusta tocándolo y se guarda en el dispositivo.
- **Salud**: rechazos/problemas de entrega, fatiga (frecuencia ≥ 3,5), CTR < 0,5 %, costo por formulario > 1,5× el promedio y gasto > 2 formularios sin ninguno (solo en campañas que buscan formularios), video que no engancha (< 20 % se queda 3 s), solicitudes sin responder y formularios que no llegaron al Centro.
