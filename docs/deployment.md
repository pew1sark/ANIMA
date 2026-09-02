# Despliegue

## Cómo está publicado

GitHub Pages sirve la rama `main` **tal cual**, desde la raíz. Lo que está en el
repositorio es lo que se ve; el despliegue lo hace
`.github/workflows/publicar.yml` en cada push a `main`.

```
animatsc.com/          la portada pública  (index.html + assets/)
animatsc.com/app/      la plataforma       (app/ = build de Vite)
```

**La raíz es el sitio en producción.** Mover un archivo de ahí lo rompe.

## Por qué la plataforma vive en `/app`

El build de Vite genera su propio `assets/`, y en la raíz ya hay un `assets/`
con `anima.js` (433 KB), `world-tree.js` y lo demás del sitio. En la misma
carpeta se pisarían. Publicándola en `app/` cada una conserva el suyo.

## Compilar y publicar

```bash
cd platform
npm run build      # sale a ../app, con base /app/
```

Después se versiona `app/` y se empuja a `main`. Sí: el build va al repositorio.
No es lo ideal, pero mantiene el despliegue en una sola pieza: el workflow sube
la raíz y nada más. Si algún día compila en CI, esto vuelve a `dist/`, se deja
de versionar y `base` se ajusta.

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

Desde el dominio propio el sitio se sirve en la raíz, así que basta servir el
repositorio tal cual:

```bash
python3 -m http.server 4180
# → http://localhost:4180/app/
```

## Si el sitio no cambia después de un push

Ya pasó una vez, y en silencio: entre el **14 de julio y el 31 de agosto de
2026** Pages dejó de construir solo. `main` avanzó 30 commits y el sitio siguió
sirviendo `a5ab2b2` sin un solo error a la vista. Por eso el despliegue hoy es
un workflow del repositorio: si falla, falla donde se ve.

Para comprobar qué está publicado de verdad, sin creerle al navegador:

```bash
curl -sI https://animatsc.com/ | grep -i last-modified
curl -s  https://animatsc.com/sw.js | grep -o 'anima-v[0-9]*'
```

Ese `anima-v…` es la versión del service worker en `sw.js`. Si no coincide con
la del repositorio, el sitio quedó atrás.

## Quién puede entrar

Las cuentas de la Alpha están en pausa (`banned_until`, migración 0076). El
ingreso se reabre de a una:

```sql
update auth.users set banned_until = null where email = 'alguien@ejemplo.cl';
```

Y para que además vea algo adentro, necesita una fila en `company_members`: sin
organización, entra y ve "Todavía no tienes acceso".
