# Real Estate Intelligence

> El módulo hermano de Capital Intelligence. CI responde cuánto capital hace
> falta, de dónde sale y cómo va contra lo prometido. Este responde la pregunta
> de antes: qué se desarrolla, sobre qué predio, con qué demanda detrás y si el
> proyecto se sostiene.

## Por qué un módulo aparte y no más pestañas en `capital`

Capital Intelligence modela un proyecto de inversión: escenarios, matriz
mensual, ronda, cap table. Es agnóstico del rubro a propósito — sirve igual
para una cadena de restaurantes que para una plataforma.

El desarrollo inmobiliario tiene cuatro cosas que ese modelo no tiene y que no
son un detalle del rubro:

1. **Un predio con ficha normativa.** Índice de ocupación, índice de
   construcción y altura máxima deciden cuántos m² se pueden construir. Sin
   eso, la prefactibilidad es una opinión.
2. **Una situación jurídica que condiciona todo.** Matrícula, tradición,
   gravámenes, afectaciones. Un lote con falsa tradición no es un lote más
   barato: es un lote que no se puede desarrollar.
3. **Dos lados de mercado que se cruzan.** Inventario y demanda. La cifra que
   justifica el módulo no es cuánto se vendió: es la brecha por tipología, que
   dice qué hay que salir a captar.
4. **Un vehículo fiduciario con punto de equilibrio.** Los recursos de
   preventa no bajan a la obra hasta alcanzarlo. Es una condición del vehículo,
   no del proyecto.

Meter eso en `ci_projects` habría deformado el módulo genérico para que cupiera
un rubro. Los dos módulos van a la par, con el mismo plan y el mismo nivel de
acceso, y se tocan en **un solo punto**: `rei_developments.ci_project_id`.
Cuando está, el mismo desarrollo tiene allá su modelo financiero, su ronda y su
cap table. Cuando no está, cada módulo se sostiene solo.

## Las cinco capas

```
supuestos → oferta y demanda → oportunidad → desarrollo → modelo
```

| Capa | Tabla | Qué es |
|---|---|---|
| Supuestos | `rei_parameters` | Costo de obra por m², WACC, margen mínimo, tarifas. Ninguna fórmula lleva una constante escrita adentro. |
| Oferta | `rei_properties` | El inventario. De aquí salen los comparables de precio/m², la tasa de cierre y la efectividad por canal. |
| Demanda | `rei_buyers` | Quién busca qué y con cuánto. Cruza con la oferta para dar la brecha. |
| Oportunidad | `rei_opportunities` | Un predio en evaluación, con ficha normativa y situación jurídica. |
| Calificación | `rei_criteria` · `rei_opportunity_scores` | Criterios ponderados, configurables, y la nota de 1 a 5 por cruce. |
| Proceso | `rei_stages` | Las etapas de Terreno a Cierre. Su cantidad decide el % de avance. |
| Vehículo | `rei_vehicles` | SPE, patrimonio autónomo, fiducia de recaudo, con su punto de equilibrio. |
| Desarrollo | `rei_developments` · `rei_milestones` | La oportunidad aprobada, ya con etapa, responsable y fecha. |
| Modelo | `rei_feasibility` · `rei_cashflow_periods` | Los supuestos de prefactibilidad y la curva. |
| Liquidez | `rei_rental_advances` | Adelanto de cánones sobre contratos de arrendamiento. |

## Quién ve qué

| Nivel | Puede |
|---|---|
| 40 | Leer todo el módulo **menos la prefactibilidad**. Escribir inventario y demanda. |
| 60 | Escribir todo. Leer y editar la prefactibilidad. |
| 80 | Borrar un desarrollo, una oportunidad, un vehículo o un supuesto. |

Dos cosas que se apartan del patrón, y por qué:

**La carga comercial baja a 40 para escribir.** Pedir nivel de dirección para
anotar el teléfono de un comprador habría dejado la base madre sin alimentar,
que es la única forma segura de que este módulo no sirva de nada.

**La prefactibilidad pide 60 hasta para LEER.** Es el único lugar del módulo
donde sube el umbral de lectura. Ahí está el margen del proyecto, el costo real
de obra y el punto de equilibrio; quien muestra un inmueble no necesita saber
con cuánto margen se vende el edificio, y si lo supiera lo negociaría.

