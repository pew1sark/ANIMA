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

## Lo que falta

**1 · Copiar los datos.** Unas 705 filas en el bloque de compras:

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

**4 · Portar el resto del dominio**: ventas (`customers`, `orders`, `order_items`,
`deliveries`, `payments`, `routes`), procesos y aperturas. **Están todas vacías**, así que
es trabajo de esquema, no de datos.

**5 · Verificar unos días** con el cliente trabajando sobre la base nueva.

**6 · Recién entonces** dar de baja el proyecto `owfvuusxfvzjgxfmllpt`.

## Regla

No se apaga nada hasta que el paso 5 esté cerrado. El orden es migrar, apuntar, verificar,
y solo al final apagar.
