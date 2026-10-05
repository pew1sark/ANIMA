# Arquitectura de `platform/` (ANIMA COMPANY)

> Fase 2 · en curso. Complementa [`architecture.md`](architecture.md), que
> explica la plataforma multiempresa y la base. Este documento es sobre cómo
> se ordena el **código** del frontend.

## Estructura

```
platform/src/
├── core/            lo que necesita cualquier pantalla para existir
│   ├── auth/        sesión (useAuth)
│   ├── tenant/      organización activa (useTenant)
│   ├── modules/     registro de módulos y sus pestañas
│   ├── datos/       motor declarativo: esquemas → tabla + ficha
│   └── permissions/
├── ui/              piezas de interfaz compartidas, sin datos propios
│   ├── cifras/      tarjeta de cifra con fórmula e insumos, avisos, cabecera
│   ├── panel/       cuadros de panel (gráfico y lista de un resumen)
│   ├── graficos/    columnas, serie, tramos (SVG propio)
│   ├── mapa/        Chile y Colombia (SVG propio)
│   └── Periodo.tsx  selector de rango
├── modules/         un módulo vertical por carpeta, aislado
│   ├── capital/        Capital Intelligence (pantallas + capital.service)
│   └── inmobiliaria/   Real Estate Intelligence + Brokerage (Casa Click)
├── components/      espacio de trabajo y pantallas de COMPANY aún sin migrar
├── services/        acceso a datos compartido (resumen, equipo, marca…)
├── lib/  config/  types/  hooks/
└── vitrina/         pantallas con datos falsos para diseñar sin Supabase
```

```
            ┌──────────── modules/ ────────────┐
            │  capital      inmobiliaria   …   │   ✗ nunca entre sí
            └───────┬──────────────┬───────────┘
                    │ importa      │ importa
            ┌───────▼──────────────▼───────────┐
            │   ui/   core/   services/   lib/  │   ✗ nunca hacia modules/
            └──────────────────────────────────┘
```

## Reglas

1. **Un módulo no importa de otro módulo.** Si dos módulos necesitan lo mismo,
   eso sube a `ui/` (si es interfaz) o a `core/`/`services/` (si es datos o
   sesión). Así se pudo separar Real Estate de Capital: usaba la tarjeta de
   cifra y el selector de período de Capital, que ahora están en `ui/`.
2. **Lo compartido no depende de lo particular.** `core/`, `ui/`, `lib/`,
   `services/`, `config/`, `types/` y `hooks/` no importan de `modules/`.
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
| Pantallas de COMPANY (`components/company/`: inicio, informes, equipo, marca, campos propios, plan, cuotas, análisis financiero) | ⏳ siguiente PR | — |
| Motor de datos y sus pantallas (`components/datos/`) → `core/datos` + `ui/` | ⏳ | — |
| Shell del espacio (`Espacio`, `Login`, `Puertas`, `Consola`, `MenuCuenta`…) → `app/` o `core/` | ⏳ | — |
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
