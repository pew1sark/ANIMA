# Calendario sincronizado (Taller → Calendario)

La antigua «Agenda» es ahora un calendario mensual (y vista Lista) con todo lo que
tiene fecha en ANIMA, más los eventos del iPhone o de Google.

| Tipo | Sale de | Color |
|---|---|---|
| Citas | `agenda` | tinta |
| Entregas / Inicios | `projects.due_at` / `started_at` (no archivados; entregas no cerradas) | naranjo / verde |
| Recordatorios ⏰ | `project_reminders` (0138) | dorado |
| Tareas | `tasks.due_at` (no finalizadas) | azul |
| iPhone / Google | `cal_events` (0139) | el color de cada calendario |

## Sincronización (Edge Function `calendario`, migración 0139)

**ANIMA → iPhone / Google.** `GET /functions/v1/calendario?t=<token>` devuelve un
iCalendar (`text/calendar`) con citas (alarma 30 min antes), entregas (alarma el día
antes 9:00), inicios, recordatorios (alarma a la hora) y tareas. El token (48 hex) vive
en `cal_feeds`; «Generar un enlace nuevo» lo cambia y el anterior deja de funcionar.
El panel ofrece `webcal://…` (iPhone), `calendar.google.com/calendar/render?cid=…`
(Google) y copiar. iPhone refresca según *Obtener datos* (15 min–1 h); Google, a su
ritmo (horas a un día).

**iPhone / Google → ANIMA.** `cal_sources` guarda la dirección iCal privada (Google:
«Dirección secreta en formato iCal»; iCloud: «Calendario público»). `sync` (al agregar,
con ↻ y cada 30 min por el cron `calendario-30min`) baja el .ics, despliega
repeticiones (RRULE diaria/semanal con BYDAY/mensual por día o «2º martes»/anual,
COUNT, UNTIL, INTERVAL), quita EXDATE y STATUS:CANCELLED, aplica RECURRENCE-ID y
convierte TZID con Intl. Ventana: −60 a +400 días, máx. 5.000 eventos por calendario.
Solo URLs http(s)/webcal hacia hosts públicos (no IPs ni localhost).

Probado: 14 casos del lector y del generador (zonas, repeticiones, excepciones,
plegado RFC 5545, ida y vuelta), validación del .ics real con la librería
`icalendar` de Python y lectura del calendario público de feriados de Chile de Google.
