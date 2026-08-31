# Las dos líneas: ANIMA STUDIO y ANIMA COMPANY

> Un solo código, una sola base, dos productos. La diferencia no está en el
> software: está en una fila de `product_lines`.

## Por qué dos y no una

Un creador que trabaja solo y una empresa con reparto y bodega necesitan cosas
distintas, pero el 70% de lo que usan es el mismo: clientes, dinero, agenda,
documentos, permisos. Partir el producto en dos aplicaciones habría duplicado ese
70%. Partirlo en dos **líneas** deja el núcleo intacto y cambia solo qué módulos
alcanza cada plan.

## Qué es cada una

**ANIMA STUDIO** — el creador y su obra. Es la evolución del Taller: proyectos,
tareas, vínculos, cotizador, finanzas y agenda. Su unidad de trabajo es el
*encargo*.

**ANIMA COMPANY** — la empresa y su operación. Clientes, pedidos, inventario,
compras, reparto, cobranza. Su unidad de trabajo es el *pedido*.

## Planes

| Línea | Plan | Usuarios | Módulos |
|---|---|---:|---|
| **STUDIO** | Solo | 1 | core · creator · agenda |
| | Taller | 3 | + crm · finance |
| | Clan | 10 | + commerce · support |
| **COMPANY** | Starter | 2 | core · crm · agenda · support |
| | Pro | 8 | + commerce · creator · finance |
| | Business | 25 | + operations · delivery · food |
| | Enterprise | — | + ai |

**Los precios de Studio están en cero a propósito.** La estructura está lista;
falta la decisión comercial.

## Qué módulo sirve a qué línea

Siete módulos sirven a las dos: `core`, `crm`, `commerce`, `creator`, `finance`,
`agenda`, `support`. Que `creator` esté también en Company es deliberado: una
empresa también arma portafolio y cotiza.

Cuatro son por ahora solo de Company: `operations`, `delivery`, `food`, `ai`. Son
los de operación física y escala.

Esa lista vive en `platform/src/core/modules/registry.ts` como campo `lines`, y es
**informativa**: sirve para agrupar el menú. Quién ve qué lo deciden
`plan_modules` y `company_modules`, en la base. Si algún día un plan de Studio
incluye `operations`, basta con la fila: no hay que tocar el código.

## Un usuario, dos líneas

La línea es del **tenant**, no de la persona. Un mismo usuario puede pertenecer a
una organización STUDIO y a una COMPANY, con roles distintos en cada una, y elegir
al entrar. Es el caso de referencia: artista en Studio, operación de murales en
Company.

## Lo que se retiró

`INDUSTRY` fue una tercera línea con un solo plan (`enterprise`) y una sola
empresa (Bilagay). Se fundió en COMPANY en la migración 0067: `enterprise` pasó a
ser su tramo más alto. La fila sigue en `product_lines` con `active = false` —
retirada, no borrada, para conservar el historial.
