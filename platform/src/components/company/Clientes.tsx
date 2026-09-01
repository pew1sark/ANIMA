import { useEffect, useMemo, useState } from 'react';
import {
  clientesService, TIPOS, CLIENTE_VACIO,
  type Cliente, type ClienteEditable, type TipoCliente, type EstadoCliente
} from '@/services/clientes.service';

const money = (n = 0) => '$' + Math.round(n).toLocaleString('es-CL');
const nombreTipo = (t: TipoCliente) => TIPOS.find(x => x.valor === t)?.nombre ?? t;

/* Clientes — el primer módulo de ANIMA COMPANY construido sobre la
   arquitectura que venía de Bilagay. De aquí cuelga casi todo lo demás:
   los pedidos, los precios especiales, las entregas y la cobranza. Por eso
   es el que se hace primero. */
export function Clientes({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [todos, setTodos] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Cliente | 'nuevo' | null>(null);

  const recargar = () => {
    setCargando(true);
    clientesService.listar(companyId)
      .then(setTodos)
      .catch(e => setError(e.message ?? 'No se pudieron cargar los clientes'))
      .finally(() => setCargando(false));
  };
  useEffect(recargar, [companyId]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos
      .filter(c => verInactivos || c.status === 'activo')
      .filter(c => !q || [c.name, c.company, c.rut, c.comuna, c.email, c.phone]
        .some(v => (v ?? '').toLowerCase().includes(q)));
  }, [todos, busca, verInactivos]);

  const activos = todos.filter(c => c.status === 'activo').length;

  return (
    <div className="grid gap-5 aparece">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Clientes</h1>
          <p className="text-[13px] text-muted mt-1">
            {activos} activo{activos === 1 ? '' : 's'}
            {todos.length !== activos && ` · ${todos.length - activos} fuera de circulación`}
          </p>
        </div>
        {puedeEditar && (
          <button onClick={() => setEditando('nuevo')}
            className="ml-auto text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition">
            Nuevo cliente
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nombre, RUT, comuna, correo…"
          className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl border border-line bg-surface
                     text-sm outline-none focus:border-accent" />
        <label className="flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-accent,#b98b3e)]" />
          Ver inactivos
        </label>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}
      {cargando && <p className="text-[13px] text-muted">Cargando clientes…</p>}

      {!cargando && lista.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-[14px] font-bold">
            {todos.length === 0 ? 'Todavía no hay clientes' : 'Ningún cliente calza con la búsqueda'}
          </p>
          <p className="text-[13px] text-muted mt-1 max-w-[54ch] mx-auto">
            {todos.length === 0
              ? 'Los clientes son la base de los pedidos, los precios y la cobranza. Conviene empezar por aquí.'
              : 'Prueba con otro nombre, o marca «ver inactivos».'}
          </p>
        </div>
      )}

      {!cargando && lista.length > 0 && (
        <div className="grid gap-2">
          {lista.map(c => (
            <button key={c.id} onClick={() => puedeEditar && setEditando(c)}
              disabled={!puedeEditar}
              className="text-left p-4 rounded-2xl border border-line bg-surface toque group
                         enabled:hover:border-accent disabled:cursor-default">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="w-10 h-10 rounded-xl grid place-items-center bg-accent/12 text-accent-deep
                                 font-extrabold text-[14px] shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <b className="block text-[14.5px] font-extrabold tracking-tight truncate">{c.name}</b>
                  <span className="block text-[12px] text-muted truncate">
                    {nombreTipo(c.customer_type)}
                    {c.rut && ` · ${c.rut}`}
                    {c.comuna && ` · ${c.comuna}`}
                  </span>
                </span>
                <span className="ml-auto text-right hidden sm:block">
                  {c.credit_limit > 0 && (
                    <span className="block text-[12.5px] tabular-nums text-muted">
                      crédito {money(c.credit_limit)}
                    </span>
                  )}
                  {c.payment_terms_days > 0 && (
                    <span className="block text-[11.5px] text-faint">{c.payment_terms_days} días</span>
                  )}
                </span>
                {c.status !== 'activo' && (
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5
                                   rounded-full bg-sunk text-faint">{c.status}</span>
                )}
                {puedeEditar && <span className="text-faint group-hover:text-accent transition">→</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editando && (
        <Formulario
          companyId={companyId}
          cliente={editando === 'nuevo' ? null : editando}
          cerrar={() => setEditando(null)}
          guardado={() => { setEditando(null); recargar(); }}
        />
      )}
    </div>
  );
}

const inputCls = `w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface
                  text-sm outline-none focus:border-accent`;

function Formulario({ companyId, cliente, cerrar, guardado }: {
  companyId: string; cliente: Cliente | null; cerrar: () => void; guardado: () => void;
}) {
  const [f, setF] = useState<ClienteEditable>(() => cliente
    ? {
        name: cliente.name, company: cliente.company, rut: cliente.rut,
        customer_type: cliente.customer_type, contact_name: cliente.contact_name,
        phone: cliente.phone, whatsapp: cliente.whatsapp, email: cliente.email,
        address: cliente.address, comuna: cliente.comuna, region: cliente.region,
        credit_limit: cliente.credit_limit, payment_terms_days: cliente.payment_terms_days,
        notes: cliente.notes, status: cliente.status
      }
    : { ...CLIENTE_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ClienteEditable>(k: K, v: ClienteEditable[K]) =>
    setF(prev => ({ ...prev, [k]: v }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true); setError(null);
    try {
      if (cliente) await clientesService.actualizar(cliente.id, f);
      else await clientesService.crear(companyId, f);
      guardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-ink/25 backdrop-blur-sm"
         onClick={cerrar}>
      <form onClick={e => e.stopPropagation()} onSubmit={guardar}
        className="w-full max-w-xl max-h-[88vh] overflow-y-auto bg-surface border border-line
                   rounded-3xl p-6 shadow-[0_24px_60px_rgba(0,0,0,.14)] grid gap-4">
        <div className="flex items-start gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">
              {cliente ? cliente.name : 'Nuevo cliente'}
            </h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              {cliente ? 'Editar ficha' : 'Solo el nombre es obligatorio; el resto se completa cuando se sepa.'}
            </p>
          </div>
          <button type="button" onClick={cerrar}
            className="ml-auto text-[13px] text-muted hover:text-ink transition">Cerrar</button>
        </div>

        <Campo label="Nombre">
          <input value={f.name} onChange={e => set('name', e.target.value)} required autoFocus
                 className={inputCls} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Razón social">
            <input value={f.company ?? ''} onChange={e => set('company', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="RUT">
            <input value={f.rut ?? ''} onChange={e => set('rut', e.target.value)}
                   placeholder="12.345.678-9" className={inputCls} />
          </Campo>
          <Campo label="Tipo">
            <select value={f.customer_type} onChange={e => set('customer_type', e.target.value as TipoCliente)}
                    className={inputCls}>
              {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Estado">
            <select value={f.status} onChange={e => set('status', e.target.value as EstadoCliente)}
                    className={inputCls}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="archivado">Archivado</option>
            </select>
          </Campo>
          <Campo label="Contacto">
            <input value={f.contact_name ?? ''} onChange={e => set('contact_name', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Correo">
            <input type="email" value={f.email ?? ''} onChange={e => set('email', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Teléfono">
            <input value={f.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="WhatsApp">
            <input value={f.whatsapp ?? ''} onChange={e => set('whatsapp', e.target.value)} className={inputCls} />
          </Campo>
        </div>

        <Campo label="Dirección">
          <input value={f.address ?? ''} onChange={e => set('address', e.target.value)} className={inputCls} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Comuna">
            <input value={f.comuna ?? ''} onChange={e => set('comuna', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Región">
            <input value={f.region ?? ''} onChange={e => set('region', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Límite de crédito" nota="0 = sin crédito">
            <input inputMode="numeric" value={String(f.credit_limit)}
                   onChange={e => set('credit_limit', Number(e.target.value.replace(/\D/g, '')) || 0)}
                   className={inputCls} />
          </Campo>
          <Campo label="Días de pago" nota="0 = contado">
            <input inputMode="numeric" value={String(f.payment_terms_days)}
                   onChange={e => set('payment_terms_days', Number(e.target.value.replace(/\D/g, '')) || 0)}
                   className={inputCls} />
          </Campo>
        </div>

        <Campo label="Notas">
          <textarea value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3}
                    className={inputCls + ' resize-y'} />
        </Campo>

        {error && (
          <p role="alert" className="text-[13px] text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button type="button" onClick={cerrar}
            className="text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="text-[13px] font-bold px-5 py-2 rounded-full bg-ink text-bg disabled:opacity-45 hover:opacity-90 transition">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

const Campo = ({ label, nota, children }:
  { label: string; nota?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">
      {label}{nota && <span className="ml-1.5 normal-case tracking-normal text-faint font-bold">· {nota}</span>}
    </span>
    {children}
  </label>
);
