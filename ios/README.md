# ANIMA para iOS — widget

Widget de pantalla de inicio (WidgetKit + SwiftUI, iOS 17+) para ANIMA COMPANY.
Minimalista, configurable y de solo lectura.

## Qué muestra

Mantén presionado el widget → **Editar widget**:

| Opción | Valores |
|---|---|
| Qué mostrar | **Panel general** · Clientes · Ventas · Proyectos · Actividades |
| Acento | Grafito · Ámbar · Salvia · Cielo |
| Mostrar lista | sí / no (solo tamaño grande) |

El **Panel general** es el monitoreo: de cada módulo sube la cifra que pide
atención (deuda, tareas vencidas) o, si no hay, la principal.

Tamaños: pequeño (una cifra + una nota), mediano (cifra principal + 3 secundarias),
grande (+ lista: quién compra más, tareas por vencer, proyectos en curso…).
Tocarlo abre `animatsc.com/app/` (la plataforma no tiene router: no hay enlace
profundo a un módulo todavía).

## Cómo obtiene los datos

Sin migraciones ni endpoints nuevos: llama a `resumen_modulo(p_company, p_modulo)`
(la misma función de los resúmenes de la web) con el JWT de la persona. Qué ve lo
decide RLS y el nivel de rol (`has_company_level(…, 40)`), como en la web. La app
solo inicia sesión y elige la empresa; la sesión vive en el Keychain compartido y
el widget la renueva solo. Refresca cada ~30 min (iOS decide el momento exacto).

## Instalarlo en tu iPhone

Necesitas un **Mac con Xcode 15+**, tu iPhone (iOS 17+) y un Apple ID. Con el
ID gratuito la app dura 7 días y hay que reinstalarla; con Apple Developer
(US$99/año) dura un año y se puede repartir por TestFlight.

1. `cd ios && ./instalar.sh` — la primera vez crea `Config.xcconfig` y se detiene.
2. Complétalo: host y clave anónima de **staging** (Supabase → Settings → API),
   tu Team ID y un identificador propio (`ANIMA_BUNDLE_PREFIX`, `ANIMA_APP_GROUP`).
3. `./instalar.sh` otra vez: instala XcodeGen si falta, genera `ANIMA.xcodeproj` y lo abre.
4. En Xcode elige tu iPhone, ▶. En el teléfono: Ajustes → General → VPN y gestión
   de dispositivos → confiar en tu perfil.
5. Abre ANIMA, inicia sesión, elige la empresa. Pantalla de inicio → mantén
   presionado → **+** → ANIMA → tamaño. Mantenla sobre el widget → Editar widget
   para cambiar qué muestra.

Si Xcode se queja de las capacidades, entra al target → Signing & Capabilities y
confirma que **App Groups** y **Keychain Sharing** están en ambos targets.

## Reglas

- Apunta a **staging**. Producción solo si SARK lo pide.
- `Config.xcconfig` no se versiona (entra en `.gitignore`). La clave anónima es
  pública por diseño, pero el repo no lleva claves de ningún ambiente.
- Verificado solo por lectura: este código se escribió sin Xcode a mano; el primer
  build en un Mac puede pedir ajustes menores.
