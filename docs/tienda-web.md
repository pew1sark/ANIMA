# Tienda web (STUDIO → Taller → Tienda web)

Una tienda de Shopify en vivo, cruzada con los anuncios de Meta que llevan
gente a ella: quién entra desde cada anuncio, qué agrega al carrito, quién
compra, cuánto vuelve por cada peso invertido y qué pide atención hoy
(pedidos por despachar o cobrar, productos agotados, anuncios rechazados).

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `shop_connections` | migración 0147 | Qué tienda (`*.myshopify.com`) alimenta a qué Alma, moneda, zona horaria, permisos concedidos, campañas de Meta de la tienda y estado de la última sincronización. |
| `shop_orders` | migración 0147 | Pedidos con montos, estado de pago y despacho, productos y el recorrido de quien compró (primera y última visita: origen, referente, página de entrada y UTM). |
| `shop_sessions_daily` | migración 0147 | Visitas por día y origen (referente + UTM) con cuántas llegaron al carrito, al pago y a la compra. Sale de ShopifyQL. |
| `shop_products` | migración 0147 | Productos activos con stock, precio, foto y enlace. |
| `shop_secret_*` | migración 0147 | Credenciales en Vault (`shopify_app_<alma>`, `shopify_token_<alma>`), solo `service_role`. |
| cron `shopify-hora` | migración 0147 | Minuto 27 de cada hora, con la misma llave que `meta-leads` y `meta-ads`. |
| Edge Function `tienda-shopify` | `supabase/functions/tienda-shopify` | `connect`, `sync`, `ajustes`, `visitas`, `disconnect` (JWT del Alma) y `cron`. |
| Pantalla | `assets/js/tienda.js` | Estado en vivo, KPIs con variación, salud, día a día, embudo anuncio → compra, píxel vs. Shopify, clientes del anuncio, quién entra, canales, tabla por anuncio y productos. |

Todas las tablas: RLS de solo lectura para el dueño; escribe la función con `service_role`.
Los números de Meta salen del panel de Anuncios (`meta_ads_*`, ver `docs/panel-de-anuncios.md`):
la Tienda web no le pide nada nuevo a Meta.

## Conexión

Shopify ya no deja crear apps nuevas desde el admin. Se usa una app
del **Dev Dashboard** de la misma organización dueña de la tienda:

1. `dev.shopify.com` → Apps → Crear app.
2. Permisos de la versión: `read_orders`, `read_products`, `read_customers`,
   `read_reports` (y `read_all_orders` si se quiere más de 60 días). Acceso a
   datos protegidos de clientes: nombre y dirección (lo piden ShopifyQL y el
   nombre de quien compra). Publicar la versión.
3. Instalar la app en la tienda y pegar en STUDIO el dominio, el Client ID y el
   Client secret.

La función cambia esas credenciales por un token de 24 h (*client credentials
grant*) y lo renueva sola. También acepta el token `shpat_…` de una app antigua
creada en el admin. Solo habla con dominios `*.myshopify.com`.

La primera sincronización trae 90 días; después, los pedidos que cambiaron desde
la última (menos 3 días) y las visitas de los días que falten.

## Parámetros de URL del anuncio

Para que cada visita y cada venta se sepa de qué anuncio vino, el anuncio lleva:

```
utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

El panel también reconoce el nombre en vez del id, y Meta sin UTM por el
referente (facebook.com, instagram.com, `fbclid`), pero entonces no sabe qué
anuncio fue. Instagram suele abrir la tienda sin referente: sin UTM, esas
visitas caen en «Directo».

## Qué número es cuál

- **Ventas** = total actual de los pedidos (después de devoluciones), sin los
  anulados, en la moneda de la tienda.
- **Un pedido viene del anuncio** si su última visita —o la primera, si la
  última fue directa— vino de un anuncio de Meta (UTM con `medium` pagado o con
  un id de anuncio, conjunto o campaña de la cuenta). Es el último clic no
  directo, como lo cuenta Shopify.
- **Entraron a la tienda / Al carrito / Llegaron al pago** = sesiones de
  ShopifyQL que vinieron de un anuncio. Si la app no tiene `read_reports`, se
  usan las vistas de la página de destino que cuenta Meta.
- **Compras (Meta)** = lo que cuenta el píxel (`actions` de `meta_ads_daily`),
  con la atribución de Meta (1 día viendo, 7 días con clic). Se muestra al lado
  de Shopify para ver la diferencia; las ventas que pagan las cuentas son las
  de Shopify.
- **ROAS** = ventas del anuncio / (inversión × tipo de cambio). Si la tienda
  vende en la moneda de ANIMA, el tipo de cambio es el mismo de Anuncios.
- **Campañas de la tienda**: las elegidas en ⚙ o, si no se eligió ninguna, las
  de objetivo Ventas o Tráfico más las que aparecen en los UTM de la tienda.
- **Quién entra** se pregunta a Shopify en vivo (región, ciudad, dispositivo,
  página de entrada). Las visitas son anónimas: Shopify no sabe quién es la
  persona hasta que compra o deja su correo.

## Puesta en marcha

1. Aplicar `0147_tienda_web_shopify.sql` (primero en staging).
2. `supabase functions deploy tienda-shopify --no-verify-jwt`.
3. En STUDIO → Taller → Tienda web, conectar la tienda.
