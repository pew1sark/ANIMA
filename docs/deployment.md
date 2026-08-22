# Despliegue

## Entornos

| Entorno | Rama | Estado |
|---|---|---|
| Development | `development` | trabajo diario |
| Staging | `staging` | previsto, aún no creado |
| Production | `main` | sitio ANIMA actual |

**No se desarrolla sobre `main`.**

## Situación actual

- El sitio ANIMA se publica por GitHub Pages desde `taller-v2-motor-unico`.
  `main` y esa rama están sincronizadas en el remoto.
- La plataforma (`/platform`) todavía no se despliega: se ejecuta en local
  con `npm run dev`.

## Arranque local

```bash
cd platform
cp .env.example .env.local   # y rellenar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Migraciones

Se aplican con el MCP de Supabase (`apply_migration`); no hay CLI local.
Cada cambio de base es un archivo nuevo en `supabase/migrations/`, numerado y
reproducible. **Una migración aplicada no se edita jamás.**

## Pendiente

- Rama `staging` y proyecto Supabase de staging (requiere plan Pro: el plan free
  admite 2 proyectos activos y ya están ocupados).
- GitHub Actions con `typecheck` y lint en cada push.
- Unificar el despliegue en una sola rama.
