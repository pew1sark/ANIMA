-- 0117 · Los ejemplos del cuestionario no nombran a nadie.
--
-- La plantilla traía «Asesorías Andrés SAS / AC Capital» y «Andrés
-- (todo) · analista · socio» como ejemplos. Los escribí yo para
-- ilustrar la pregunta, antes de que existiera ninguna firma real.
--
-- Son mal producto por dos razones, y la segunda importa más:
--
--   · la plantilla es de TODAS las organizaciones. El próximo cliente
--     que abra el levantamiento vería el nombre de otro como ejemplo
--     de cómo llamar a su propia firma;
--   · un ejemplo con nombre propio invita a completar el formulario
--     copiando la forma del ejemplo, en vez de describir lo suyo.
--
-- Los ejemplos pasan a ser genéricos y algo más útiles: en vez de un
-- nombre, la forma de la respuesta que se espera.
--
-- El reemplazo va sobre el texto que jsonb guarda de verdad —con
-- espacio después de los dos puntos—, no sobre el que se escribió en
-- 0107. Un primer intento falló justo por eso, y lo detectó la
-- comprobación del final: por eso está.
update public.survey_templates
   set definition = replace(
         replace(definition::text,
           '"example": "Asesorías Andrés SAS / AC Capital"',
           '"example": "Inversiones del Sur SAS · nombre comercial IDS Capital"'),
           '"example": "Andrés (todo) · analista (carga datos) · socio (solo mira)"',
           '"example": "dirección (todo) · analista (carga y actualiza) · socio (solo mira) · inversionista (un proyecto)"'
       )::jsonb
 where slug = 'capital-intelligence';

do $$
declare v_n int;
begin
  select count(*) into v_n from public.survey_templates
   where slug = 'capital-intelligence' and definition::text ilike '%Andrés%';
  if v_n > 0 then raise exception 'la plantilla todavía nombra a alguien'; end if;
end $$;
