# Brokerage — la operación comercial

> Real Estate Intelligence nació por el lado del desarrollo: un predio, su
> calificación, su prefactibilidad, su vehículo. Es la mitad de abajo del
> embudo. Esto es la mitad de arriba —la que produce los datos de la otra— y
> es donde una inmobiliaria pasa el día.

## El problema que resuelve

El módulo sabía **qué** se vendió. No sabía **cómo**: de qué canal vino, en
cuántos días, cuántas visitas costó, qué se dejó de hacer. Eso vivía en
WhatsApp y en la memoria del corredor, y por eso el inventario podía decir que
un apartamento se vendió en marzo sin poder decir nunca por qué el de al lado
no.

Seis tablas, en el orden en que ocurre el trabajo:

```
lead → visita → negociación → contrato
         ↑                        ↑
     actividad                  meta
```

| Tabla | Qué es | Existe por |
|---|---|---|
| `rei_leads` | Un interés comercial con etapa | Las fechas de cada transición: sin ellas, conversión y días por etapa son incalculables |
| `rei_deals` | Cliente × inmueble × corredor, con monto | Es la única tabla de la que sale un forecast |
| `rei_visits` | Las visitas a inmuebles | Es el hecho que más información produce del proceso |
| `rei_activities` | Llamadas, mensajes, notas y tareas | Que el historial de un cliente se arme con una consulta y no con seis |
| `rei_contracts` | Arriendos, mandatos, administraciones | Una sola columna: `end_date` |
| `rei_targets` | Metas mensuales | Sin meta, el panel dice cuánto se hizo pero no si alcanza |

## Las cinco decisiones que no se deducen del esquema

### 1 · La fecha de cada etapa la pone la base

`rei_leads` no lleva una columna «etapa» y nada más. Lleva `contacted_at`,
`qualified_at`, `offer_at`, `won_at` y seis más, y el trigger
`rei_sellar_etapa_lead()` las estampa cuando la etapa cambia.

Sin eso se sabría dónde está cada lead **hoy** y nunca cuánto tardó en llegar.
Pedirle al corredor que escriba la fecha a mano es garantizar que no esté.

Volver a una etapa anterior **no** reescribe su fecha: la primera vez que se
alcanzó es el dato que sirve, y el retroceso ya queda en el log de auditoría.
`first_contact_at` es la excepción por arriba — se pone en cuanto el lead sale
de «nuevo» por cualquier camino, porque el tiempo de primera respuesta es la
métrica que más decide una conversión y no puede depender de que alguien pase
por «contactado» en vez de saltar directo a «visita agendada».

### 2 · El ingreso esperado es la comisión, no el precio del inmueble

La misma decisión que tomó la migración `0127`, y por el mismo motivo: **la
firma intermedia, no compra ni vende por cuenta propia**. De una venta de 100
millones la empresa recibe su comisión, no los 100 millones.

Poner el precio del inmueble en el forecast multiplicaría por treinta lo que de
verdad entra, en la misma pantalla donde alguien lee cuánto va a facturar el
mes. Es la clase de cifra que después se lleva a una reunión.

`expected_revenue` y `weighted_revenue` son columnas **generadas**, por lo mismo
que `rei_properties.price_m2`: escritas a mano quedarían viejas el día que
alguien mueva la probabilidad y no el monto.

### 3 · Todo registro comercial vivo lleva próxima acción

Lead, negociación, visita y contrato tienen `next_action` y
`next_action_date`. Un lead abierto sin próxima acción es un lead que nadie va
a volver a tocar, y el panel lo cuenta como lo que es.

Es el control principal del módulo. La lista «Sin próxima acción» está hecha
para dejarse vacía.

Al cerrar —ganado o perdido— el trigger borra la próxima acción: dejarla puesta
haría que el registro apareciera para siempre en los pendientes de alguien.

### 4 · La actividad se enlaza con columnas, no con `(entidad, id)`

La tentación del CRM genérico es una tabla polimórfica con dos columnas de
texto. Aquí cada vínculo es una FK de verdad, con su `on delete` y su aduana de
empresa (`ci_misma_empresa`).

Son ocho columnas casi siempre nulas y valen lo que cuestan: con el par
`(entidad, id)` nada impide apuntar a una fila de otra organización, y es
exactamente la fuga que RLS no ve.

### 5 · El responsable es un usuario, no un texto

En Capital Intelligence `owner` es texto y está bien: quien responde por una
ronda puede ser alguien de afuera. Aquí no puede serlo. Las metas por persona
exigen comparar el resultado de Juan contra la meta de Juan, y con texto libre
«Juan», «juan» y «J. Pérez» son tres corredores.

El trigger `rei_broker_es_miembro()` corta al escribir un responsable que no es
miembro activo de la organización. La vista `rei_brokers` le da al motor de
datos la forma que espera de una relación — `(id, company_id, name)` — sin
tocar el motor.

## Permisos

El corte es por empresa, igual que en el resto del módulo, **con una
excepción**.

