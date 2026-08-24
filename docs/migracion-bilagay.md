# Migración de Bilagay a la plataforma

Estado al 23 de agosto de 2026.

## Qué está hecho

**El esquema del módulo Commerce ya vive en la plataforma** (migración `0044`), con las
tres correcciones que la versión de un solo cliente no necesitaba:

| Corrección | Por qué |
|---|---|
| `company_id not null` en las 14 tablas | Sin esto no hay aislamiento posible |
| Índices únicos **por empresa** | `sku`, `code`, folio del SII. Si fueran globales, el segundo cliente no podría usar un código que ya usó el primero |
| Numeración de códigos **por empresa** | Cada empresa arranca su correlativo en `000001` |

Verificado (8/8): dos empresas pueden tener el mismo `SKU-001`, sus numeraciones son
independientes, y ninguna ve ni escribe en los datos de la otra.

## Tablas portadas

```
Catálogo     product_categories · fish_species · products · product_price_history
Ubicaciones  locations
Proveedores  suppliers · supplier_aliases · supplier_products
Compras      purchases · purchase_items · purchase_history
Inventario   inventory_lots · inventory_movements
Sistema      counters (numeración por empresa)
```

Permisos: catálogo e inventario desde **empleado (40)**; compras y registro tributario
desde **encargado (60)** — el dinero no lo ve todo el equipo.

## Lo que NO se porta

Estas tablas de JLIZ **duplican** lo que la plataforma ya provee. La aplicación debe pasar
a usar las de la plataforma:

| Tabla en JLIZ | Reemplazo en la plataforma |
|---|---|
| `profiles` (3 filas) | `profiles` + `company_members` de Bilagay |
| `role_permissions` (43) | `roles` + `permissions` + `role_permissions` |
| `audit_logs` (735) | `audit_logs` con `company_id` |
| `tasks` (0) | `tasks`, que ya lleva `company_id` |

## Datos copiados y verificados · 23-08-2026

Los datos de Bilagay **ya están en la base de la plataforma**, etiquetados con su
`company_id`. Copiados vía SQL entre proyectos y verificados con sumas de control
que coinciden exactamente con el origen:

| | Origen | Destino |
|---|---|---|
| Registro tributario (filas) | 607 | **607** |
| Monto total | $200.274.805 | **$200.274.805** |
| IVA | $31.748.177 | **$31.748.177** |
| Neto | $167.095.544 | **$167.095.544** |
| Exento | $1.206.741 | **$1.206.741** |
| Notas de crédito | 4 | **4** |
| Documentos sin proveedor | 0 | **0** |

Además: 60 proveedores, 11 productos, 5 ubicaciones, 8 relaciones proveedor-producto,
2 alias, 2 compras con sus ítems, 2 lotes, 2 movimientos de inventario, 1 categoría,
1 registro de precio y los 2 contadores de numeración (COM y LOTE en 4, para que los
correlativos continúen donde iban).

**Nota sobre autoría:** las columnas `created_by`, `received_by`, `changed_by` y
`driver_id` quedaron nulas: apuntaban a usuarios del proyecto viejo que aún no existen
en la plataforma. Se completan cuando se den de alta los 3 usuarios de Bilagay.

## Lo que falta

**1 · (hecho) Copiar los datos.** Unas 705 filas en el bloque de compras:

```
purchase_history 607 · suppliers 60 · products 11 · supplier_products 8
locations 5 · inventory_lots 2 · purchases 2 · purchase_items 2
inventory_movements 2 · supplier_aliases 2 · product_price_history 1
product_categories 1 · counters 2
```

El camino correcto es `pg_dump` del origen y `psql` al destino, **con las contraseñas de
base de datos de los dos proyectos** (que están en el panel de Supabase, en
Settings → Database). Al copiar hay que:

- añadir `company_id` = el id de la empresa `bilagay`
- poner en `null` las columnas `created_by`, `received_by`, `changed_by`, `driver_id`:
  apuntan a usuarios del proyecto viejo que no existen en el nuevo
- respetar el orden de dependencias: categorías y especies → productos → proveedores →
  compras → ítems → lotes → movimientos

**2 · Dar de alta a los 3 usuarios de Bilagay** en la plataforma y añadirlos a la empresa
con su rol.

**3 · Apuntar la aplicación** de JLIZ a la base de la plataforma: cambiar
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y adaptar las consultas que usaban
`profiles`/`role_permissions` propios.

**4 · Portar el motor operativo.** Aquí subestimé el alcance en el informe del 23 de
agosto: dije que lo que faltaba era "esquema, no datos". Es bastante más que eso.

Medido sobre el proyecto de origen:

