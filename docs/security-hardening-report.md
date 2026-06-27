# ANIMA - reporte de seguridad para repositorio publico

Fecha: 2026-06-26

## Prioridad maxima

El token de GitHub compartido en chat debe revocarse. Un PAT se trata como una contrasena y puede dar acceso a repositorios segun sus permisos.

Pasos:

1. GitHub -> Settings -> Developer settings.
2. Personal access tokens.
3. Eliminar/revocar el token expuesto.
4. Crear uno nuevo solo si hace falta, con acceso al repositorio ANIMA y expiracion corta.

## Auditoria local realizada

- No se encontro `service_role`, `sb_secret`, clave privada, `.env` real ni PAT dentro de los archivos del repositorio.
- La clave Supabase visible es `sb_publishable_...`, esperada para frontend publico.
- El riesgo real esta en que la publishable key solo es segura si RLS y permisos de funciones estan bien cerrados.
- Se detectaron multiples RPC `SECURITY DEFINER` en `public`; por seguridad deben revocar `EXECUTE` a `PUBLIC`/`anon` salvo que sean publicas por diseno.

## Cambios aplicados en repo

- `.gitignore` para evitar `.env`, tokens, claves privadas y archivos temporales de credenciales.
- `SECURITY.md` con reglas para reportar vulnerabilidades y checklist de publicacion.
- Migracion `supabase/migrations/0033_security_hardening.sql`:
  - Revoca ejecucion publica de RPC sensibles.
  - Reautoriza solo a `authenticated` donde corresponde.
  - Mantiene publicas las RPC de lectura/gesto publico necesarias.
  - Endurece `give_spark` para no sumar Chispas a portafolios privados.

## Que debe aplicarse en Supabase

La migracion `0033_security_hardening.sql` esta en el repo, pero no queda activa en produccion hasta aplicarla en Supabase.

Despues de aplicarla:

- Ejecutar Security Advisor en Supabase.
- Revisar que todas las tablas del esquema `public` tengan RLS activo.
- Revisar que no haya funciones sensibles ejecutables por `anon`.
- Confirmar que login, perfiles, portafolio, mundo y dashboard sigan funcionando.

## Configuracion recomendada en GitHub

- Activar Secret scanning.
- Activar Push protection si esta disponible.
- Activar Dependabot alerts.
- Proteger `main` con pull request obligatorio antes de merge.
- Usar tokens fine-grained con expiracion corta.

## Riesgos pendientes

- Las Chispas anonimas siguen siendo publicas por compatibilidad con portafolios publicos. Queda reducida la exposicion a Almas publicas, pero no hay rate limit real sin backend adicional.
- GitHub Pages no permite cabeceras HTTP de seguridad avanzadas. Si ANIMA se publica en Netlify, Cloudflare Pages o Vercel, conviene agregar CSP, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` desde el hosting.
- La seguridad definitiva depende de aplicar la migracion en Supabase y revisar los advisors reales del proyecto.
