import { supabase } from '@/lib/supabase';

/* Clientes de una empresa de ANIMA COMPANY.
   Es la tabla `customers` que vino de la arquitectura de Bilagay: no es la
   misma que `clients`, que es la libreta de Vínculos del Taller de STUDIO.
   Dos líneas, dos formas de entender a un cliente:
     · STUDIO  → alguien que te encarga una obra.
     · COMPANY → alguien que compra, con precios, crédito y direcciones.

   Ninguna consulta filtra por company_id: RLS solo devuelve la empresa en la
   que estás. El company_id se manda al escribir porque la fila lo necesita. */

export type TipoCliente =
  'particular' | 'restaurante' | 'hotel' | 'supermercado' | 'mayorista' | 'distribuidor' | 'otro';

export type EstadoCliente = 'activo' | 'inactivo' | 'archivado';

export const TIPOS: { valor: TipoCliente; nombre: string }[] = [
  { valor: 'particular',   nombre: 'Particular' },
  { valor: 'restaurante',  nombre: 'Restaurante' },
  { valor: 'hotel',        nombre: 'Hotel' },
  { valor: 'supermercado', nombre: 'Supermercado' },
  { valor: 'mayorista',    nombre: 'Mayorista' },
  { valor: 'distribuidor', nombre: 'Distribuidor' },
  { valor: 'otro',         nombre: 'Otro' }
];

export interface Cliente {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  company: string | null;
  rut: string | null;
  customer_type: TipoCliente;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  comuna: string | null;
  region: string | null;
  credit_limit: number;
  payment_terms_days: number;
  notes: string | null;
  status: EstadoCliente;
  created_at: string;
}

/** Lo que se puede escribir desde el formulario. El resto lo pone la base. */
export type ClienteEditable = Pick<Cliente,
  'name' | 'company' | 'rut' | 'customer_type' | 'contact_name' | 'phone' |
  'whatsapp' | 'email' | 'address' | 'comuna' | 'region' | 'credit_limit' |
  'payment_terms_days' | 'notes' | 'status'>;

export const CLIENTE_VACIO: ClienteEditable = {
  name: '', company: null, rut: null, customer_type: 'particular',
  contact_name: null, phone: null, whatsapp: null, email: null,
  address: null, comuna: null, region: null,
  credit_limit: 0, payment_terms_days: 0, notes: null, status: 'activo'
};

const CAMPOS = `id, company_id, code, name, company, rut, customer_type, contact_name,
                phone, whatsapp, email, address, comuna, region, credit_limit,
                payment_terms_days, notes, status, created_at`;

export const clientesService = {
  async listar(companyId: string): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('customers')
      .select(CAMPOS)
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as Cliente[];
  },

  async crear(companyId: string, c: ClienteEditable): Promise<Cliente> {
    const { data, error } = await supabase
      .from('customers')
      .insert({ ...limpiar(c), company_id: companyId })
      .select(CAMPOS)
      .single();
    if (error) throw error;
    return data as Cliente;
  },

  async actualizar(id: string, c: ClienteEditable): Promise<Cliente> {
    const { data, error } = await supabase
      .from('customers')
      .update({ ...limpiar(c), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(CAMPOS)
      .single();
    if (error) throw error;
    return data as Cliente;
  }
};

/* Un campo de texto vacío es "no lo sé", no "". Guardar cadenas vacías ensucia
   los informes y hace que `is null` deje de servir para buscar los que faltan. */
function limpiar(c: ClienteEditable): ClienteEditable {
  const vacio = (v: string | null) => { const s = (v ?? '').trim(); return s === '' ? null : s; };
  return {
    ...c,
    name: c.name.trim(),
    company: vacio(c.company), rut: vacio(c.rut), contact_name: vacio(c.contact_name),
    phone: vacio(c.phone), whatsapp: vacio(c.whatsapp), email: vacio(c.email),
    address: vacio(c.address), comuna: vacio(c.comuna), region: vacio(c.region),
    notes: vacio(c.notes),
    credit_limit: Number(c.credit_limit) || 0,
    payment_terms_days: Number(c.payment_terms_days) || 0
  };
}