| Qué falta | Cantidad | Tamaño |
|---|---|---|
| Funciones de negocio (RPC) | **62** | 90.570 caracteres |
| Vistas | **14** | 12.160 caracteres |
| Tablas | **21** | mayormente vacías |

La aplicación de JLIZ **invoca 36 de esas funciones** (`receive_purchase`, `dispatch_order`,
`process_lot`, `dashboard_kpis`, `register_payment_out`, `finish_preparation`…) y **consulta
las 14 vistas**. Ninguna existe todavía en la plataforma.

Tablas pendientes: `customers`, `customer_addresses`, `customer_special_prices`, `orders`,
`order_items`, `order_status_history`, `deliveries`, `routes`, `payments`,
`opening_payables`, `opening_receivables`, `price_lists`, `price_list_items`,
`processing_orders`, `processing_outputs`, `processing_yields`, `stock_reservations`,
`losses`, `notifications`, `settings`, `user_invitations`.

Además, la app usa `profiles.role` y una tabla `role_permissions` con forma distinta a la
de la plataforma. Eso requiere tocar su código, no solo su configuración.

**5 · Verificar unos días** con el cliente trabajando sobre la base nueva.

**6 · Recién entonces** dar de baja el proyecto `owfvuusxfvzjgxfmllpt`.

## Por qué el proyecto viejo NO se puede apagar todavía

**Bilagay trabaja hoy contra `owfvuusxfvzjgxfmllpt`.** Su aplicación llama a 36 funciones
y 14 vistas que solo existen ahí. Si ese proyecto se pausa o se elimina, el cliente se
queda sin sistema el mismo día.

Lo migrado hasta ahora es el **catálogo, los proveedores, las compras y el inventario**:
la parte con datos reales. Lo que falta es el **motor operativo**: pedidos, preparación,
despacho, cobranza y los cálculos.

## Respaldo antes de cualquier baja

Cuando llegue el momento, y **antes** de tocar nada, sacar una copia completa. La
contraseña está en Supabase → Settings → Database:

```bash
pg_dump "postgresql://postgres:[CONTRASEÑA]@db.owfvuusxfvzjgxfmllpt.supabase.co:5432/postgres" \
  --no-owner --no-privileges -f bilagay-respaldo-$(date +%F).sql
```

## Regla

No se apaga nada hasta que el paso 5 esté cerrado. El orden es migrar, apuntar, verificar,
y solo al final apagar.

---

## Avance del motor operativo · 24 de agosto de 2026

| | Portado | Falta |
|---|---|---|
| Tablas | **21 de 21** | — |
| Vistas | **14 de 14** | — |
| Funciones | **24 de 62** | 36 (67.141 caracteres) |

### Verificado de extremo a extremo

Ciclo completo de un pedido sobre datos reales de Bilagay:

```
crear → confirm_order (reserva 10 kg del lote)
      → start_preparation
      → finish_preparation (prepara 9,4 kg, descuenta stock,
        calcula costo real $3.500/kg, libera la reserva sobrante,
        y avisa porque 6% supera la tolerancia del 5%)
      → dispatch_order (crea ENT-2026-000001)
      → start_delivery → complete_delivery (registra el cobro)

historial: nuevo → confirmado → en_preparacion → preparado → en_reparto → entregado
total facturado con el peso REAL: $87.420 (9,4 kg × $9.300)
```

### Fallos multiempresa encontrados al portar

- **`reserve_order_stock`** buscaba lotes por `product_id` **sin filtrar empresa**.
- **`check_low_stock`** deduplicaba avisos por `link` sin mirar la empresa: un aviso
  de una empresa silenciaba el de otra.
- **`fail_delivery`** no comprobaba **nada**: cualquiera con sesión podía marcar
  fallida la entrega de cualquier empresa.
- Todas las funciones son `SECURITY DEFINER` y **saltan el RLS**. Cada una lleva
  ahora `assert_company()` sobre la fila que toca.

### Funciones que faltan (36)

```
Paneles      dashboard_kpis · finance_kpis · sales_series · system_readiness
Márgenes     margin_by_customer · margin_by_product
Compras      receive_purchase · void_purchase · update_purchase_costs
             register_supplier_payment · resolve_supplier · sync_suppliers_from_history
Cobros       register_collection · register_payment_out · trg_apply_payment
Precios      price_for
Proceso      process_lot
Reparto      update_delivery_weights
Usuarios     invite_user · revoke_invitation · set_user_role · set_user_active
             set_role_permission · audit_role_permission
Levantamiento survey_get · survey_save · survey_submit · intake_get
             intake_save_row · intake_delete_row · import_intake
Otros        mark_overdue_orders · audit_row · handle_new_user · purge_demo_data
```
