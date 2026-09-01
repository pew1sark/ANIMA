import { supabase } from '@/lib/supabase';
import type { Campo, Detalle, Esquema, Fila, Opcion, TipoCampo } from '@/core/datos/tipos';

/* Acceso genérico a cualquier entidad declarada. Ninguna consulta filtra por
   empresa por gusto: se pasa `company_id` porque la fila lo necesita, pero
   quien decide qué se devuelve es RLS. Si esta capa se equivocara, la base
   seguiría sin entregar lo que no corresponde. */

export const datosService = {
  async listar(e: Esquema, companyId: string): Promise<Fila[]> {
    const orden = e.orden ?? { campo: e.principal, asc: true };
    const { data, error } = await supabase
      .from(e.tabla)
      .select('*')
      .eq('company_id', companyId)
      .order(orden.campo, { ascending: orden.asc, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as Fila[];
  },

  async crear(e: Esquema, companyId: string, valores: Record<string, unknown>,
              campos: Campo[]): Promise<Fila> {
    const { data, error } = await supabase
      .from(e.tabla)
      .insert({ ...sinVacios(separar(campos, valores)), company_id: companyId })
      .select('*')
      .single();
    if (error) throw error;
    return data as Fila;
  },

  async actualizar(e: Esquema, fila: Fila, valores: Record<string, unknown>,
                   campos: Campo[]): Promise<Fila> {
    /* `custom` se manda entero: mezclar en la base exigiría un RPC por entidad,
       y aquí ya tenemos la fila completa a la vista. */
    const parcial = separar(campos, valores, fila);
    const { data, error } = await supabase
      .from(e.tabla).update(parcial).eq('id', fila.id).select('*').single();
    if (error) throw error;
    return data as Fila;
  },

  /* Volver a leer una fila. Se usa después de tocar sus líneas: los totales
     los recalcula un trigger, así que lo que hay en pantalla ya no sirve. */
  async releer(e: Esquema, id: string): Promise<Fila | null> {
    const { data, error } = await supabase.from(e.tabla).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data ?? null) as Fila | null;
  },

  // ------------------------------------------------------------ las líneas

  async lineas(d: Detalle, padreId: string): Promise<Fila[]> {
    const { data, error } = await supabase
      .from(d.tabla).select('*').eq(d.padre, padreId).order('created_at');
    if (error) throw error;
    return (data ?? []) as Fila[];
  },

  async agregarLinea(d: Detalle, companyId: string, padreId: string,
                     valores: Record<string, unknown>): Promise<Fila> {
    const limpio = Object.fromEntries(
      Object.entries(valores).filter(([k, v]) => v != null && !d.campos.find(c => c.key === k)?.soloLectura));
    const { data, error } = await supabase
      .from(d.tabla)
      .insert({ ...limpio, [d.padre]: padreId, company_id: companyId })
      .select('*').single();
    if (error) throw error;
    return data as Fila;
  },

  async borrarLinea(d: Detalle, id: string): Promise<void> {
    const { error } = await supabase.from(d.tabla).delete().eq('id', id);
    if (error) throw error;
  },

  async borrar(e: Esquema, id: string): Promise<void> {
    const { error } = await supabase.from(e.tabla).delete().eq('id', id);
    if (error) throw error;
  },

  /* Las opciones de un campo de relación. Se piden una vez por vista, no una
     vez por fila: con 500 pedidos serían 500 consultas para pintar un nombre. */
  async opcionesDe(campo: Campo, companyId: string): Promise<Opcion[]> {
    if (!campo.relacion) return [];
    const { tabla, etiqueta, filtro } = campo.relacion;
    let q = supabase.from(tabla).select(`id, ${etiqueta}`).eq('company_id', companyId);
    for (const [k, v] of Object.entries(filtro ?? {})) q = q.eq(k, v as never);
    const { data, error } = await q.order(etiqueta);
    if (error) throw error;
    /* La columna de la etiqueta se arma en tiempo de ejecución, así que el
       parser de tipos de supabase-js no puede saber qué vuelve. */
    return ((data ?? []) as unknown as Record<string, unknown>[])
      .map(fila => ({ valor: String(fila.id), nombre: String(fila[etiqueta] ?? '—') }));
  },

  /* Los campos que la propia empresa agregó. Es la parte de Airtable que sí
     tiene sentido aquí: una pescadería necesita "temperatura de recepción" y
     una constructora no, y ninguna de las dos debería esperar a que alguien
     programe una columna. */
  async camposPropios(tabla: string, companyId: string): Promise<Campo[]> {
    const { data, error } = await supabase
      .from('custom_fields')
      .select('key, label, field_type, options, required, help, sort')
      .eq('company_id', companyId)
      .eq('entity', tabla)
      .eq('active', true)
      .order('sort');
    if (error) throw error;

    return (data ?? []).map(f => {
      const c = f as {
        key: string; label: string; field_type: string;
        options: unknown; required: boolean; help: string | null;
      };
      return {
        key: c.key,
        label: c.label,
        tipo: DE_LA_BASE[c.field_type] ?? 'texto',
        opciones: opcionesDeJson(c.options),
        requerido: c.required,
        ayuda: c.help ?? undefined,
        propio: false,
        enTabla: false
      } satisfies Campo;
    });
  }
};

/** `custom_field_type` de PostgreSQL → el tipo que entiende el motor. */
const DE_LA_BASE: Record<string, TipoCampo> = {
  texto: 'texto', numero: 'numero', entero: 'entero', fecha: 'fecha',
  booleano: 'booleano', seleccion: 'seleccion', multiseleccion: 'seleccion',
  moneda: 'moneda'
};

function opcionesDeJson(raw: unknown): Opcion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(o => typeof o === 'string'
    ? { valor: o, nombre: o }
    : { valor: String((o as { valor?: string; value?: string }).valor
                   ?? (o as { value?: string }).value ?? ''),
        nombre: String((o as { nombre?: string; label?: string }).nombre
                    ?? (o as { label?: string }).label ?? '') });
}

/* Reparte los valores del formulario: los propios a sus columnas, los de la
   empresa dentro de `custom`. El trigger `trg_validate_custom` los revisa
   contra `custom_fields` antes de dejarlos entrar.

   Recibe la lista COMPLETA de campos —los del esquema más los que agregó la
   empresa—, no `e.campos`: si no, un campo propio no se reconocería y se
   intentaría escribir como si fuera una columna de la tabla. */
/* Al CREAR, un campo vacío no es "ponlo en null": es "no lo sé, decide tú".
   Mandar null explícito revienta contra las columnas `not null` que tienen
   valor por defecto —`min_stock`, `sale_price`, `discount`— y el mensaje que
   vuelve no le dice nada a quien está llenando el formulario.
   Al ACTUALIZAR es distinto: ahí null sí significa "bórralo". */
function sinVacios(v: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x != null));
}

function separar(campos: Campo[], valores: Record<string, unknown>, fila?: Fila) {
  const salida: Record<string, unknown> = {};
  const custom: Record<string, unknown> = { ...(fila?.custom ?? {}) };
  let tocaCustom = false;

  for (const [k, v] of Object.entries(valores)) {
    const campo = campos.find(c => c.key === k);
    if (campo?.soloLectura) continue;
    if (campo?.propio === false) { custom[k] = v; tocaCustom = true; }
    else salida[k] = v === '' ? null : v;
  }
  if (tocaCustom) salida.custom = custom;
  return salida;
}
