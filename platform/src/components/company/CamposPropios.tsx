import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

/* Los campos que la empresa agrega por su cuenta. Es la idea de Airtable, con
   el límite que corresponde: no se inventan tablas, se amplían las que ya hay.

   El valor vive en la columna `custom` de cada fila, y el trigger
   `trg_validate_custom` comprueba contra esta lista antes de dejarlo entrar.
   Así un campo mal escrito no ensucia los datos.

   `entity` es el NOMBRE DE LA TABLA, porque el trigger valida con
   `tg_table_name`. Con cualquier otro nombre el campo se vería en pantalla y
   la base no lo validaría nunca. */

const ENTIDADES = [
  { valor: 'customers', nombre: 'Clientes' },
  { valor: 'products',  nombre: 'Productos' },
  { valor: 'orders',    nombre: 'Pedidos' },
  { valor: 'suppliers', nombre: 'Proveedores' }
] as const;

const TIPOS = [
  { valor: 'texto',    nombre: 'Texto' },
  { valor: 'numero',   nombre: 'Número' },
  { valor: 'entero',   nombre: 'Número entero' },
  { valor: 'moneda',   nombre: 'Dinero' },
  { valor: 'fecha',    nombre: 'Fecha' },
  { valor: 'booleano', nombre: 'Sí / No' },
  { valor: 'seleccion',nombre: 'Lista de opciones' }
] as const;

interface CampoPropio {
  id: string; entity: string; key: string; label: string;
  field_type: string; options: unknown; required: boolean; sort: number;
}

export function CamposPropios({ companyId }: { companyId: string }) {
  const [lista, setLista] = useState<CampoPropio[]>([]);
  const [entidad, setEntidad] = useState<string>('customers');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const recargar = () => {
    setCargando(true);
    supabase.from('custom_fields')
      .select('id, entity, key, label, field_type, options, required, sort')
      .eq('company_id', companyId).eq('active', true).order('entity').order('sort')
      .then(({ data, error: e }) => {
        if (e) setError(e.message); else setLista((data ?? []) as CampoPropio[]);
        setCargando(false);
      });
  };
  useEffect(recargar, [companyId]);

  const deLaEntidad = lista.filter(c => c.entity === entidad);

  /* No se borra: se apaga. Si hubiera filas con ese dato guardado, borrar la
     definición dejaría un valor huérfano que nadie sabe leer. */
  async function apagar(id: string) {
    const { error: e } = await supabase.from('custom_fields').update({ active: false }).eq('id', id);
    if (e) setError(e.message); else recargar();
  }

  return (
    <section className="grid gap-3 aparece aparece-3">
      <div>
        <h2 className="text-[10px] uppercase tracking-wider font-extrabold text-muted">Campos propios</h2>
        <p className="text-[13px] text-muted mt-1.5 max-w-[62ch]">
          Agrega a tus fichas los datos que tu operación necesita y ANIMA no trae de fábrica.
          Aparecen solos en el formulario y en la búsqueda, sin que nadie programe nada.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 grid gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {ENTIDADES.map(e => (
            <button key={e.valor} onClick={() => { setEntidad(e.valor); setNuevo(false); }}
              className={`text-[12.5px] font-bold px-3 py-1.5 rounded-full transition ${
                entidad === e.valor ? 'bg-ink text-bg' : 'border border-line text-muted hover:border-faint'}`}>
              {e.nombre}
            </button>
          ))}
          <button onClick={() => setNuevo(v => !v)}
            className="ml-auto text-[12.5px] font-bold px-3.5 py-1.5 rounded-full border border-line
                       hover:border-accent transition">
            {nuevo ? 'Cancelar' : 'Agregar campo'}
          </button>
        </div>

        {error && (
          <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                     rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        {nuevo && (
          <Formulario companyId={companyId} entidad={entidad}
                      listo={() => { setNuevo(false); recargar(); }}
                      fallo={setError} />
        )}

        {cargando && <p className="text-[13px] text-muted">Cargando…</p>}

        {!cargando && deLaEntidad.length === 0 && !nuevo && (
          <p className="text-[13px] text-muted">
            Ningún campo propio en {ENTIDADES.find(e => e.valor === entidad)?.nombre.toLowerCase()} todavía.
          </p>
        )}

        <div className="grid gap-2">
          {deLaEntidad.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-line bg-sunk">
              <span className="min-w-0">
                <b className="block text-[13.5px] font-bold truncate">{c.label}</b>
                <span className="text-[11.5px] text-faint">
                  <code>{c.key}</code> · {TIPOS.find(t => t.valor === c.field_type)?.nombre ?? c.field_type}
                  {c.required && ' · obligatorio'}
                </span>
              </span>
              <button onClick={() => apagar(c.id)}
                className="ml-auto text-[12px] font-bold text-muted hover:text-danger transition">
                Quitar
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Formulario({ companyId, entidad, listo, fallo }: {
  companyId: string; entidad: string; listo: () => void; fallo: (m: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [tipo, setTipo] = useState<string>('texto');
  const [opciones, setOpciones] = useState('');
  const [requerido, setRequerido] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const { error } = await supabase.from('custom_fields').insert({
      company_id: companyId,
      entity: entidad,
      key: clave(label),
      label: label.trim(),
      field_type: tipo,
      options: tipo === 'seleccion'
        ? opciones.split(',').map(o => o.trim()).filter(Boolean)
        : [],
      required: requerido,
      sort: 99,
      active: true,
      source: 'company'
    });
    if (error) { fallo(error.message); setGuardando(false); return; }
    listo();
  }

  const campo = `w-full px-3 py-2 rounded-lg border border-line bg-surface text-[13.5px]
                 outline-none focus:border-accent transition`;

  return (
    <form onSubmit={guardar} className="rounded-xl border border-line bg-sunk p-4 grid gap-3 entra">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">
            Nombre del campo
          </span>
          <input required autoFocus value={label} onChange={e => setLabel(e.target.value)}
                 placeholder="Ej: Temperatura de recepción" className={campo} />
          {label && <span className="block text-[11px] text-faint mt-1">Se guardará como <code>{clave(label)}</code></span>}
        </label>
        <label>
          <span className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">Tipo</span>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={campo}>
            {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
          </select>
        </label>
      </div>

      {tipo === 'seleccion' && (
        <label>
          <span className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">
            Opciones <span className="normal-case tracking-normal text-faint">· separadas por coma</span>
          </span>
          <input value={opciones} onChange={e => setOpciones(e.target.value)}
                 placeholder="Mate, Satinado, Brillante" className={campo} />
        </label>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-[13px] text-muted cursor-pointer">
          <input type="checkbox" checked={requerido} onChange={e => setRequerido(e.target.checked)}
                 className="w-4 h-4 accent-[var(--color-accent)]" />
          Obligatorio
        </label>
        <button type="submit" disabled={guardando || !label.trim()}
          className="ml-auto text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg
                     disabled:opacity-45 hover:opacity-90 transition">
          {guardando ? 'Creando…' : 'Crear campo'}
        </button>
      </div>
    </form>
  );
}

/* El nombre visible es de la persona; la clave con la que se guarda tiene que
   ser estable y sin acentos, porque va dentro de un JSON y se busca por ella. */
function clave(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'campo';
}