| Tabla | Leer | Escribir | Borrar |
|---|---|---|---|
| `rei_leads` | 40 | 40 | 60 |
| `rei_deals` | 40 | 40 | 60 |
| `rei_visits` | 40 | 40 | 40 |
| `rei_activities` | 40 | 40 | 40 |
| `rei_contracts` | 40 | **60** | 80 |
| `rei_targets` | **propia + oficina** | 60 | 80 |

**Las metas no son de todos.** La meta de comisión de un corredor es su
remuneración implícita, y que cualquiera de nivel 40 pueda leerla convierte el
módulo en una planilla de sueldos abierta. Nivel 40 ve **su** meta y las de la
oficina (las que no tienen persona); nivel 60 ve todas.

**Los contratos piden 60 para escribir.** Todo lo demás baja a 40 porque pedir
nivel de director para anotar una llamada es la forma segura de que las
llamadas no se anoten. Un contrato es otra cosa: tiene canon, vigencia y dos
partes, y de su fecha de fin cuelga el ingreso del mes que viene.

## El panel

Todo sale de `rei_comercial()` en una sola llamada. Si la comisión del mes se
calculara en el panel, en la lista de metas y en el informe, tarde o temprano
darían tres cifras distintas y no habría forma de saber cuál está mal.

La pantalla se lee en el orden en que se pregunta:

1. **Qué está torcido** — las alertas, antes que cualquier cifra
2. **Cómo va el mes** — comisión contra meta, y la brecha
3. **De dónde va a salir** — el embudo y el pipeline ponderado
4. **Quién** — el equipo, cada uno contra su meta
5. **Qué hay que hacer** — los próximos siete días y lo que no tiene próxima acción
6. **Qué se vence** — los contratos, por tramos de urgencia

Cada cifra viene con su fórmula y sus insumos pegados, como en Capital
Intelligence: una cifra que no se puede abrir es una cifra que nadie discute y
que por eso nadie cree.

### Dos cosas que el panel no hace, a propósito

**No inventa el mes de lo que no tiene fecha.** Una negociación ganada sin
`closed_at` no entra en la comisión del tramo. El trigger la pone sola, así que
solo puede faltar en filas migradas a mano — y esas se avisan, no se reparten.

**No mezcla comisión realizada con forecast.** Son dos cifras y se muestran
separadas: sumarlas produce un número que no es ni lo que entró ni lo que va a
entrar.

### Los umbrales del seguimiento

Cuándo un lead lleva demasiado sin contactar, cuándo una negociación está
detenida, cuándo un inmueble lleva tanto publicado que el problema es el
precio. Son cuatro números que deciden qué avisa el sistema, y por eso van
donde van todos los supuestos del módulo: en `rei_parameters`, discutibles, y
no dentro de una consulta.

| Llave | Por defecto | Qué decide |
|---|---|---|
| `dias_primer_contacto` | 1 | Cuándo un lead en «nuevo» pasa a ser una alerta |
| `dias_deal_detenido` | 14 | Cuándo una negociación sin movimiento se marca detenida |
| `dias_inmueble_estancado` | 60 | Cuántos días sin una sola visita antes de revisar el precio |
| `dias_aviso_vencimiento` | 60 | Hasta cuándo mira adelante la lista de contratos |

Se cargan con `rei_sembrar_umbrales()`, que es idempotente y no pisa lo
ajustado.

## Qué se abre al entrar

`Inicio` —el panel de la plataforma— está hecho para una empresa que mueve
mercadería: pedidos que salen hoy, stock bajo mínimo, lotes que vencen esta
semana. Es el correcto para quien vende cosas y no le dice nada a una
inmobiliaria: sus siete bloques quedan en cero permanente.

Así que la portada la decide lo contratado, no una constante. Con el módulo
inmobiliario encendido y **sin** Ventas, entrar abre el panel comercial. Con
los dos, manda el operativo: una empresa que además vende mercadería tiene
pedidos que despachar hoy, y eso es más urgente que un forecast.

La regla vive en `Espacio.tsx` y usa `disponible` —contratado **y**
encendido—, que es el mismo criterio con el que se arma el menú: la portada no
puede ser una pantalla que después no aparece en la barra lateral.

## El puente con el resto de la plataforma

Ya existían dos, y este módulo no los toca:

- **`0126`** enlaza compradores y propietarios con `customers`: la persona es
  la misma, y se enlaza sin copiar.
- **`0127`** convierte cada inmueble vendido en un pedido cerrado, con la
  **comisión** como total del pedido y no el precio del inmueble.

El nuevo se suma a esos: un lead apunta a su ficha de cliente
(`rei_leads.customer_id`), a su perfil de demanda (`buyer_id`) y al inmueble
por el que preguntó (`property_id`). Los tres pueden faltar al principio y
llenarse después, que es como ocurre de verdad. **Un CRM que exige una ficha
completa para anotar una llamada es un CRM donde las llamadas no se anotan.**
