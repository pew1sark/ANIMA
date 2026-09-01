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

| Módulo | Entidades | Estado |
|---|---|---|
| `crm` · **Clientes** | Clientes · Direcciones de despacho · Listas de precio | **funcionando** |
| `commerce` · **Ventas** | Pedidos *(con líneas)* · Productos · Categorías | **funcionando** |
| `operations` · **Operaciones** | Inventario · Movimientos · Compras *(con líneas)* · Proveedores · Bodegas · Mermas | **funcionando** |
| `delivery` · **Reparto** | Entregas · Rutas | **funcionando** |
| `finance` · **Finanzas** | Pagos · Por cobrar (apertura) · Por pagar (apertura) | **funcionando** |
| `food` · **Procesos** | Procesos · Especies | **funcionando** |
| `core` | marca, campos propios, módulos del plan | **funcionando** |
| `support`, `ai` | — | sin pantalla |

## Todos los módulos a la vista

`MOSTRAR_TODOS_LOS_MODULOS` en `core/modules/registry.ts` está en **`true`**:
el menú lista todos los módulos aunque el plan de la empresa no los incluya, y
los que quedan fuera llevan un punto discreto al lado.

Es **temporal y deliberado**, mientras COMPANY se termina de construir. Cambia
solo lo que se dibuja: los datos siguen protegidos por RLS y por el nivel de
rol, así que un módulo visible sobre una tabla que no corresponde no devuelve
ni una fila. Cuando los planes estén decididos, se pone en `false`.

## Los niveles de escritura no son todos iguales

RLS no pide lo mismo para todo, y la pantalla lo respeta con
`Esquema.nivelEscritura`:

| Entidades | Nivel |
|---|---|
| Pagos, Compras, Aperturas | **60** (encargado) |
| Todo lo demás | **40** (empleado) |

## La sincronización, probada de punta a punta

El frontend **no calcula nada**. Verificado en el navegador, con la base
comprobada después:

1. Se crea un pedido → la base le pone `PED-2026-000002`.
2. Se le agrega una línea de 12 × $45.000 → `line_total` (columna generada)
   da $540.000, y `trg_order_items_totals` sube `subtotal` y `total` del pedido.
   La ficha vuelve a leer el padre y muestra el total nuevo.
3. Se registra un pago de $200.000 → `trg_apply_payment` deja `amount_paid` en
   200.000 y `payment_status` en **parcial**.
4. Mover la tarjeta en el tablero cambia `status` y `trg_order_status_history`
   guarda el paso.

Sumar en el frontend habría sido más rápido de escribir y estaría mal: la base
redondea, aplica descuentos y usa la cantidad preparada cuando existe. Un solo
lugar donde se calcula es lo que evita que dos pantallas muestren dos totales
distintos del mismo pedido.

## El motor de datos

No se escribe una pantalla por entidad: se **declara** la entidad y la pantalla
se dibuja sola. Es la idea que se toma prestada de Airtable, y cambia el costo
de agregar un módulo de un archivo de 300 líneas a veinte de declaración.

```
core/datos/tipos.ts        Campo y Esquema
core/datos/esquemas.ts     las entidades declaradas ← aquí se agregan módulos
core/datos/datos.service   listar, crear, actualizar, borrar, relaciones
components/datos/Vista     tabla · tablero · buscador
components/datos/Ficha     el formulario, generado del esquema
components/datos/campos    cómo se ve y se escribe cada tipo
```

Lo que trae de fábrica cada entidad declarada:

- **Tabla** con columnas configurables y **edición en la propia celda**.
- **Tablero** (kanban) agrupando por cualquier campo de selección o relación,
  con arrastrar y soltar. Mover una tarjeta escribe en la base.
- **Buscador** sobre todos los campos, incluidos los de relación por su nombre.
- **Ficha** con todos los campos, los calculados aparte, y borrado con
  confirmación.
- **Campos propios** de la empresa, mezclados con los declarados.

**`Esquema.tabla` es también la `entity` de `custom_fields`.** El trigger
`trg_validate_custom` valida con `tg_table_name`, así que cualquier otro nombre
—`product` en vez de `products`— haría dos cosas malas a la vez: los campos
propios existentes no aparecerían, y los nuevos entrarían sin validar.

## Campos propios

Los agrega la propia empresa desde **Configuración → Campos propios**, con
nivel 80. Aparecen solos en la ficha, en la búsqueda y en la tabla. El valor
vive en la columna `custom` de cada fila y el trigger lo valida contra la
definición.

Quitar un campo lo **apaga** (`active = false`), no lo borra: si hubiera filas
con ese dato guardado, borrar la definición dejaría un valor que nadie sabe leer.

Verificado contra los cuatro campos que trajo el puerto de Bilagay —especie,
zona de captura, tipo de corte, cadena de frío—: aparecen en la ficha de los 11
productos reales sin tocar una línea de código.

Un módulo cuya pantalla no existe ya no dice solo «falta construir esta
pantalla»: dice qué cubre y sobre qué tablas se va a construir. Saber qué falta
vale más que saber que falta.

## En qué orden

No es una lista de deseos: es el orden en que las cosas se sostienen unas a
otras.

Los nueve pasos están hechos: clientes, catálogo, pedidos con sus líneas,
proveedores, inventario, compras con sus líneas, cobranza y reparto.

Lo que queda no es más de lo mismo, es otra cosa:

1. **Informes** — ventas por período, márgenes, rotación. Se leen las tablas
   que ya están; falta decidir qué preguntas valen la pena.
2. **La app de terreno** — JLIZ tiene seis pantallas para el repartidor
   (`src/pages/worker`). Es una interfaz distinta, para el teléfono.
3. **Correo saliente y cobranza automática** — sigue pendiente de portar.
4. **El conector Bsale** — explícitamente aplazado.
5. **`support` e `ai`** — sin pantalla todavía.

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