**No hay `rei_*_members`.** En CI existe `ci_project_members` porque hay un caso
real de alguien que entra a la organización para ver UN proyecto: el
inversionista al que se le abrió una carpeta. Aquí no lo hay — el inventario,
la demanda y los comparables son de la organización entera, y partirlos por
desarrollo dejaría un scoring calculado sobre la mitad de los datos. Cuando un
desarrollo necesita abrirse a un tercero, lo hace por el puente a CI, que abre
ese proyecto y no el CRM de la inmobiliaria.

El Super Admin de plataforma **no entra**, igual que en `capital`: quien
mantiene el software no es dueño de la cartera de su cliente.

## Todo el cálculo vive en PostgreSQL

Igual que en Capital Intelligence, y por la misma razón: el margen de un
proyecto tiene que dar lo mismo en la hoja de prefactibilidad, en el panel y en
el informe que se imprime para el comité.

| Función | Devuelve |
|---|---|
| `rei_parametro(empresa, llave, defecto)` | Un supuesto, con su respaldo. |
| `rei_score(oportunidad)` | Nota ponderada, banda, decisión y **cuánto peso la respalda**. |
| `rei_matriz_scoring(empresa)` | La matriz entera: criterios, notas y alertas. |
| `rei_prefactibilidad(modelo)` | Cifras con fórmula, flujo, TIR/VAN/cobertura y veredicto. |
| `rei_sembrar_curva(modelo)` | Siembra la curva S estándar. No pisa lo cargado. |
| `rei_avance_etapa(desarrollo)` | Posición de la etapa sobre el total de etapas activas. |
| `rei_dias_en_mercado(ingreso, venta, estado)` | Días, o null cuando falta la fecha. |
| `rei_resumen(empresa, filtros)` | El panel. Misma forma que `ci_resumen()`. |
| `rei_sembrar_base(empresa)` | Pone en marcha: supuestos, criterios y etapas. |

Se reutilizan de la 0098 `ci_indicador()`, `ci_insumo()`, `ci_van()` y
`ci_tir()`. Son aritmética sobre `numeric[]` —no saben de proyectos ni de
predios— y volver a escribirlas con otro prefijo habría creado dos TIR que
pueden empezar a diferir.

## Ninguna cifra sin su fórmula

Cada cifra del panel y de la prefactibilidad llega como
`{clave, etiqueta, valor, formato, formula, insumos[]}` y la tarjeta se abre
para mostrarla. Una cifra sin origen se discute a ciegas: quien la mira solo
puede creerla o no. Con la fórmula a la vista, la conversación pasa a ser sobre
el supuesto, que es donde debería estar.

Un valor nulo **no se dibuja como cero**. «No se puede calcular» y «vale cero»
son respuestas distintas, y confundirlas es justo el error que este módulo
existe para no cometer.

## La nota se divide por el peso cubierto, no por 100

Una oportunidad con cinco de siete criterios puestos da su nota sobre esos
cinco, en vez de arrastrar ceros por los dos que nadie ha mirado todavía. A
cambio, `cubierto_pct` dice cuánto peso respalda esa nota y la pantalla lo
muestra: una nota de 4,8 con el 30% del peso no es la misma información que una
de 4,8 completa, y sin decirlo las dos se leen igual.

Las bandas son producto y no configuración —A ≥ 4, B ≥ 3, C ≥ 2, D el resto—
porque una banda existe para hablar rápido, y si cada firma moviera el corte, un
«A» dejaría de significar lo mismo. Lo configurable son los criterios y sus
pesos, que es donde vive el juicio de cada firma.

## Los huecos de dato se cuentan y se avisan, nunca se rellenan

Es la decisión que atraviesa el panel entero. Un inmueble marcado vendido sin
fecha de venta no entra en la curva del mes —porque no se sabe qué mes— y sale
en una alerta que dice cuántos son.

El error que se evita es concreto: una gráfica de evolución con años en cero se
lee como «no hubo actividad» cuando lo que falta es una casilla.

## Dos apartes deliberados del instrumento de origen

El módulo reproduce el modelo de prefactibilidad que la firma ya usaba. Dos
cosas se calculan distinto, y conviene saber hacia dónde mueve cada una el
resultado, porque no es hacia el mismo lado:

**La tasa del periodo.** El instrumento descontaba con `WACC / 4`, que trata el
WACC como tasa nominal: cuatro trimestres al 4% componen 16.99% anual, no 16%.
La equivalencia correcta de una tasa efectiva anual a un trimestre es
`(1 + r)^(1/4) − 1` —3.78% con un WACC de 16%—, así que la planilla descontaba
de más y su VAN salía por debajo. En el piloto de 30 unidades la diferencia son
46 millones sobre nueve periodos: el VAN pasa de 1.070 a 1.117 millones. Es la
cifra correcta, no la conservadora.

**El suelo entra al costo.** El instrumento armaba el costo con obra,
indirectos, financieros y comerciales, y dejaba el lote fuera. Un proyecto que
no paga el suelo tiene un margen que nadie va a ver. `land_cost` en cero
reproduce exactamente aquel modelo, y el panel avisa cuando está en cero: si el
lote se aporta o se permuta vale igual, y ponerle su valor comercial es lo que
hace comparable este proyecto con otro que sí lo compra.

Con el suelo en cero, el módulo da las mismas cifras que el instrumento:
ingresos, costo directo, indirectos, financieros, comerciales, costo total,
utilidad, margen, unidades de equilibrio, TIR anualizada y cobertura.

### Lo que NO es un DSCR

La cifra que el panel llama **cobertura de egresos** es ingresos totales del
flujo ÷ egresos totales del flujo. Es un proxy de bancabilidad y se llama así.
Un DSCR de verdad necesita el calendario de servicio de la deuda, que este
módulo todavía no tiene; ponerle ese nombre a otra cosa sería justo el tipo de
cifra que el módulo existe para no producir.

## Poner en marcha una organización

`rei_sembrar_base(empresa)` carga supuestos, criterios y etapas. Es idempotente:
completa lo que falte y no pisa lo ajustado, así que se puede volver a llamar
sin pensarlo. La pantalla la ofrece desde el Panel cuando detecta que no hay
criterios.

**Qué se siembra con valor y qué se siembra vacío.** Tres condiciones, y la
diferencia entre las dos últimas importa más de lo que parece:

| Qué | Condición | Por qué |
|---|---|---|
| Porcentajes de práctica — WACC, TIR mínima, margen mínimo, cobertura, reparto de indirectos, comisión | **siempre** | Son criterio de industria, no de jurisdicción. |
| Tarifas tributarias y transaccionales — renta, retención, ICA, notariales, delineación, fiduciaria | **país = CO** | Son porcentajes de una jurisdicción: un 35% de renta es 35% se consolide en pesos o en dólares. |
| Costos de obra por m² — VIS y No VIS | **moneda = COP** | Son **montos**, y un monto sin su moneda no significa nada. $2.200.000 por m² es razonable en pesos colombianos y un disparate en dólares. |

Atar las dos últimas al país habría metido cifras en pesos en una firma
colombiana que consolida en dólares —que es un caso real, no hipotético— y el
número se habría visto correcto sin que nadie tuviera motivo para revisarlo.

Cuando la condición no se cumple, la fila se crea con su nombre y su unidad y el
valor queda vacío. No es un hueco: es lo que hace que alguien la llene, y la
prefactibilidad lo dice como alerta **bloqueante** («No hay costo de obra por
m²») en vez de dictaminar sobre un supuesto que no existe.

Todas llevan en `source` de dónde salen. **Ninguna de estas cifras es asesoría
tributaria ni financiera.**

Los siete criterios que se siembran suman 100 y son los del instrumento con el
que la firma venía trabajando. El documento de estrategia propone otro reparto
—con la aptitud normativa (POT) como criterio propio— y eso es exactamente lo
que `rei_criteria` permite: una fila más y un reparto distinto, sin tocar código.
Los campos de ficha normativa de la oportunidad ya están ahí para alimentarlo.

## Adelanto de renta: el aviso que no es opcional

`rei_rental_advances` modela el producto de liquidez sobre contratos de
arrendamiento: el propietario cede los cánones de N meses y recibe hoy su valor
menos el descuento por riesgo y la comisión.

**Solo es legal con recursos propios de la sociedad o de inversionistas por
cuentas en participación.** Captar dinero del público para fondearlo es
captación masiva no autorizada. La tabla no puede impedirlo; `funding_source` es
una lista cerrada con las formas legales, para que la decisión quede escrita y
alguien tenga que elegirla.

