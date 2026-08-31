# Despliegue

## Cómo está publicado

GitHub Pages sirve la rama `main` **tal cual**, desde la raíz. No hay workflow de
Actions: lo que está en el repositorio es lo que se ve.

```
pew1sark.github.io/ANIMA/          la portada pública  (index.html + assets/)
pew1sark.github.io/ANIMA/app/      la plataforma       (app/ = build de Vite)
```

**La raíz es el sitio en producción.** Mover un archivo de ahí lo rompe.

## Por qué la plataforma vive en `/app`

El build de Vite genera su propio `assets/`, y en la raíz ya hay un `assets/`
con `anima.js` (433 KB), `world-tree.js` y lo demás del sitio. En la misma
carpeta se pisarían. Publicándola en `app/` cada una conserva el suyo.

## Compilar y publicar

```bash
cd platform
npm run build      # sale a ../app, con base /ANIMA/app/
```

Después se versiona `app/` y se empuja a `main`. Sí: el build va al repositorio.
No es lo ideal, pero es lo que permite la configuración actual de Pages. Cuando
Pages pase a compilar por su cuenta (origen *GitHub Actions*), esto vuelve a
`dist/`, se deja de versionar y `base` se ajusta.

`base` y `outDir` están en `platform/vite.config.ts` y van juntos: si cambia la
ruta de publicación, cambian los dos.

## Las variables de entorno

Vite las incrusta al compilar desde `platform/.env.local`. Si falta una, la app
falla al arrancar y no a mitad de una consulta — está resuelto en
`src/config/env.ts`.

La clave que viaja es la **publicable**, que es pública por diseño: llega al
navegador de todos modos. La seguridad no está ahí, está en las políticas RLS.
`service_role` no entra nunca en este repositorio.

## Probar el build antes de publicar

Servido desde la raíz, `/app/` no funciona: las rutas apuntan a `/ANIMA/app/`.
Hay que reproducir la subruta:

```bash
mkdir -p /tmp/pages && cp -R . /tmp/pages/ANIMA
cd /tmp/pages && python3 -m http.server 4180
# → http://localhost:4180/ANIMA/app/
```

## Quién puede entrar

Las cuentas de la Alpha están en pausa (`banned_until`, migración 0076). El
ingreso se reabre de a una:

```sql
update auth.users set banned_until = null where email = 'alguien@ejemplo.cl';
```

Y para que además vea algo adentro, necesita una fila en `company_members`: sin
organización, entra y ve "Todavía no tienes acceso".
