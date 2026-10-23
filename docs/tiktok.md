# TikTok (STUDIO → Taller → TikTok)

Los anuncios de TikTok de punta a punta: inversión, cuánto ven el video, lo que
la gente comenta (y se responde desde STUDIO) y los formularios instantáneos,
que entran al Centro de clientes como cualquier solicitud. Mismo criterio que el
panel de Anuncios de Meta (`docs/panel-de-anuncios.md`).

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `tiktok_ads_connections` | migración 0148 | Qué cuenta publicitaria (`advertiser_id`) alimenta a qué Alma, moneda, zona horaria y estado de cada parte de la sincronización (anuncios, comentarios, formularios). |
| `tiktok_ads_objects` | migración 0148 | Campañas, grupos y anuncios: `operation_status`, `secondary_status` (revisión, rechazo, presupuesto), objetivo, presupuesto, público y creativo (texto, portada, identidad). |
| `tiktok_ads_daily` | migración 0148 | Métricas por anuncio y día: inversión, impresiones, alcance, clics, resultados, conversiones, video (reproducciones, 2 s, 6 s, 25–100 %), me gusta, comentarios, compartidos, seguidores. |
| `tiktok_ad_comments` | migración 0148 | Comentarios de los anuncios, respuestas propias, ocultos y «atendido». |
| `client_leads.source = 'tiktok'` | migración 0148 | Los formularios instantáneos van al Centro de clientes (aviso, Vínculo, cotización, proyecto). |
| cron `tiktok-hora` | migración 0148 | Minuto 37 de cada hora, con la misma llave que `meta-leads`. |
| Edge Function `tiktok-ads` | `supabase/functions/tiktok-ads` | `estado`, `app`, `auth_url`, `exchange`, `connect`, `sync`, `alcance`, `responder`, `ocultar`, `atendido`, `disconnect` (JWT del Alma) y `cron`. Token en Vault: `tiktok_token_<alma>`. |
| Pantalla | `assets/js/tiktok.js` | KPIs con variación, barras por día, embudo video → ganado, salud, Mensajes (comentarios + formularios), tabla por nivel y panel por anuncio. |
| Resumen del Taller | `assets/js/dashboard.js` (`dshTiktok`) | Tarjeta con inversión, reproducciones, resultados, formularios, ROAS y comentarios por responder. |

Todas las tablas: RLS de solo lectura para el dueño; escribe la función con `service_role`.
`tiktok_oauth_states` no tiene políticas: solo la función la usa.

## Conexión

TikTok exige una **app de desarrollador** (business-api.tiktok.com → My Apps) con
los permisos de cuentas, anuncios, reportes, comentarios (*Comment Management*) y
clientes potenciales (*Lead Management*).

1. **Con un clic (recomendado):** en la app, la dirección de vuelta
   (*Advertiser redirect URL*) es `https://animatsc.com/studio.html?ir=tiktok`.
   El App ID y la clave secreta se cargan una vez:
   - por Alma, desde la pantalla de conexión (`tiktok_app_<alma>` en Vault), o
   - para todo ANIMA, en Vault como `tiktok_app_id` y `tiktok_app_secret`
     (con `tt_secret_set` desde una sesión con `service_role`).
   Después basta «Entrar con TikTok»: el portal devuelve `auth_code`, la función
   lo cambia por el token (no vence salvo que se revoque) y, si hay varias
   cuentas, pregunta cuál.
2. **Pegando un token:** token de la API de Marketing + advertiser ID.

La primera sincronización trae 90 días de métricas y 30 de comentarios; después
se repasan los últimos 7 días.

## Qué número es cuál

- **Alcance y frecuencia** se piden en vivo para el periodo (no se suman día a día).
- **Resultados** = lo que cuenta TikTok según lo que optimiza cada grupo (formularios, mensajes, visitas…).
- **Formularios en ANIMA / cotizadas / ganadas / valor ganado** = `client_leads` con `source = 'tiktok'`.
  El panel de Anuncios de Meta ya no cuenta estas solicitudes.
- **ROAS** = valor ganado / (inversión × tipo de cambio). El tipo de cambio es el mismo ajuste de Anuncios (`anima_ads_fx_<moneda>`).
- **Salud**: rechazos, cuenta que no entrega, presupuesto agotado, CTR < 0,4 %, video que no engancha (< 25 % pasa de 2 s), costo por resultado > 1,5× el promedio, gasto sin resultados, comentarios y formularios sin responder, y avisos si comentarios o formularios no se pudieron leer.

## Mensajes

- **Comentarios:** TikTok los entrega por grupo de anuncios; se revisan hasta 25
  grupos que entregaron en el periodo o siguen prendidos. Desde STUDIO se puede
  **responder** (solo anuncios con identidad `TT_USER` o `CUSTOMIZED_USER`; los
  de Business Center se responden en Ads Manager), **ocultar / mostrar** y
  marcar **«Listo, no requiere respuesta»**.
- **Formularios:** TikTok no los da uno por uno: se crea una tarea de descarga
  por formulario, se baja el CSV y se guarda cada respuesta (`external_id = tt:<lead_id>`,
  sin duplicados). Si la tarea no alcanza a estar lista, se baja en la próxima hora.
  Solo los administradores de la cuenta publicitaria pueden bajar formularios.
- Los **mensajes directos** de TikTok no están en la API de Marketing: los que
  TikTok convierte en formulario llegan igual; el resto se contesta en la app.
- El aviso push de una solicitud nueva se omite si tiene más de 2 días
  (`push/index.ts`): así la primera importación no manda un aviso por cada
  formulario antiguo.

## Deploy

```bash
supabase db push                       # aplica 0148
supabase functions deploy tiktok-ads --no-verify-jwt
supabase functions deploy push --no-verify-jwt
```