El panel marca como **bloqueante** todo adelanto sin póliza ni pagaré: el dinero
se entrega hoy y el canon llega en cuotas, así que sin garantía la vacancia o la
mora del inquilino las cubre entera la sociedad.

Antes de lanzarlo comercialmente hace falta el visto bueno de un abogado sobre
la cesión de derechos económicos, el pagaré con carta de instrucciones y la
póliza. El módulo lo organiza; no lo autoriza.

## Las pantallas

Tres son propias porque el motor de datos no las sabe dibujar —dibuja filas con
ficha, y estas son un panel con filtros, una matriz y una hoja de cálculo—. El
resto del módulo sale del motor como cualquier otra entidad.

| Pestaña | Qué es |
|---|---|
| **Panel** | Comercialización, demanda, canales y pipeline. Las alertas primero. |
| **Calificación** | La matriz oportunidades × criterios. Se califica comparando. |
| **Prefactibilidad** | Supuestos arriba, flujo abajo, y en medio las cifras que salen de los dos. |
| Desarrollos · Oportunidades · Inventario · Demanda · Hitos · Vehículos · Adelanto de renta · Criterios · Etapas · Supuestos | Motor de datos. |

En la prefactibilidad, un modelo **validado** no se edita: se duplica. El modelo
con el que se aprobó un proyecto tiene que seguir diciendo dentro de un año lo
que decía ese día.

## El puente con el CRM de la plataforma

El módulo tiene su propio CRM —`rei_buyers` para la demanda,
`rei_properties.owner_name` para la oferta— y eso es correcto: son fichas de un
negocio inmobiliario, con presupuesto, subsidio y estado del proceso de crédito,
y no caben en la ficha de cliente genérica sin deformar una de las dos.

Pero **la persona es la misma**. Quien registra un apartamento para vender y
quien pregunta por uno para comprar son clientes de la firma. Por eso
`rei_sincronizar_crm()` da de alta a unos y otros en `customers` y deja el
enlace puesto: `rei_buyers.customer_id` y `rei_properties.owner_customer_id`.

**No copia: enlaza, y una sola vez por persona.** Lo que identifica a alguien es
el teléfono, no el nombre. En la base de Casa Click 222 inmuebles tienen 105
propietarios —el mismo dueño lista varias propiedades y escribe su nombre
distinto cada vez— y tres personas aparecen en los dos lados a la vez: venden
para comprar. Deduplicar por nombre habría producido 222 fichas; por teléfono
produce las que hay.

Tres reglas, y las tres importan:

- **Dos teléfonos en una casilla.** Veinte dígitos son dos móviles escritos
  juntos y manda el primero. Los de nueve u once dígitos no se tocan: son
  errores de digitación, y adivinar qué dígito sobra sería inventar un teléfono.
- **Nunca pisa.** Si la ficha ya existe se enlaza y se rellenan solo los campos
  en blanco. Una corrección hecha a mano en el CRM gana siempre.
- **Sin nombre no hay ficha.** «Sin nombre» repetido cuatro veces no es
  información, y si además falta el teléfono no se distingue del siguiente.
  Esas filas se cuentan y se informan en `sin_enlazar`.

Correrla dos veces no crea un cliente de más.

## Una venta cerrada es un pedido

`rei_sincronizar_ventas()` convierte cada inmueble vendido en un pedido del
módulo Ventas, y enlaza los dos por `rei_properties.order_id`.

Hay **una** decisión aquí que decide si las cifras de Ventas significan algo:

> **El total del pedido es la COMISIÓN, no el precio del inmueble.**

La firma intermedia; no compra ni vende por cuenta propia. De una venta de 100
millones recibe su comisión —el supuesto `comision_intermediacion`—, no los 100
millones. Poner el precio del inmueble en `orders.total` haría que «Ventas 30
días», el ticket medio y el panel de Inicio mostraran un dinero que nunca entró
a la empresa, justo en los lugares donde alguien lee cuánto factura.

El precio no se pierde: va en `custom` del pedido, con el código del inmueble,
la tipología, el municipio y el área.

**El cliente es el propietario, no el comprador.** No es una aproximación: la
planilla de origen no tiene columna de comprador, y quien encarga el servicio de
intermediación es el dueño que entrega el inmueble. Inventar una contraparte
para llenar la casilla habría sido fabricar un dato.

