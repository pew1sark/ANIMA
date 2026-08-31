import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca } from '@/components/Marca';
import {
  consolaService, pagado,
  type ClienteCartera, type Cobro, type Concepto, type PlanDisponible
} from '@/services/consola.service';

const money = (n = 0) => '$' + Math.round(n).toLocaleString('es-CL');
const fecha = (s?: string | null) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* La consola de plataforma. Aquí SARK no es dueño de nada: administra el
   software que otros usan. Por eso no hay ni un dato de la operación del
   cliente — RLS tampoco se lo daría. Solo la relación comercial. */
export function Consola({ volver }: { volver: () => void }) {
  const { user, signOut } = useAuth();
  const [cartera, setCartera] = useState<ClienteCartera[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<ClienteCartera | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState(false);

  const recargar = () => {
    setCargando(true);
    consolaService.cartera()
      .then(setCartera)
      .catch(e => setError(e.message ?? 'No se pudo cargar la cartera'))
      .finally(() => setCargando(false));
  };
  useEffect(recargar, []);

  const totales = cartera.reduce((a, c) => ({
    mrr:    a.mrr + (c.suscripcion === 'activa' ? (c.mensualidad ?? 0) : 0),
    saldo:  a.saldo + Number(c.saldo ?? 0),
    vencidos: a.vencidos + Number(c.vencidos ?? 0)
  }), { mrr: 0, saldo: 0, vencidos: 0 });

  return (
    <div className="min-h-full">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20">
        <Marca sub="Consola" />
        <button onClick={volver} className="text-[13px] text-muted hover:text-ink transition ml-3">
          ← Mis organizaciones
        </button>
        <span className="ml-auto text-[13px] text-muted hidden sm:block">{user?.email}</span>
        <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-accent/15 text-accent-deep">
          Super Admin
        </span>
        <button onClick={signOut}
          className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
      </header>

      <main className="p-6 max-w-4xl grid gap-8">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-tight">Clientes</h1>
            <p className="text-[13px] text-muted mt-1 max-w-[62ch]">
              El negocio del software: quién usa la plataforma, con qué plan y qué debe.
              La operación de cada cliente es suya — desde aquí no se ve, y la base tampoco la entrega.
            </p>
          </div>
          <button onClick={() => setNuevoCliente(true)}
            className="ml-auto text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition">
            Nuevo cliente
          </button>
        </div>

        {error && <p className="text-[13px] text-danger">{error}</p>}
        {cargando && <p className="text-[13px] text-muted">Cargando la cartera…</p>}

        {!cargando && (
          <>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Kpi l="Ingreso mensual" v={money(totales.mrr)} nota="suscripciones activas" />
              <Kpi l="Por cobrar" v={money(totales.saldo)}
                   alerta={totales.vencidos > 0 ? `${totales.vencidos} cobro(s) vencido(s)` : undefined} />
              <Kpi l="Clientes" v={String(cartera.length)} />
            </div>

            <div className="grid gap-2">
              {cartera.map(c => (
                <button key={c.company_id} onClick={() => setAbierto(c)}
                  className="text-left p-4 rounded-2xl border border-line bg-surface hover:border-accent transition group">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-10 h-10 rounded-xl grid place-items-center bg-accent/12 text-accent-deep
                                     font-extrabold text-[15px] shrink-0">
                      {c.empresa.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <b className="block text-[15px] font-extrabold tracking-tight truncate">{c.empresa}</b>
                      <span className="text-[12px] text-muted">
                        {c.linea ?? 'sin línea'} · {c.plan ?? 'sin plan'}
                        {c.suscripcion && c.suscripcion !== 'activa' && ` · ${c.suscripcion}`}
                      </span>
                    </span>
                    <span className="ml-auto text-right">
                      <span className="block text-[15px] font-extrabold tabular-nums">{money(c.mensualidad ?? 0)}</span>
                      <span className="text-[11px] text-faint">al mes</span>
                    </span>
                    {Number(c.saldo) > 0 && (
                      <span className={`text-[11.5px] font-bold tabular-nums px-2.5 py-1 rounded-full
                        ${Number(c.vencidos) > 0 ? 'bg-danger/12 text-danger' : 'bg-sunk text-muted'}`}>
                        debe {money(Number(c.saldo))}
                      </span>
                    )}
                    <span className="text-faint group-hover:text-accent transition">→</span>
                  </div>
                </button>
              ))}
              {cartera.length === 0 && (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                  <p className="text-[14px] font-bold">Todavía no hay clientes</p>
                  <p className="text-[13px] text-muted mt-1">El primero se da de alta con el botón de arriba.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {abierto && <FichaCliente cliente={abierto} cerrar={() => { setAbierto(null); recargar(); }} />}
      {nuevoCliente && <FormNuevoCliente cerrar={() => { setNuevoCliente(false); recargar(); }} />}
    </div>
  );
}

/* ---------- La ficha de un cliente: su cuenta con la plataforma ---------- */
function FichaCliente({ cliente, cerrar }: { cliente: ClienteCartera; cerrar: () => void }) {
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const recargar = () => {
    setCargando(true);
    Promise.all([consolaService.cobros(cliente.company_id), consolaService.conceptos()])
      .then(([c, k]) => { setCobros(c); setConceptos(k); })
      .catch(e => setError(e.message ?? 'No se pudieron cargar los cobros'))
      .finally(() => setCargando(false));
  };
  useEffect(recargar, [cliente.company_id]);

  return (
    <Modal cerrar={cerrar} titulo={cliente.empresa}
           sub={`${cliente.linea ?? '—'} · plan ${cliente.plan ?? '—'} · ${money(cliente.mensualidad ?? 0)} al mes`}>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {cargando && <p className="text-[13px] text-muted">Cargando…</p>}

      {!cargando && (
        <>
          <div className="flex items-center gap-3">
            <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-muted">Cobros</h3>
            <button onClick={() => setNuevo(v => !v)}
              className="ml-auto text-[12px] font-bold px-3 py-1.5 rounded-full border border-line hover:border-accent transition">
              {nuevo ? 'Cancelar' : 'Nuevo cobro'}
            </button>
          </div>

          {nuevo && (
            <FormCobro companyId={cliente.company_id} conceptos={conceptos}
                       listo={() => { setNuevo(false); recargar(); }} />
          )}

          <div className="grid gap-2">
            {cobros.map(c => <FilaCobro key={c.id} cobro={c} conceptos={conceptos} recargar={recargar} />)}
            {cobros.length === 0 && !nuevo && (
              <p className="text-[13px] text-muted">Sin cobros emitidos todavía.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function FilaCobro({ cobro, conceptos, recargar }:
  { cobro: Cobro; conceptos: Concepto[]; recargar: () => void }) {
  const [pagando, setPagando] = useState(false);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('transferencia');
  const [error, setError] = useState<string | null>(null);

  const yaPagado = pagado(cobro);
  const resta = cobro.amount - yaPagado;
  const nombre = conceptos.find(k => k.slug === cobro.concept)?.name ?? cobro.concept;
  const vencido = cobro.status === 'pendiente' && cobro.due_date && cobro.due_date < new Date().toISOString().slice(0, 10);

  const registrar = async () => {
    setError(null);
    const n = Number(monto);
    if (!n || n <= 0) { setError('El monto tiene que ser mayor que cero'); return; }
    if (n > resta) { setError(`Como máximo ${money(resta)}, que es lo que falta`); return; }
    try {
      await consolaService.registrarPago(cobro.id, n, metodo);
      setPagando(false); setMonto(''); recargar();
    } catch (e: any) { setError(e.message ?? 'No se pudo registrar'); }
  };

  return (
    <div className={`rounded-xl border p-3.5 ${cobro.status === 'anulado' ? 'border-line/60 opacity-60' : 'border-line'} bg-surface`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="min-w-0">
          <b className="block text-[13.5px] font-bold">{nombre}</b>
          <span className="text-[11.5px] text-muted">
            {cobro.description || 'sin detalle'} · emitido {fecha(cobro.issued_at)}
            {cobro.due_date && ` · vence ${fecha(cobro.due_date)}`}
          </span>
        </span>
        <span className="ml-auto text-right">
          <span className="block text-[14px] font-extrabold tabular-nums">{money(cobro.amount)}</span>
          {yaPagado > 0 && yaPagado < cobro.amount &&
            <span className="text-[11px] text-muted tabular-nums">pagado {money(yaPagado)}</span>}
        </span>
        <Estado status={cobro.status} vencido={!!vencido} />
      </div>

      {cobro.status === 'pendiente' && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          {!pagando ? (
            <button onClick={() => { setPagando(true); setMonto(String(resta)); }}
              className="text-[12px] font-bold px-3 py-1.5 rounded-full border border-line hover:border-accent transition">
              Registrar pago
            </button>
          ) : (
            <>
              <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="numeric"
                     placeholder="Monto"
                     className="w-32 px-3 py-1.5 rounded-lg border border-line bg-bg text-[13px] tabular-nums" />
              <select value={metodo} onChange={e => setMetodo(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-line bg-bg text-[13px]">
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="otro">Otro</option>
              </select>
              <button onClick={registrar}
                className="text-[12px] font-bold px-3 py-1.5 rounded-full bg-ink text-bg hover:opacity-90 transition">
                Guardar
              </button>
              <button onClick={() => { setPagando(false); setError(null); }}
                className="text-[12px] text-muted hover:text-ink transition">Cancelar</button>
            </>
          )}
          <button onClick={() => consolaService.anularCobro(cobro.id).then(recargar)}
            className="text-[12px] text-muted hover:text-danger transition ml-auto">Anular</button>
        </div>
      )}

      {error && <p className="text-[12px] text-danger mt-2">{error}</p>}

      {(cobro.platform_payments ?? []).length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-line grid gap-1">
          {cobro.platform_payments.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-[11.5px] text-muted">
              <span>{fecha(p.paid_at)}</span>
              <span className="text-faint">·</span>
              <span>{p.method ?? 'sin método'}</span>
              <span className="ml-auto tabular-nums font-bold text-ink-2">{money(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormCobro({ companyId, conceptos, listo }:
  { companyId: string; conceptos: Concepto[]; listo: () => void }) {
  const [concept, setConcept] = useState(conceptos[0]?.slug ?? 'mensualidad');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setError(null);
    const n = Number(amount);
    if (!n || n <= 0) { setError('El monto tiene que ser mayor que cero'); return; }
    setGuardando(true);
    try {
      await consolaService.crearCobro({
        company_id: companyId, concept, amount: n,
        description: description || null, due_date: due || null
      });
      listo();
    } catch (e: any) { setError(e.message ?? 'No se pudo crear el cobro'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="rounded-xl border border-accent/40 bg-sunk p-3.5 grid gap-2.5">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Campo l="Concepto">
          <select value={concept} onChange={e => setConcept(e.target.value)} className={inputCls}>
            {conceptos.map(k => <option key={k.slug} value={k.slug}>{k.name}</option>)}
          </select>
        </Campo>
        <Campo l="Monto">
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric"
                 placeholder="0" className={inputCls + ' tabular-nums'} />
        </Campo>
      </div>
      <Campo l="Detalle (opcional)">
        <input value={description} onChange={e => setDescription(e.target.value)}
               placeholder="Ej: mensualidad de septiembre" className={inputCls} />
      </Campo>
      <Campo l="Vence (opcional)">
        <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
      </Campo>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <button onClick={guardar} disabled={guardando}
        className="justify-self-start text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition disabled:opacity-50">
        {guardando ? 'Guardando…' : 'Emitir cobro'}
      </button>
    </div>
  );
}

/* ---------- Alta de cliente ---------- */
function FormNuevoCliente({ cerrar }: { cerrar: () => void }) {
  const [planes, setPlanes] = useState<PlanDisponible[]>([]);
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('');
  const [mensualidad, setMensualidad] = useState('');
  const [implementacion, setImplementacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    consolaService.planes().then(p => {
      setPlanes(p);
      const c = p.find(x => x.linea_slug === 'company');
      if (c) { setPlan(c.slug); setMensualidad(String(c.price_amount)); }
    }).catch(e => setError(e.message));
  }, []);

  const elegido = planes.find(p => p.slug === plan);

  const sugerirSlug = (n: string) =>
    n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
     .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38);

  const guardar = async () => {
    setError(null);
    if (!nombre.trim()) { setError('El cliente necesita un nombre'); return; }
    if (!plan) { setError('Hay que elegir un plan'); return; }
    setGuardando(true);
    try {
      await consolaService.crearCliente({
        nombre: nombre.trim(),
        slug: slug || sugerirSlug(nombre),
        plan,
        linea: elegido?.linea_slug ?? 'company',
        mensualidad: mensualidad ? Number(mensualidad) : null,
        implementacion: implementacion ? Number(implementacion) : null
      });
      cerrar();
    } catch (e: any) { setError(e.message ?? 'No se pudo dar de alta'); }
    finally { setGuardando(false); }
  };

  return (
    <Modal cerrar={cerrar} titulo="Nuevo cliente"
           sub="Queda registrado como cliente. No pasas a ser miembro de su empresa: sus usuarios se dan de alta cuando ellos entren.">
      <div className="grid gap-2.5">
        <Campo l="Nombre">
          <input value={nombre} autoFocus
                 onChange={e => { setNombre(e.target.value); if (!slug) setSlug(''); }}
                 placeholder="Ej: Panadería San Miguel" className={inputCls} />
        </Campo>
        <Campo l="Identificador" nota="minúsculas, números y guiones">
          <input value={slug || sugerirSlug(nombre)} onChange={e => setSlug(e.target.value)}
                 placeholder="panaderia-san-miguel" className={inputCls} />
        </Campo>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Campo l="Plan">
            <select value={plan}
                    onChange={e => {
                      setPlan(e.target.value);
                      const p = planes.find(x => x.slug === e.target.value);
                      if (p) setMensualidad(String(p.price_amount));
                    }}
                    className={inputCls}>
              {planes.map(p => (
                <option key={p.slug} value={p.slug}>
                  {p.linea?.replace('ANIMA ', '')} · {p.name} — {money(p.price_amount)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo l="Mensualidad" nota="puedes cambiarla">
            <input value={mensualidad} onChange={e => setMensualidad(e.target.value)} inputMode="numeric"
                   className={inputCls + ' tabular-nums'} />
          </Campo>
        </div>
        <Campo l="Implementación (opcional)" nota="si va, se emite el cobro con 30 días de plazo">
          <input value={implementacion} onChange={e => setImplementacion(e.target.value)} inputMode="numeric"
                 placeholder="0" className={inputCls + ' tabular-nums'} />
        </Campo>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <button onClick={guardar} disabled={guardando}
          className="justify-self-start text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition disabled:opacity-50">
          {guardando ? 'Dando de alta…' : 'Dar de alta'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Piezas ---------- */
const inputCls = 'w-full px-3 py-2 rounded-lg border border-line bg-bg text-[13.5px]';

const Campo = ({ l, nota, children }: { l: string; nota?: string; children: React.ReactNode }) => (
  <label className="grid gap-1">
    <span className="text-[10px] uppercase tracking-wider font-extrabold text-muted">
      {l}{nota && <span className="normal-case tracking-normal font-normal text-faint"> · {nota}</span>}
    </span>
    {children}
  </label>
);

const Estado = ({ status, vencido }: { status: string; vencido: boolean }) => {
  const [txt, cls] =
    status === 'pagado'  ? ['pagado', 'bg-ok/15 text-ok'] :
    status === 'anulado' ? ['anulado', 'bg-sunk text-faint'] :
    vencido              ? ['vencido', 'bg-danger/12 text-danger'] :
                           ['pendiente', 'bg-sunk text-muted'];
  return (
    <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${cls}`}>
      {txt}
    </span>
  );
};

const Kpi = ({ l, v, nota, alerta }: { l: string; v: string; nota?: string; alerta?: string }) => (
  <div className="rounded-2xl border border-line bg-surface p-4">
    <div className="text-[10px] uppercase tracking-wider font-extrabold text-muted">{l}</div>
    <div className="text-[21px] font-extrabold tracking-tight tabular-nums mt-0.5">{v}</div>
    {alerta && <div className="text-[11.5px] font-bold text-danger mt-0.5">{alerta}</div>}
    {nota && !alerta && <div className="text-[11.5px] text-faint mt-0.5">{nota}</div>}
  </div>
);

function Modal({ titulo, sub, cerrar, children }:
  { titulo: string; sub?: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm grid place-items-start justify-center overflow-y-auto p-4 sm:p-8"
         onClick={cerrar}>
      <div className="w-full max-w-xl rounded-2xl border border-line bg-bg shadow-xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-[19px] font-extrabold tracking-tight">{titulo}</h2>
            {sub && <p className="text-[12.5px] text-muted mt-0.5">{sub}</p>}
          </div>
          <button onClick={cerrar}
            className="ml-auto text-[13px] text-muted hover:text-ink transition shrink-0">Cerrar</button>
        </div>
        <div className="p-5 grid gap-3">{children}</div>
      </div>
    </div>
  );
}
