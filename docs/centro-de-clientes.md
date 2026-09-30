# Centro de clientes (STUDIO → Taller)

Los formularios de los anuncios de clientes potenciales de Meta entran solos a STUDIO.
El Alma lee la solicitud, la confirma y abre WhatsApp con el mensaje ya escrito; al
confirmar, la persona queda también en Vínculos.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `client_leads` | migración 0134 | Una fila por solicitud. RLS `owns_alma`. Único `(alma_id, external_id)`: un lead nunca entra dos veces. En `supabase_realtime`. |
| `meta_lead_connections` | migración 0134 | Qué página alimenta a qué Alma y cómo le fue a la última sincronización. El Alma solo lee. |
| `meta_secret_set/get/forget` | migración 0134 | Token de la página, secreto de la app y llaves en **Vault**. Solo `service_role`, solo nombres `meta_*`. |
| cron `meta-leads-5min` | migración 0134 | `pg_net` llama a la función cada 5 min con `x-cron-key`. |
| Edge Function `meta-leads` | `supabase/functions/meta-leads` | `connect`, `sync`, `disconnect`, `webhook_info` (con el JWT del Alma), `cron` y el webhook `leadgen` firmado. `verify_jwt=false`: cada puerta se autentica sola. |
| Pantalla | `assets/js/centro-clientes.js` | Lista, detalle, mensaje de confirmación, importación CSV, avisos en directo. Se carga antes que `anima.js`. |

Las solicitudes viven en memoria (`CC`), no en `state`: `save()` vuelca `state` a
localStorage y no queremos datos de terceros guardados en el teléfono.

## Conectar la página (una vez)

1. developers.facebook.com → Mis apps → crear app tipo **Negocios**.
2. Explorador de la API Graph → elegir la app → permisos `leads_retrieval`,
   `ads_management`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_metadata` → generar token.
3. STUDIO → Taller → Centro de clientes → **Conectar Meta**: pegar el token + ID y
   clave secreta de la app. La función canjea el token por uno largo; el token de
   página que sale de ahí no vence. Trae los últimos 90 días al conectar.

Con eso ya llegan cada 5 minutos. **Al instante (opcional):** en la app de Meta →
Webhooks → objeto Page → campo `leadgen`, con la URL y el token de verificación que
muestra «Conexión → Datos del webhook». El webhook queda cerrado (503) hasta que se
conecta con la clave secreta de la app, porque sin ella no se puede comprobar la firma.

## Plan B

Meta → Centro de clientes potenciales → descargar CSV → «Importar CSV». Acepta el
formato de Meta (UTF-16, tabulaciones, prefijos `l:` / `p:`). Si luego el mismo lead
llega por la API, no se duplica.

## Límites conocidos

- Los formularios instantáneos de Meta no aceptan archivos: las fotos se piden por
  WhatsApp en el mismo mensaje de confirmación.
- El mensaje se abre en WhatsApp con `wa.me`; ANIMA no envía nada solo.
