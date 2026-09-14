/* Cómo se llaman las cosas donde trabaja el cliente.
   ---------------------------------------------------------------------------
   La plataforma nació en Chile y se le quedaron las palabras pegadas: la ficha
   de cliente pide el RUT y la comuna. A una inmobiliaria de Pamplona eso no le
   dice nada —allá es el NIT y el municipio— y una casilla cuyo nombre no se
   entiende se queda vacía, que es exactamente lo contrario de lo que hace un
   campo obligatorio.

   No es traducción: el idioma es el mismo. Es que la unidad territorial y el
   número tributario tienen nombre propio en cada país, y ese nombre es el que
   la gente escribe en sus documentos.

   Lo que NO hace esto: cambiar la columna. En la base sigue llamándose
   `comuna` y `rut`, porque renombrar columnas de una tabla que ya está en
   producción para ganar una etiqueta habría sido cambiar el motor para pintar
   la carrocería. Aquí se traduce al dibujar, que es donde importa. */

export interface Vocabulario {
  /** El número con que el estado identifica a una empresa o persona. */
  identificador: string;
  /** Un ejemplo real del formato, para el marcador del campo. */
  ejemplo: string;
  /** La unidad territorial menor: la que se escribe en una dirección. */
  division: string;
  /** La mayor: la que agrupa a la anterior. */
  divisionMayor: string;
}

/* El genérico. Se usa cuando el país no está en la lista, y está redactado
   para que se entienda en cualquier parte en vez de acertarle a un país. */
const GENERICO: Vocabulario = {
  identificador: 'Identificación tributaria', ejemplo: '',
  division: 'Ciudad', divisionMayor: 'Región'
};

const POR_PAIS: Record<string, Vocabulario> = {
  CL: { identificador: 'RUT',  ejemplo: '76.123.456-7',   division: 'Comuna',     divisionMayor: 'Región' },
  CO: { identificador: 'NIT',  ejemplo: '900.123.456-7',  division: 'Municipio',  divisionMayor: 'Departamento' },
  MX: { identificador: 'RFC',  ejemplo: 'ABC123456T1A',   division: 'Municipio',  divisionMayor: 'Estado' },
  AR: { identificador: 'CUIT', ejemplo: '30-12345678-9',  division: 'Partido',    divisionMayor: 'Provincia' },
  PE: { identificador: 'RUC',  ejemplo: '20123456789',    division: 'Distrito',   divisionMayor: 'Departamento' },
  UY: { identificador: 'RUT',  ejemplo: '212345670019',   division: 'Localidad',  divisionMayor: 'Departamento' },
  EC: { identificador: 'RUC',  ejemplo: '1790012345001',  division: 'Cantón',     divisionMayor: 'Provincia' },
  BO: { identificador: 'NIT',  ejemplo: '1023456789',     division: 'Municipio',  divisionMayor: 'Departamento' },
  PY: { identificador: 'RUC',  ejemplo: '80012345-6',     division: 'Distrito',   divisionMayor: 'Departamento' },
  CR: { identificador: 'Cédula jurídica', ejemplo: '3-101-123456', division: 'Cantón', divisionMayor: 'Provincia' },
  ES: { identificador: 'NIF',  ejemplo: 'B12345678',      division: 'Municipio',  divisionMayor: 'Provincia' },
  BR: { identificador: 'CNPJ', ejemplo: '12.345.678/0001-95', division: 'Município', divisionMayor: 'Estado' }
};

export function vocabulario(pais?: string | null): Vocabulario {
  return POR_PAIS[(pais ?? '').toUpperCase()] ?? GENERICO;
}

/* Las tres columnas cuyo nombre cambia de país a país. Se resuelve por `key`
   y no esquema por esquema: así una entidad nueva que traiga una de estas
   columnas ya sale bien sin que nadie se acuerde de tocar esto. */
const SEGUN_PAIS: Record<string, keyof Vocabulario> = {
  rut:    'identificador',
  comuna: 'division',
  region: 'divisionMayor'
};

/* Mapea un país a los países que el mapa del panel sabe dibujar. Hoy solo
   Chile tiene sus regiones dibujadas; para el resto el panel muestra la lista
   ordenada, que es la que lleva los números de todas formas. */
export const PAISES_CON_MAPA = new Set(['CL']);
export const hayMapa = (pais?: string | null) =>
  PAISES_CON_MAPA.has((pais ?? '').toUpperCase());

export { SEGUN_PAIS };

/* Un esquema con las etiquetas del país donde trabaja la empresa.
   ---------------------------------------------------------------------------
   Devuelve el MISMO objeto cuando no hay nada que cambiar. Eso no es una
   micro-optimización: `Vista` y las pestañas guardan el esquema en un `useMemo`
   con el esquema por dependencia, y devolver una copia nueva en cada dibujo
   los invalidaría a todos en cada render. */
export function localizarEsquema<T extends { campos: { key: string; label: string }[] }>(
  esquema: T, pais?: string | null
): T {
  const v = vocabulario(pais);
  if (!esquema.campos.some(c => SEGUN_PAIS[c.key] && c.label !== v[SEGUN_PAIS[c.key]!])) {
    return esquema;
  }
  return {
    ...esquema,
    campos: esquema.campos.map(c => {
      const cual = SEGUN_PAIS[c.key];
      return cual ? { ...c, label: v[cual] } : c;
    })
  };
}
