# Arquitectura de `platform/` (ANIMA COMPANY)

> Fase 2 · en curso. Complementa [`architecture.md`](architecture.md), que
> explica la plataforma multiempresa y la base. Este documento es sobre cómo
> se ordena el **código** del frontend.

## Estructura

```
platform/src/
├── App.tsx          el portal: decide qué se dibuja según sesión y puertas
├── acceso/          antes de entrar: Login, nueva contraseña, puertas, elegir organización
├── consola/         consola de la plataforma (super admin) y su servicio
├── espacio/         el espacio de trabajo de una organización (el «shell»)
│   ├── Espacio.tsx     menú por módulos del plan, cabecera, búsqueda global
│   ├── inicio/         panel de inicio y «mi espacio»
│   ├── informes/       informes y resumen por módulo
│   ├── ajustes/        empresa, equipo, marca, campos propios, plan, cuotas
│   └── Novedades.tsx
├── core/            lo que necesita cualquier pantalla para existir
│   ├── auth/  tenant/  modules/  datos/
├── ui/              piezas de interfaz compartidas, sin datos propios
│   ├── cifras/  panel/  graficos/  mapa/
│   └── Periodo, Marca, Oscuro, Cargando
├── modules/         un módulo vertical por carpeta, aislado
│   ├── capital/        Capital Intelligence
│   ├── inmobiliaria/   Real Estate Intelligence + Brokerage (Casa Click)
│   └── analisis/       Análisis financiero (addon)
├── components/datos/  motor declarativo: tabla y ficha (pasa a core/ en el bloque 3)
├── services/        acceso a datos compartido (resumen, perfil, acceso, cuotas, datos)
├── lib/  config/  types/
└── vitrina/         pantallas con datos falsos para diseñar sin Supabase
```

```
            ┌──── espacio/ · acceso/ · consola/ ───┐   el shell monta módulos
            └───────────────┬──────────────────────┘
            ┌──────────── modules/ ────────────┐
            │  capital      inmobiliaria   …   │   ✗ nunca entre sí
            └───────┬──────────────┬───────────┘
                    │ importa      │ importa
            ┌───────▼──────────────▼───────────┐
            │   ui/   core/   services/   lib/  │   ✗ nunca hacia modules/
            └──────────────────────────────────┘
```

## Reglas

1. **Un módulo no importa de otro módulo**, ni del shell (`espacio/`,
   `acceso/`, `consola/`): el shell monta módulos, no al revés. Si dos módulos necesitan lo mismo,
   eso sube a `ui/` (si es interfaz) o a `core/`/`services/` (si es datos o
   sesión). Así se pudo separar Real Estate de Capital: usaba la tarjeta de
   cifra y el selector de período de Capital, que ahora están en `ui/`.
2. **Lo compartido no depende de lo particular.** `core/`, `ui/`, `lib/`,
   `services/`, `config/` y `types/` no importan de `modules/` ni del shell.
3. **La lógica de un cliente no entra en `core/`.** Casa Click es una
   organización que usa el módulo `inmobiliaria`; lo que sea solo suyo irá en
   su propio módulo.
4. **Un módulo no decide si está encendido.** Lo deciden `plan_modules` y
   `company_modules` en la base; el registro (`core/modules/registry.ts`)
   solo lo describe.
5. **Mover no es cambiar.** Cada reestructuración se comprueba compilando antes
   y después: el bundle tiene que salir idéntico.

Las reglas 1 y 2 las comprueba `npm run fronteras` (`platform/scripts/fronteras.mjs`),
también en CI.

## Estado de la migración

| Área | Estado | Comprobación |
|---|---|---|
| UI compartida (`ui/`): cifras, período, cuadros, gráficos, mapas | ✅ | bundle idéntico (md5) |
| `modules/capital` | ✅ | bundle idéntico; vitrina compila con su doble |
| `modules/inmobiliaria` | ✅ | bundle idéntico |
| Shell: `acceso/`, `consola/`, `espacio/` (inicio, informes, ajustes, novedades) | ✅ | bundle idéntico |
| `modules/analisis` (análisis financiero) | ✅ | bundle idéntico |
| Código muerto: 7 archivos, 407 líneas (`components/Panel.tsx`, `platform`, `audit`, `companies`, `members` service, `useModuleGuard`, `permissions`) | ✅ borrado | nadie los importaba; bundle idéntico sin ellos |
| Motor de datos (`components/datos/`) → `core/datos/` | ⏳ bloque 3 | — |
| Plantilla `modules/_template/` | ⏳ Fase 5 | — |
| Router por URL (enlaces directos, botón atrás) | ⏳ Fase 4: cambia comportamiento, no es un movimiento | — |

## Cómo crear un módulo (provisional, hasta la plantilla de la Fase 5)

1. `platform/src/modules/<nombre>/` con sus pantallas y `<nombre>.service.ts`.
2. Declararlo en `core/modules/registry.ts` (slug, nivel mínimo, zona del menú).
3. Sus pestañas en `core/modules/pestanas.ts`.
4. Sus tablas, en una migración con `company_id` y RLS
   ([`multi-tenancy.md`](multi-tenancy.md)), y su fila en `modules` /
   `plan_modules`.
5. `npm run typecheck && npm run fronteras && npm run build:check`.
