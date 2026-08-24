# Semillas de datos

## `survey_comercializadora_alimentos.json`

El cuestionario de levantamiento para comercializadoras de alimentos: 7 secciones,
18 bloques, **107 preguntas**. Nació del levantamiento de Pescadería Bilagay.

En JLIZ este cuestionario vivía en `src/lib/survey.ts` — 932 líneas de código generado
desde un Excel. Eso obligaba a **programar y desplegar** por cada rubro nuevo.

Aquí es **dato**: se carga en `survey_templates.definition`. Un rubro nuevo es una fila,
no un despliegue.

Para cargarlo o actualizarlo:

```sql
update public.survey_templates
   set definition = '<contenido del json>'::jsonb, version = version + 1
 where slug = 'comercializadora-alimentos';
```

Las **reglas** (`survey_templates.rules`) son lo que convierte el cuestionario en
instalador: dicen qué módulo encender o qué ajuste escribir según cada respuesta.
Se aplican con `select * from public.survey_apply('<session_id>')`.
