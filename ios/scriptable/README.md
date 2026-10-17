# ANIMA en el iPhone con Scriptable (sin Mac)

Misma idea que el widget nativo (`ios/`), pero se instala desde el teléfono en
2 minutos con la app gratuita **Scriptable**. Solo lectura, sobre `resumen_modulo()`.

## Instalar
1. App Store → instala **Scriptable**.
2. En el iPhone abre el archivo [`ANIMA.js`](ANIMA.js) en GitHub → **Raw** →
   selecciona todo → copiar.
3. Scriptable → **+** → pega → nómbralo `ANIMA`.
4. Tócalo para ejecutarlo: te pide el host y la clave anónima de **staging**
   (Supabase → Settings → API), tu correo y contraseña, y la empresa.
5. Pantalla de inicio → mantén presionado → **+** → Scriptable → tamaño →
   Editar widget → Script: `ANIMA`.

## Personalizar
En Editar widget → **Parameter**: `vista,acento`
- vista: `panel` (por defecto, monitoreo) · `clientes` · `ventas` · `proyectos` · `agenda`
- acento: `grafito` · `ambar` · `salvia` · `cielo`
- ejemplo: `ventas,salvia`

Para cambiar de empresa o cerrar sesión, ejecuta el script dentro de Scriptable.

## Seguridad
Ni la URL, ni la clave ni la sesión están en el repo: se guardan en el Keychain
del teléfono. Apunta a staging; producción solo si SARK lo pide.
