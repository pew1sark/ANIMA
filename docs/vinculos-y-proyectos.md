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
| «＋ Cliente nuevo…» | Se escribe el nombre. Si se parece a un vínculo existente, el formulario avisa («¿Es alguno de estos?») y deja usarlo con un toque. Si al guardar el nombre coincide con uno existente, se enlaza a ese y se avisa «ya existía»; solo si es de verdad nuevo se crea el vínculo. |
| Vínculo → **＋ Proyecto** | Abre el formulario con ese cliente ya elegido (para el segundo, tercer proyecto del mismo cliente). |
| Ficha del proyecto → **Ver vínculo ›** | Salta a la ficha del cliente. |
| Ficha del vínculo | Lista sus proyectos y cotizaciones: por id; los proyectos viejos sin id, por nombre. |
| Cotizador | Al guardar, reutiliza un vínculo de nombre parecido en vez de crear otro. |
| Guardar | Un segundo toque mientras se guarda no hace nada: ni un segundo proyecto ni un segundo vínculo. |

## Cuándo dos nombres son «el mismo» (`vinKey`)

Se comparan sin tildes ni mayúsculas, sin signos ni espacios, y sin la forma legal **del final**
(`SpA`, `Ltda`, `Limitada`, `EIRL`, `SA`, `Inc`, `LLC`, con o sin puntos). «Dino Completos SpA»,
«Dino Completos S.A.», «dinocompletos» y «DINO-COMPLETOS» son el mismo cliente. «Spa Luna» **no**
es «Luna» (la forma legal solo cuenta al final), y «Dino Completos Centro» tampoco: se sugiere,
pero no se enlaza solo. Valen las letras de cualquier alfabeto.

Un proyecto viejo sin id se asigna por nombre: si un vínculo se llama **exactamente** como el
proyecto, ese es su dueño; si no, lo reclaman los de nombre equivalente.

## Si un cliente ya quedó duplicado

1. Abre el proyecto que quedó con el duplicado → **✎ Editar** → en **Cliente / Vínculo** elige el original.
   Si dos vínculos se llaman igual, la lista muestra cuántos proyectos tiene cada uno
   («Dinocompletos · 2 proyectos» / «Dinocompletos · 1 proyecto»): el original es el que ya tenía los demás.
2. Cuando el duplicado ya no tenga proyectos, elimínalo desde su ficha en Vínculos.

Sin migración: `projects.client_id` existe desde la migración 0002. Si se borra un vínculo, los
proyectos que lo apuntaban vuelven a enlazarse por nombre.
