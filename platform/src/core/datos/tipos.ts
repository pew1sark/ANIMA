/* El motor de datos de ANIMA COMPANY.
   ---------------------------------------------------------------------------
   La idea que se toma prestada de Airtable: en vez de escribir una pantalla
   por entidad, se DECLARA la entidad y la pantalla se dibuja sola. Una tabla,
   un tablero, un buscador y una ficha, todo derivado del mismo esquema.

   Eso cambia el costo de agregar un módulo: de un archivo de 300 líneas a
   veinte líneas de declaración. Y hace que todo se comporte igual, que es lo
   que separa una aplicación de una colección de pantallas.

   La autoridad sobre los datos sigue siendo PostgreSQL: cada consulta pasa por
   RLS y cada escritura por los triggers que ya existían. Esto solo dibuja. */

export type TipoCampo =
  | 'texto' | 'texto-largo'
  | 'numero' | 'entero' | 'moneda'
  | 'fecha' | 'booleano'
  | 'seleccion' | 'relacion';

export interface Opcion {
  valor: string;
  nombre: string;
  /** Clase de color para el distintivo. Se usa en tabla y tablero. */
  tono?: 'neutro' | 'acento' | 'ok' | 'aviso' | 'malo';
}

export interface Campo {
  key: string;
  label: string;
  tipo: TipoCampo;
  opciones?: Opcion[];
  /** De dónde salen las opciones cuando el campo es una relación. */
  relacion?: { tabla: string; etiqueta: string; filtro?: Record<string, unknown> };
  requerido?: boolean;
  ayuda?: string;
  /** Aparece como columna en la tabla. Si no, solo en la ficha. */
  enTabla?: boolean;
  /** Se puede cambiar sin abrir la ficha, desde la propia celda. */
  enLinea?: boolean;
  /** Lo escribe la base (códigos, totales calculados): se muestra, no se toca. */
  soloLectura?: boolean;
  /** false = el valor vive dentro de la columna `custom` (campos propios). */
  propio?: boolean;
  ancho?: string;
  /** Valor con el que nace una fila nueva. */
  porDefecto?: unknown;
}

/* Las líneas de un documento: los productos de un pedido, los ítems de una
   compra. Viven en su propia tabla, cuelgan del padre por una columna, y al
   escribirlas los triggers de la base recalculan los totales del padre.
   Por eso, después de tocar una línea, hay que volver a leer el padre. */
export interface Detalle {
  tabla: string;
  /** Columna de la línea que apunta al padre. */
  padre: string;
  titulo: string;
  singular: string;
  campos: Campo[];
  /** Columna con el total de la línea. La calcula la base. */
  total?: string;
}

export interface Esquema {
  /** Tabla real en PostgreSQL. Es también la `entity` de `custom_fields`:
   *  el trigger `trg_validate_custom` valida usando `tg_table_name`, así que
   *  cualquier otro nombre haría que los campos propios no se validaran nunca
   *  y que los ya existentes no aparecieran. Una sola verdad. */
  tabla: string;
  titulo: string;
  singular: string;
  /** Campo de texto que identifica la fila: se busca y se ordena por él. */
  principal: string;
  campos: Campo[];
  /** Si está, se habilita la vista de tablero agrupando por este campo. */
  tablero?: string;
  /** Orden por defecto de la consulta. */
  orden?: { campo: string; asc: boolean };
  /** Nivel de rol necesario para escribir. Leer lo decide RLS. */
  nivelEscritura?: number;
  /** Texto que se muestra cuando todavía no hay ninguna fila. */
  vacio?: string;
  /** Las líneas que cuelgan de cada fila, si las tiene. */
  detalle?: Detalle;
}

export type Fila = Record<string, unknown> & { id: string; custom?: Record<string, unknown> };

/** Los campos que de verdad se muestran: los declarados más los propios. */
export const camposVisibles = (e: Esquema) => e.campos.filter(c => c.enTabla);

/** Lee un valor tanto si vive en su columna como dentro de `custom`. */
export function valor(fila: Fila, campo: Campo): unknown {
  if (campo.propio === false) return (fila.custom ?? {})[campo.key];
  return fila[campo.key];
}
