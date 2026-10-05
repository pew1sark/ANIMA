## Qué cambia

<!-- En una o dos frases. Un PR = un propósito. -->

## Por qué

## Tipo

- [ ] `feat` función nueva
- [ ] `fix` corrección
- [ ] `ui` solo presentación (sin cambiar lógica de negocio)
- [ ] `refactor` mover/ordenar sin cambiar comportamiento
- [ ] `docs` / `chore`

## Capturas (si toca interfaz)

| Antes | Después |
|---|---|
|  |  |

## Cómo probarlo

1.
2.

## Checklist

- [ ] No toca producción: no se aplicó nada a la base real ni se usaron claves de producción
- [ ] Si hay migración: es nueva (no edita una existente), se probó en staging y la revisa SARK
- [ ] Ninguna política RLS queda más abierta que antes
- [ ] Sin secretos ni datos reales de clientes en el diff
- [ ] No mezcla rediseño visual con cambios de lógica
- [ ] Si cambia `platform/`: `npm run typecheck` y `npm run build:check` pasan en local (y el PR no incluye `app/`)
- [ ] Si toca STUDIO (raíz, `assets/`): se avisó a SARK antes
