import { MUNICIPIOS, NOMBRE_DEPARTAMENTO, type MunicipioColombia }
  from '@/components/mapa/colombia';

/* Del nombre que alguien escribió al municipio que existe.
   ---------------------------------------------------------------------------
   La ficha de un cliente trae el municipio como TEXTO libre, escrito a mano por
   quien la cargó. El mapa necesita un municipio del DANE. En medio están las
   cuatro cosas que pasan siempre en una base real:

     · Acentos, mayúsculas y puntuación a voluntad: «Cacota», «CÁCOTA»,
       «Bogota» contra el oficial «BOGOTÁ, D.C.».
     · El nombre de uso no es el oficial. Nadie escribe «San José de Cúcuta»:
       escriben Cúcuta. Y nadie está equivocado.
     · MUCHOS MUNICIPIOS SE LLAMAN IGUAL. Ciento cincuenta y tres comparten
       nombre con otro: hay cuatro «La Unión», cuatro «Villanueva», tres
       «Bolívar». Sin el departamento, «La Unión» no dice dónde está nadie, y
       elegir el primero de la lista pondría uno de cada cuatro clientes en otro
       punto del país.
     · Lo que se escribió no siempre es un municipio. «Berlín» es un
       corregimiento de Tona; existe como sitio, no como municipio.

   Lo que NO hace: parecidos. Una distancia de edición encontraría que
   «Sardinata» se parece a «Cardinata» y pondría un cliente donde no está. Un
   punto en el mapa es una afirmación sobre dónde opera la empresa, y vale más
   dejarlo sin ubicar —diciendo cuántos son— que ponerlo en el sitio
   equivocado. */

export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    /* La puntuación se vuelve espacio y no desaparece: «BOGOTÁ, D.C.» tiene que
       dar «BOGOTA D C» y no «BOGOTADC». */
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toUpperCase().trim();
}

/* No nombran nada por sí solas y casi todos los nombres compuestos las llevan:
   indexarlas volvería ambigua a media Colombia. Va ANTES de los índices porque
   se usa al construirlos. */
const GENERICAS = new Set(['SANTA', 'SANTO', 'NUEVA', 'NUEVO', 'PUERTO', 'VILLA',
                           'SAN', 'EL', 'LA', 'LOS', 'LAS', 'DE', 'DEL', 'ALTO',
                           'BAJO', 'VALLE', 'CIUDAD']);

/** Municipios por nombre normalizado. Hay nombres con varios. */
const POR_NOMBRE = new Map<string, MunicipioColombia[]>();
/** Por palabra propia de un nombre compuesto: «CUCUTA» → San José de Cúcuta. */
const POR_PALABRA = new Map<string, MunicipioColombia[]>();
/** Nombre de departamento normalizado → su código. */
const DEPARTAMENTO = new Map<string, string>();

for (const [codigo, nombre] of Object.entries(NOMBRE_DEPARTAMENTO)) {
  DEPARTAMENTO.set(normalizar(nombre), codigo);
}

for (const m of MUNICIPIOS) {
  const n = normalizar(m.nombre);
  const ya = POR_NOMBRE.get(n);
  if (ya) ya.push(m); else POR_NOMBRE.set(n, [m]);

  if (n.includes(' ')) {
    for (const p of n.split(' ')) {
      if (p.length < 4 || GENERICAS.has(p)) continue;
      const lista = POR_PALABRA.get(p);
      if (lista) lista.push(m); else POR_PALABRA.set(p, [m]);
    }
  }
}

/* Un nombre que YA es un municipio no puede resolverse hacia otro por coincidir
   con una palabra suya: «Bolívar» es municipio del Cauca y además una palabra de
   «Ciudad Bolívar». Manda el que existe con ese nombre. */
for (const clave of POR_NOMBRE.keys()) POR_PALABRA.delete(clave);

/** Elige dentro de una lista de homónimos usando el departamento, si se sabe. */
function decidir(candidatos: MunicipioColombia[] | undefined,
                 depto: string | undefined): MunicipioColombia | null {
  if (!candidatos || candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0]!;
  if (!depto) return null;                       // homónimos sin forma de elegir
  const enDepto = candidatos.filter(m => m.departamento === depto);
  return enDepto.length === 1 ? enDepto[0]! : null;
}

/**
 * El municipio que corresponde a un nombre escrito a mano, o null.
 *
 * `departamento` es el texto de la ficha —«Norte de Santander»— y solo se usa
 * para desatar homónimos. Un municipio de nombre único se ubica igual sin él.
 */
export function ubicarMunicipio(municipio: string | null | undefined,
                                departamento?: string | null): MunicipioColombia | null {
  const n = normalizar(municipio);
  if (!n) return null;
  const cod = DEPARTAMENTO.get(normalizar(departamento));

  const porNombre = decidir(POR_NOMBRE.get(n), cod);
  if (porNombre) return porNombre;

  /* Solo cuando lo escrito es UNA palabra: «Cúcuta» resuelve; «San José», que
     nombraría a decenas, no. Los compuestos completos ya resolvieron arriba. */
  if (!n.includes(' ')) return decidir(POR_PALABRA.get(n), cod);
  return null;
}
