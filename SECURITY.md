# Seguridad de ANIMA

ANIMA es un proyecto publico en GitHub. No subas secretos al repositorio.

## Claves y tokens

- La clave `sb_publishable_...` de Supabase puede vivir en frontend si Row Level Security esta activa y las politicas son correctas.
- Nunca publiques `service_role`, `sb_secret`, tokens de GitHub, claves privadas, `.env` reales ni archivos de credenciales.
- Si un token se expone, revocalo de inmediato y crea uno nuevo con permisos minimos.

## Reportar un problema

Si encuentras una vulnerabilidad, abre un issue privado si GitHub lo permite o contacta al mantenedor antes de divulgar detalles publicos.

Incluye:

- Ruta o archivo afectado.
- Impacto posible.
- Pasos minimos para reproducir.
- Capturas o logs sin secretos.

## Checklist antes de publicar

- Ejecutar una busqueda local de secretos.
- Revisar cambios en `supabase/migrations`.
- Confirmar que no hay `service_role` ni `sb_secret` en cliente.
- Confirmar que funciones `SECURITY DEFINER` sensibles no tengan `EXECUTE` para `PUBLIC`/`anon`.
- Confirmar que las tablas expuestas tengan RLS activo.
- Revocar cualquier PAT usado manualmente durante despliegues.

## Supabase

Toda tabla en el esquema `public` debe usar RLS. Las funciones privilegiadas deben:

- Usar `set search_path` explicito.
- Validar `auth.uid()` o una autorizacion equivalente dentro de la funcion.
- Revocar `EXECUTE` a `PUBLIC` y `anon` si no son verdaderamente publicas.
- Conceder `EXECUTE` solo a `authenticated` o al rol estrictamente necesario.
