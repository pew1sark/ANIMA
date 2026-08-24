# Extensibilidad por tenant

> Cada cliente adapta ANIMA a su negocio sin que eso afecte a los demás.
> Y quien levanta la información es **el cliente**, no tú.

## La regla

Nunca se escribe esto:

```js
if (empresa === 'bilagay') { … }
```

Se escribe esto:

```js
if (await supabase.rpc('company_has_feature', { p_feature: 'fish_reception' })) { … }
```

La diferencia no es de estilo. La primera forma obliga a tocar el Core cada vez
que un cliente pide algo, y expone su funcionalidad a todos. La segunda no.

## Las cuatro capas de adaptación

De más barata a más cara, en el orden en que conviene intentarlas:

| Capa | Qué permite | Quién la toca |
|---|---|---|
| **Ajustes** (`company_config`) | tolerancias, horarios, reglas de negocio | el cliente |
| **Campos personalizados** (`custom_fields`) | atributos propios en productos, clientes, lotes | el cliente |
| **Módulos y niveles** (`company_modules`) | qué partes del sistema existen para él | su plan |
| **Features** (`features`, `company_features`) | funcionalidad construida a medida | la plataforma |

Si algo se puede resolver en una capa más alta, no baja a la siguiente.

## El recorrido de un desarrollo a medida

`features.stage` guarda en qué punto del camino está:

```
custom      hecho para un cliente, invisible para el resto
   ↓        se valida con uso real
beta        se ofrece a algunos
   ↓        se estabiliza
oficial     forma parte del producto, se enciende con el módulo
```

Pasar de una etapa a la siguiente es **cambiar una columna**, no reescribir nada.
`fish_reception` es el primer caso: nació para Bilagay y hoy está en `custom`.

## Campos personalizados: por qué JSONB y no una tabla de valores

Tres opciones había:

1. **Una columna por campo** — inmanejable: cada cliente altera el esquema común.
2. **Tabla clave-valor** — cada campo mostrado en pantalla es un JOIN más.
3. **JSONB en la propia entidad + índice GIN** ← la elegida.

El JSONB viaja con la fila, se lee sin JOIN, y el GIN permite filtrar por
cualquier campo sin crear índices nuevos:

```sql
select * from products where custom @> '{"requiere_frio": true}';
```

El precio es que dentro del JSONB no hay integridad referencial. Por eso las
definiciones viven en `custom_fields` y un disparador valida contra ellas:
tipos, obligatorios y listas cerradas.

## El levantamiento configura la plataforma

Esto es lo que cierra el círculo. Las reglas de la plantilla
(`survey_templates.rules`) ya no solo encienden módulos: también crean campos y
activan funcionalidades.

```json
{"question_id":"C13","operator":"contains","value":"sernapesca",
 "effect":{"feature":"fish_reception"}}

{"question_id":"C11","operator":"contains","value":"si",
 "effect":{"custom_field":{"entity":"inventory_lots",
           "key":"temperatura_recepcion","label":"Temperatura al recibir",
           "type":"numero"}}}
```

Verificado sobre las respuestas reales de Bilagay: **13 reglas aplicadas**, la
feature de recepción de pescado encendida sola porque su respuesta mencionaba
Sernapesca, y seis campos personalizados creados.

### Y sus listas se vuelven datos

`import_intake` convierte lo que el cliente cargó en productos, clientes y
proveedores reales. Lo importante: **las columnas que trae y no existen en el
modelo no se pierden** — se guardan en `custom` y además quedan *definidas* en
`custom_fields`, así que aparecen en su formulario a partir de ese momento.

La plataforma aprende la forma del negocio desde lo que el cliente sube.

## Lo que todavía falta

| Pieza | Estado |
|---|---|
| Líneas de producto (STUDIO/COMPANY/INDUSTRY) | ✅ |
| Feature flags y entitlements | ✅ |
| Niveles de módulo | ✅ estructura, sin usar aún |
| Campos personalizados | ✅ |
| Onboarding dirigido por el cliente | ✅ |
| **Workflows configurables** | ❌ los estados siguen siendo enums |
| **Vistas y menús por tenant** | ❌ |
| **Automatizaciones** | ❌ (el motor de reglas es la semilla) |
| **Integraciones por organización** | ❌ |

### La deuda que sigue abierta

`fish_species`, `products.species_id` y `order_items.ice_weight` siguen en el
Core compartido. Ahora existe el mecanismo para sacarlos —los campos
personalizados equivalentes ya están definidos para Bilagay—, pero migrarlos
implica tocar funciones que hoy operan. Es el siguiente paso natural.

El enum `app_role` (con *empaque* y *reparto*) también debería ser un catálogo
por tenant: una agencia de diseño no tiene esos roles.
