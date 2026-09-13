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
cosas se calculan distinto, y las dos hacen que el resultado sea **más
conservador**, no menos:

**La tasa del periodo.** El instrumento descontaba con `WACC / 4`. La
equivalencia correcta de una tasa efectiva anual a un trimestre es
`(1 + r)^(1/4) − 1`, no `r / 4`. Con un WACC de 16% la diferencia es de casi
medio punto por periodo, y sobre ocho periodos deja de ser un detalle. El VAN
que sale aquí es por eso distinto del de la planilla.

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

**Qué se siembra con valor y qué se siembra vacío.** Los porcentajes de práctica
—WACC objetivo, TIR mínima, margen mínimo, cobertura, reparto de indirectos—
son criterio de industria y se siembran en cualquier jurisdicción. Las cifras
que dependen del país —costo de obra por m², tarifas notariales, renta, ICA— se
siembran **solo si la organización está en Colombia**, que es la jurisdicción de
la que vienen. Para cualquier otro país se crea la fila con su nombre y su
unidad, y el valor queda vacío: sembrar una tarifa colombiana en una empresa
chilena sería peor que no sembrar nada, porque el número se vería correcto y
nadie tendría motivo para revisarlo.

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

## Migraciones

| | Qué trae |
|---|---|
| `0120_real_estate_intelligence_nucleo.sql` | Trece tablas, índices, códigos automáticos y coherencia entre empresas. |
| `0121_real_estate_intelligence_permisos.sql` | RLS, borrado lógico y alta del módulo en Enterprise. |
| `0122_real_estate_intelligence_calculo.sql` | Scoring, prefactibilidad, curva S y avance de etapa. |
| `0123_real_estate_intelligence_panel.sql` | `rei_resumen()`. |
| `0124_real_estate_intelligence_semillas.sql` | `rei_sembrar_base()`. |

Las cinco son aditivas: no tocan ni una tabla existente.

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
