# ANIMA COMPANY sobre la arquitectura de Bilagay

> La arquitectura ya está en la base. Lo que falta son las pantallas.

## De dónde viene

Pescadería Bilagay se construyó en JLIZ (`~/Desktop/JLIZBUSINESS`, Supabase
`owfvuusxfvzjgxfmllpt`) como un ERP/POS completo: 22 pantallas de administración,
6 de terreno, unas 20.000 líneas. Esa es la base de COMPANY.

**No se migran sus datos.** Bilagay sigue operando donde opera; su información de
ventas no se toca ni se mira. Lo que se toma es la arquitectura: las tablas, los
estados, la forma de entender un pedido, un lote, una ruta y una cobranza.

Eso ya ocurrió en parte: el puerto de agosto trajo las tablas a
`jwxeowowuxmijuexdrua`, con `company_id` y RLS en todas. Están **vacías y
esperando** — `customers` 0, `orders` 0 — porque el que las llene será cada
cliente nuevo, con su información.

## Qué sostiene cada módulo

Está declarado en `platform/src/core/modules/registry.ts`, en los campos `cubre`
y `tablas`. Ahí, y no en esta página, es donde hay que mirarlo cuando se
construya cada pantalla; aquí va el resumen.

| Módulo | Cubre | Estado |
|---|---|---|
| `crm` · **Clientes** | ficha, direcciones, listas de precio, precios especiales | **construido** (ficha; faltan direcciones y precios) |
| `commerce` · **Ventas** | catálogo, pedidos, historial de estados | tablas listas |
| `operations` · **Operaciones** | inventario por lotes, mermas, bodegas, compras, proveedores | tablas listas |
| `delivery` · **Reparto** | rutas y entregas | tablas listas |
| `finance` · **Finanzas** | cobranza, pagos, saldos de apertura | tablas listas |
| `food` · **Procesos** | órdenes de proceso, rendimientos | tablas listas |
| `core` | empresa, usuarios, roles, numeración, auditoría | parcial |

Un módulo cuya pantalla no existe ya no dice solo «falta construir esta
pantalla»: dice qué cubre y sobre qué tablas se va a construir. Saber qué falta
vale más que saber que falta.

## En qué orden

No es una lista de deseos: es el orden en que las cosas se sostienen unas a
otras.

1. **Clientes** — de aquí cuelga todo lo demás. *Hecho.*
2. **Catálogo y precios** — `products`, `product_categories`, `price_lists`.
   Sin precio no hay pedido.
3. **Pedidos** — `orders` + `order_items` + `order_status_history`. El corazón.
4. **Inventario** — `inventory_lots`, `inventory_movements`. Qué hay y dónde.
5. **Compras y proveedores** — cómo entra lo que se vende.
6. **Cobranza** — `payments`, `opening_receivables`. Qué se debe.
7. **Reparto** — `routes`, `deliveries`. Solo cuando haya pedidos que repartir.

## Lo que falta traer de JLIZ

Medido el 30 de agosto de 2026, y sigue pendiente: **20 tablas, 56 funciones,
12 vistas, 9 Edge Functions y 2 cron jobs** — el bloque de cobranza/AR, el
conector Bsale y el correo saliente. El conector Bsale queda explícitamente
para después.

**Al portar `bsale_aplicar_costos`, ojo:** su versión vieja borraba y reinsertaba
`purchase_items` en cada corrida, lo que hizo crecer `audit_logs` hasta 543 MB en
JLIZ. El arreglo (sincronización diferencial por huella md5) está en la migración
`20260831165320_frenar_crecimiento_auditoria_bsale` del repo de JLIZ. Si se porta
la función sin el arreglo, el problema viaja con ella.

## Dos tablas de clientes, a propósito

`clients` es la libreta de Vínculos del Taller de STUDIO: alguien que te encarga
una obra. `customers` es el cliente de COMPANY: alguien que compra, con lista de
precios, crédito, plazo de pago y direcciones de despacho.

No son lo mismo y no conviene fundirlas. Un muralista no necesita un límite de
crédito; una pescadería no necesita un portafolio.
