# Identidad y acceso

> Un solo logo, una sola tipografía, una sola forma de esperar. Y encima, la
> marca de cada cliente.

## El logo

La **∧** de la portada es el único logo del sistema. Está en tres lugares y en
ninguno más:

| Dónde | Qué |
|---|---|
| `index.html` | La portada, trazada en blanco sobre negro |
| `platform/src/components/Marca.tsx` | `<Apex>`, que usa `currentColor` |
| `assets/js/anima.js` + `assets/css/studio.css` | La pantalla de carga del sitio |

Si cambia, cambia en los tres. No hay un archivo de imagen: es un `path` de
cuatro puntos, así que se adapta al color y al tamaño sin perder nitidez.

## La tipografía

**Inter** para la interfaz, **Cormorant Garamond** para los títulos con aire.
Las dos se cargan desde Google Fonts en la portada, en la plataforma
(`platform/index.html`) y en las páginas de STUDIO. En `assets/css/anima.css`
Inter va **primera** en la pila; el sistema queda de respaldo.

## Los componentes

En `platform/src/index.css`, después de los tokens. Antes cada botón repetía su
cadena de utilidades —catorce sitios donde cambiar un radio—; ahora están una
vez. **Si algo se ve distinto en dos pantallas, es que una no usó esto.**

| Clase | Qué es |
|---|---|
| `.b` + `.b-pri` / `.b-sec` / `.b-fan` / `.b-mal` | Botón: primario, secundario, fantasma, destructivo. `.b-sm` y `.b-blq` modifican |
| `.grupo` | Botones de un mismo eje (Tabla / Tablero), con `aria-pressed` |
| `.pest` | Pestaña suelta, con `aria-selected` |
| `.rotulo` | Monoespaciada, mayúsculas, muy espaciada — el *eyebrow* de la portada |
| `.titular` | Cormorant, ligera. Los títulos de pantalla |
| `.cifra` / `.cifra-grande` | Tabulares; la grande en serif |
| `.tarjeta` · `.campo` | Superficie e input |

El estado se dice con atributos ARIA (`aria-pressed`, `aria-selected`), no con
una clase extra: el CSS lo lee y el lector de pantalla también.

## El movimiento

Una sola gramática, en `platform/src/index.css`:

- `.aparece` — entra subiendo 8px en 420ms. `.aparece-1/2/3` escalonan.
- `.entra` — solo desvanecido, para avisos que aparecen en su sitio.
- `.toque` — lo que se puede pulsar sube 1px al pasar por encima.

Nada rebota y nada gira. Todo respeta `prefers-reduced-motion`.

## La espera

La ∧ trazándose (`stroke-dashoffset`), el nombre y la palabra CARGANDO. Es la
misma en el sitio (`#animaBoot`) y en la plataforma (`components/Cargando`).
Antes decía "Despertando Alma…", que solo tenía sentido dentro de la Alpha.

## La marca del cliente

Cada organización puede subir su logo y la plataforma lo usa en su espacio.
**ANIMA no desaparece: baja al pie como "Powered by ANIMA TSC"** (`<PieAnima>`).

- El archivo va al bucket **`marcas`**, público, en `<company_id>/logo-<ts>.<ext>`.
  Público a propósito: un logo se muestra y no gana nada tras una URL que
  caduca. Lo que se protege es **quién lo sube** — nivel 80, en las políticas
  del bucket.
- El nombre lleva marca de tiempo. Con un `logo.png` fijo, el navegador y el CDN
  seguirían mostrando el anterior durante horas.
- La referencia vive en `companies.branding` y se escribe con la función
  `guardar_marca()`, que valida el color y comprueba el nivel.
- Se edita en **Configuración → Tu marca**, y solo lo ve quien tiene nivel 80.

Es a propósito lo más simple posible: un logo. Un panel de personalización con
veinte controles termina en interfaces que no se parecen a nada; con un logo
bien puesto, la plataforma ya es del cliente.

## El acceso

En el login se puede hacer tres cosas, y solo tres:

1. **Entrar.**
2. **Recuperar la contraseña** — Supabase manda el correo y el enlace vuelve a
   `app/`. El evento `PASSWORD_RECOVERY` lleva a `NuevaContrasena`; sin
   atenderlo, la app trataría el enlace como un ingreso normal y la persona
   nunca cambiaría la clave.
3. **Pedir acceso** — escribe en `access_requests` y no crea ninguna cuenta.

**No hay registro abierto.** La tabla acepta `insert` de `anon`, pero no tiene
política de `select`: el formulario escribe y no puede leer nada, ni siquiera lo
suyo. Un índice único sobre los pendientes evita que pulsar diez veces deje diez
filas. Las solicitudes se ven y se resuelven en la consola.

## La invitación de STUDIO

STUDIO ya no depende de responder a mano. Una solicitud se cierra creando una
**invitación** (migración 0136, `studio_invitations`): una dirección de correo,
un destino —la plataforma, un Clan o un Santuario—, un rol y un enlace.

| Quién invita | A qué | Desde dónde |
|---|---|---|
| Soporte (`is_creator`) | A la plataforma, con plan | Consola → *Dar de alta a alguien nuevo* |
| Líder de un Clan (`leads_clan`) | A su Clan | Panel del Clan → *Invitaciones* |
| Admin de un Santuario (`admin_santuario`) | A su Santuario | Santuario → Almas → *Invitaciones* |

El correo lo manda la función edge **`invitacion-studio`**, que es lo único con
`service_role` y por tanto lo único que puede crear una cuenta. No decide nada:
pregunta a `preparar_envio_invitacion()`, igual que la 0119 hace en COMPANY.
Tres cosas que conviene no perder de vista, por el mismo motivo que allá:

- **No es un relé de correo.** Solo sale un correo si la invitación existe, está
  vigente y no se mandó en los últimos diez minutos. Escribir la dirección de un
  desconocido no le manda nada a nadie.
- **El sello del envío lo pone la base**, no la función edge: dos pulsaciones
  seguidas no mandan dos correos.
- **La invitación se aplica sola al entrar.**
  `aceptar_invitaciones_pendientes()` busca por el correo de la sesión, no por el
  token, así que un enlace caducado en la bandeja no deja a nadie dentro de ANIMA
  y fuera de su equipo.

El `token` no sale nunca de una lista: solo lo devuelve `crear_invitacion()`, a
quien la creó. `studio_invitations` tiene RLS sin políticas y el permiso revocado
a `anon` y `authenticated` — se llega por las funciones o no se llega.

Lo que se retiró al abrir esta puerta: el *Código del Origen* que pedían
`studio.html` y `despertar.html`, los códigos de Clan (`clan_invites`) y los de
Santuario (`santuario_invites`). Las tablas siguen ahí con lo que ya tenían; sus
funciones de canje están revocadas. Un código no sabe a quién invita: si se
filtra, entra quien lo pegue, con el rol que llevaba dentro.

## Lo legal

`legal.html` tiene el contrato completo en trece secciones: qué es el servicio,
de quién son los datos, qué ve quien mantiene el software, planes y pagos,
disponibilidad, uso aceptable, propiedad intelectual, término y salida.

Dos compromisos que están escritos ahí y conviene no romper por descuido:

- **Quien administra ANIMA no ve la operación del cliente.** Solo la relación
  comercial. Está sostenido por la migración 0073.
- **Al terminar, el cliente tiene 60 días para exportar su información.**
  Todavía no existe la exportación: hay que construirla.
