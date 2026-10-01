# Avisos al teléfono (Web Push)

Notificaciones que llegan aunque ANIMA esté cerrada. Se activan por dispositivo
desde la campana de la barra superior de STUDIO.

| Aviso | Cuándo | De dónde sale |
|---|---|---|
| Cliente potencial nuevo | Al instante | Disparador `client_leads_push` (INSERT en `client_leads`, salvo `source='manual'`) → `push` `{action:"lead"}` por `pg_net`. |
| Resumen del día | Una vez al día, a la hora elegida (hora de Chile) | Cron `push-tick` cada 5 min → `resumenDe()`: clientes sin responder, entregas hoy/mañana, atrasos, cotizaciones de 4+ días, saldos de entregados. Si no hay nada, no avisa. |
| Recordatorio de proyecto | En la fecha y hora agendada | `project_reminders` (ficha del proyecto → ⏰ Recordatorios); `push-tick` marca `sent_at` antes de enviar, así nunca sale dos veces. |

## Piezas

- Migración **0138**: `push_subscriptions`, `notif_prefs`, `project_reminders` (ojo: `reminders` ya existía y es del Clan), `push_secret_get/set` (Vault, nombres `push_*`), disparador y cron.
- Edge Function **`push`** (`verify_jwt=false`): `vapid` (pública), `subscribe`/`unsubscribe`/`test`/`resumen` (JWT del Alma), `lead`/`tick` (`x-cron-key` de `meta_leads_cron_key`). Firma VAPID ES256 y cifrado RFC 8291 (aes128gcm) con WebCrypto, sin librerías; el cifrado se verificó contra `http_ece` (Mozilla). Las llaves VAPID se generaron solas la primera vez (`push_vapid_private/public` en Vault). Un 404/410 del servicio borra la suscripción.
- Front: `assets/js/avisos.js` (panel, recordatorios en la ficha, enlaces `?ir=centro&lead=…` / `?ir=proyectos&proyecto=…`), `sw.js` (`push` y `notificationclick`), ícono `assets/img/badge-96.png` para la barra de Android.

## iPhone

Apple solo entrega avisos a webs instaladas en la pantalla de inicio (iOS 16.4+).
El panel lo detecta y explica: Safari → Compartir → Agregar a pantalla de inicio →
abrir ANIMA desde el ícono → Activar.