**Los vendidos sin fecha de venta quedan fuera.** `orders.order_date` no admite
nulos, y ponerles la fecha de captación —o la de hoy— metería una venta en un
mes en que no ocurrió. El panel ya avisa cuántos son, y se convierten solos en
cuanto alguien complete la fecha y se vuelva a correr la función.

## Dónde está el negocio: el mapa

El panel cierra con el inventario y la demanda sobre el mapa real de Colombia.
Tres capas —inventario, disponibles, demanda— que se alternan; la que se mira
manda el tamaño de la burbuja y al pasar por encima el globo enseña las otras.

**Una burbuja por municipio, no un departamento pintado.** Colombia tiene 1.122
municipios: a la escala del país uno mide menos de un píxel, así que colorearlo
no se vería. Y colorear el departamento respondería otra pregunta — una firma
de Pamplona con todo su inventario en un municipio pintaría Norte de Santander
entero, que es cuarenta veces más grande que su mercado. La burbuja está en el
sitio exacto y su **área** —no su radio— es la cantidad: un círculo del doble de
radio parece cuatro veces más, y sería mentir por cuatro.

**La geometría es real y va embebida.** DANE, Marco Geoestadístico Nacional
2018, vía `@john-guerra/geo-colombia` (MIT). Los 32 departamentos continentales
como polígono, simplificados con Douglas-Peucker a 4 km preservando topología
—0,41% de desvío de superficie contra la cifra oficial—; los 1.122 municipios
como punto, en el centroide que el propio MGN publica. Son 54 KB en el paquete
y ninguna descarga en tiempo de ejecución: el GeoJSON de municipios pesa 2,4 MB
y no cambia nunca.

**Del texto de la ficha al municipio que existe.** El municipio se escribe a
mano, así que `ubicarMunicipio()` normaliza acentos y puntuación, acepta el
nombre de uso —nadie escribe «San José de Cúcuta»— y **desambigua por
departamento**, que no es un lujo: 153 municipios comparten nombre con otro, hay
cuatro «La Unión» y cuatro «Villanueva». Lo que no hace es parecidos: una
distancia de edición pondría un cliente en un municipio en que no está, y un
punto en el mapa es una afirmación sobre dónde opera la empresa. Lo que no se
puede ubicar se cuenta y se dice —un barrio o un corregimiento no son
municipios—, nunca se coloca a ojo.

## Migraciones

| | Qué trae |
|---|---|
| `0120_real_estate_intelligence_nucleo.sql` | Trece tablas, índices, códigos automáticos y coherencia entre empresas. |
| `0121_real_estate_intelligence_permisos.sql` | RLS, borrado lógico y alta del módulo en Enterprise. |
| `0122_real_estate_intelligence_calculo.sql` | Scoring, prefactibilidad, curva S y avance de etapa. |
| `0123_real_estate_intelligence_panel.sql` | `rei_resumen()`. |
| `0124_real_estate_intelligence_semillas.sql` | `rei_sembrar_base()`. |
| `0126_los_compradores_y_los_propietarios_son_clientes.sql` | El puente con el CRM: `rei_sincronizar_crm()`. |
| `0127_una_venta_cerrada_es_un_pedido.sql` | El puente con Ventas: `rei_sincronizar_ventas()`. |
| `0128_el_panel_inmobiliario_dice_donde.sql` | `rei_mapa()`: inventario y demanda por municipio. |

Todas son aditivas y ninguna toca una tabla de fuera del módulo, salvo para
agregarle un índice a `customers` (`0126`). Los pedidos y el producto de
intermediación que crea `0127` los escribe la función cuando se la llama, no la
migración.

## Lo que falta

- **La vitrina** (`npm run vitrina`) sigue cubriendo solo Capital Intelligence.
  Extenderla pide un doble de Supabase para las tablas `rei_*`.
- **DSCR real**, con calendario de servicio de la deuda. Hoy hay un proxy, dicho
  como proxy.
- **Los m² edificables no se derivan todavía** de los índices del POT. Los
  campos están en `rei_opportunities` y alimentan la calificación, pero la
  prefactibilidad sigue pidiendo el área vendible a mano.
- **La conversión de oportunidad a desarrollo** se hace eligiendo la
  oportunidad en la ficha del desarrollo. Un botón que arrastre municipio, área
  y ficha normativa ahorraría el retecleo.
