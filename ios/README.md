# ANIMA para iOS — widget

Widget de pantalla de inicio (WidgetKit + SwiftUI, iOS 17+) para ANIMA COMPANY.
Minimalista, configurable y de solo lectura.

## Qué muestra

Mantén presionado el widget → **Editar widget**:

| Opción | Valores |
|---|---|
| Qué mostrar | Clientes · Ventas · Proyectos · Actividades |
| Acento | Grafito · Ámbar · Salvia · Cielo |
| Mostrar lista | sí / no (solo tamaño grande) |

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

## Armarlo en Xcode (15+)

No hay `.xcodeproj` versionado: se crea una vez y se apunta a estas carpetas.

1. Nuevo proyecto **App** (SwiftUI) `AnimaApp`, y un target **Widget Extension**
   `AnimaWidget` (sin Live Activity ni Control).
2. Arrastra `Shared/` a **ambos** targets, `AnimaApp/` a la app y `AnimaWidget/` al widget.
3. Signing & Capabilities en **ambos**: **App Groups** (`group.cl.animatsc.anima`) y
   **Keychain Sharing** (mismo grupo). Sin esto el widget no ve la sesión.
4. `cp Config.example.xcconfig Config.xcconfig`, complétalo con **staging**, y
   asígnalo a ambas configuraciones del proyecto. En el Info.plist de los dos
   targets agrega las claves `ANIMA_SUPABASE_HOST`, `ANIMA_SUPABASE_ANON_KEY` y
   `ANIMA_APP_GROUP` con valor `$(ANIMA_SUPABASE_HOST)` etc.
5. Ejecuta la app, inicia sesión, elige empresa; añade el widget desde la galería.

## Reglas

- Apunta a **staging**. Producción solo si SARK lo pide.
- `Config.xcconfig` no se versiona (entra en `.gitignore`). La clave anónima es
  pública por diseño, pero el repo no lleva claves de ningún ambiente.
- Verificado solo por lectura: este código se escribió sin Xcode a mano; el primer
  build en un Mac puede pedir ajustes menores.
