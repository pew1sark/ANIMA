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

## El plan manda

La línea vivía en `companies.product_line_id` y el plan la repetía por su lado.
Dos fuentes para el mismo hecho, y la 0070 ya tuvo que arreglar una organización
que estaba en STUDIO con un plan de COMPANY.

Desde la 0077 manda el plan: un trigger sobre `subscriptions` mantiene
`companies.product_line_id` como espejo. La columna sigue ahí porque la leen
`mi_espacio` y media aplicación, pero ya no se escribe a mano.

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

## Las dos puertas

Después de entrar en `/ANIMA/app/` lo primero que aparece son dos puertas. No es
decoración: son dos formas distintas de trabajar y conviene decidir antes, no ir
descubriéndolo por el menú.

**Lo que se te abre lo decide tu plan**, no el frontend. Lo resuelve
`mis_lineas()` (migración 0077) en la base:

| Puerta | Se abre si | Lleva a |
|---|---|---|
| **ANIMA STUDIO** | tu plan es de línea `studio`, o tienes un Alma y no perteneces a ninguna organización de COMPANY | `/ANIMA/home.html` |
| **ANIMA COMPANY** | tu plan es de línea `company` | la plataforma |
| **Consola** | eres `platform_admin` | el negocio del software |

La suscripción `morosa` sigue abriendo: cortarle el acceso a quien debe es una
decisión comercial, no algo que deba pasar solo.

**La consola no cuelga de COMPANY.** Administrar el software no es operar una
empresa: por eso va aparte, debajo de la línea, y no aparece dentro del espacio
de ningún cliente.

**El Alma no basta por sí sola.** El trigger `handle_new_user` le crea un Alma a
toda cuenta de Auth —y publica un eco «✦ … despertó» en el Árbol—, así que a un
cajero dado de alta en una pescadería le salía la puerta de STUDIO. La 0078
cierra las dos puntas: `mis_lineas()` no abre STUDIO a quien pertenece a una
organización de COMPANY, y `handle_new_user` acepta
`raw_user_meta_data.origen = 'company'` para no crear Alma ni eco.

**STUDIO no es una pantalla de esta app: es el ANIMA de siempre.** El Taller con
sus 10.000 líneas ya existe y funciona; duplicarlo en React para mostrar
"Falta construir esta pantalla" sería mentir. Se cruza sin volver a entrar
porque las dos usan el mismo proyecto de Supabase en el mismo origen, así que
comparten la sesión en `localStorage`. La ruta se deduce de `base` en
`config/env.ts` (`/ANIMA/app/` → `/ANIMA/`); no hay una ruta escrita a mano.

Con una sola puerta abierta no se pregunta. Un Alma de la Alpha reincorporada
—sin organización ninguna— entra directo a STUDIO; un empleado de un cliente,
directo a su espacio de COMPANY.

**Ojo con `company_members`:** su política de lectura es `is_company_member`,
o sea que ves a **todos** los miembros de tus empresas. La consulta que arma tus
membresías tiene que filtrar por `user_id` a mano: sin eso la organización
aparece repetida y `current.role` puede terminar siendo el rol de otra persona.

## Lo que se retiró

`INDUSTRY` fue una tercera línea con un solo plan (`enterprise`) y una sola
empresa (Bilagay). Se fundió en COMPANY en la migración 0067: `enterprise` pasó a
ser su tramo más alto. La fila sigue en `product_lines` con `active = false` —
retirada, no borrada, para conservar el historial.
