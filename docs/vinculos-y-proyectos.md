# Vínculos y proyectos (STUDIO → Taller)

Cómo se enlaza un proyecto con su cliente, y cómo evitar que un mismo cliente quede
duplicado en Vínculos.

## El enlace

Un proyecto guarda **el nombre** del cliente (`projects.client`) y, desde ahora, **su id**
(`projects.client_id`, columna que ya existía). El id es lo que manda: renombrar un vínculo
o escribir su nombre un poco distinto ya no desarma el enlace.

| Dónde | Qué hace |
|---|---|
| Formulario de proyecto (crear y editar) | **Cliente / Vínculo**: una lista con los vínculos que ya existen (A–Z), «Sin cliente» y «＋ Cliente nuevo…». Elegir uno enlaza por id y no crea nada. |
| «＋ Cliente nuevo…» | Se escribe el nombre. Si se parece a un vínculo existente, el formulario avisa («¿Es alguno de estos?») y deja usarlo con un toque. Si al guardar el nombre es **equivalente** a uno existente (ver abajo), se enlaza a ese y se avisa «ya existía»; solo si es de verdad nuevo se crea el vínculo, y recién después de validar el formulario. |
| Vínculo → **＋ Proyecto** | Abre el formulario con ese cliente ya elegido (para el segundo, tercer proyecto del mismo cliente). |
| Ficha del proyecto → **Ver vínculo ›** | Salta a la ficha del cliente. |
| Ficha del vínculo | Lista sus proyectos y cotizaciones: por id; los proyectos viejos sin id, por nombre. |
| Cotizador | Al guardar, respeta el vínculo con el que viene la cotización (p. ej. desde una solicitud); si no, reutiliza el de nombre equivalente en vez de crear otro, y deja el nombre como el del vínculo. |
| Guardar (proyectos y cotizaciones) | Un segundo toque mientras se guarda no hace nada: ni un segundo proyecto ni un segundo vínculo. |

## Cuándo dos nombres son «el mismo» (`vinKey`)

Se comparan sin tildes ni mayúsculas, sin signos ni espacios, y sin la forma legal **del final**
cuando está escrita como tal: `SpA` / `S.A.` (en mayúsculas), `Ltda`, `Limitada`, `EIRL`, `Inc`, `LLC`.
«Café Aurora SpA», «Cafe Aurora S.A.», «cafe aurora» y «CAFÉ-AURORA» son el mismo cliente.
«Aurora Spa» (un spa) **no** es «Aurora SpA», y «Café Aurora Centro» tampoco: se sugiere, pero no
se enlaza solo. Valen las letras de cualquier alfabeto, y los dígitos separados no se pegan
(«Local 1 2» no es «Local 12»; «1.5» no es «15»).

Un proyecto viejo sin id se asigna por nombre: si un vínculo se llama **exactamente** como el
proyecto, ese es su dueño; si ninguno se llama exactamente así, lo reclaman todos los de nombre
equivalente (aparece en cada uno hasta que se vuelva a guardar con un cliente elegido).

## Si un cliente ya quedó duplicado

1. Abre el proyecto que quedó con el duplicado → **✎ Editar** → en **Cliente / Vínculo** elige el original.
   Si dos vínculos se llaman igual o casi, la lista agrega cuántos proyectos tiene cada uno y cuándo se
   creó («Café Aurora · 2 proyectos · creado 3 mar» / «Café Aurora · 1 proyecto · creado 12 oct»): el
   original es el más antiguo. Ojo: los proyectos viejos sin id se cuentan en **todos** los vínculos de
   nombre equivalente, así que el recuento solo no basta; la fecha de creación sí.
2. Guardar asigna el id al proyecto. Cuando el duplicado ya no tenga proyectos, elimínalo desde su ficha
   en Vínculos.

Sin migración: `projects.client_id` existe desde la migración 0002. Si se borra un vínculo, los
proyectos que lo apuntaban vuelven a enlazarse por nombre.
