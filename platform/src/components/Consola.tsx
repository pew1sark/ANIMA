import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca } from '@/components/Marca';
import {
  consolaService, senalesDe, gravedadDe, diasSin,
  type EstadoCliente, type Gravedad, type PlanDisponible, type SolicitudAcceso
} from '@/services/consola.service';
import { dinero, cantidad, diaCorto } from '@/lib/formato';

/* La consola de plataforma: el centro de control de ANIMA TSC.
   ---------------------------------------------------------------------------
   Qué se mira aquí: si el cliente entra, si usa, si le queda cupo, si su plan
   le sirve, si terminó de arrancar. Estado, no cuentas.

   Qué NO se mira aquí: cuánto debe, qué se le facturó, qué pagó. Eso vive en
   ANIMA COMPANY, en la ficha del cliente, con los mismos documentos y los
   mismos vencimientos que cualquier otro cliente. Estuvo aquí un tiempo y era
   un enredo: dos sitios donde mirar lo mismo, y ninguno completo.

   La operación del cliente tampoco se ve — y no por decencia: RLS no se la
   entrega a nadie que no sea miembro de esa empresa. */

const TONO: Record<Gravedad, string> = {
  malo: 'var(--color-danger)', aviso: 'var(--color-aviso)', ok: 'var(--color-ok)'
};

export function Consola({ volver }: { volver?: () => void }) {
  const { user, signOut } = useAuth();
  const [clientes, setClientes] = useState<EstadoCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<EstadoCliente | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudAcceso[]>([]);

  const recargar = () => {
    setCargando(true);
    consolaService.estado()
      .then(setClientes)
      .catch(e => setError(e.message ?? 'No se pudo cargar el estado'))
      .finally(() => setCargando(false));
  };
  useEffect(recargar, []);
  const recargarSolicitudes = () =>
    consolaService.solicitudes().then(setSolicitudes).catch(() => {});
  useEffect(() => { recargarSolicitudes(); }, []);

  /* Ordenados por lo que necesita atención. Una lista alfabética obliga a
     leerla entera cada mañana para descubrir qué cambió. */
  const lista = useMemo(() => {
    const peso: Record<Gravedad, number> = { malo: 0, aviso: 1, ok: 2 };
    return [...clientes]
      .map(c => ({ c, senales: senalesDe(c) }))
      .sort((a, b) => peso[gravedadDe(a.senales)] - peso[gravedadDe(b.senales)]
                   || a.c.empresa.localeCompare(b.c.empresa));
  }, [clientes]);

  const totales = clientes.reduce((a, c) => ({
    activos: a.activos + (c.suscripcion === 'activa' ? 1 : 0),
    usuarios: a.usuarios + Number(c.usuarios ?? 0),
    atencion: a.atencion + (gravedadDe(senalesDe(c)) !== 'ok' ? 1 : 0)
  }), { activos: 0, usuarios: 0, atencion: 0 });

  return (
    <div className="min-h-full">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20">
        <Marca sub="Consola" />
        {volver && (
          <button onClick={volver} className="text-[13px] text-muted hover:text-ink transition ml-3">
            ← Cambiar de puerta
          </button>
        )}
        <span className="ml-auto text-[13px] text-muted hidden lg:block truncate max-w-[220px]">{user?.email}</span>
        <span className="marca marca-acento">Super Admin</span>
        <button onClick={signOut}
          className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
      </header>

      <main className="p-6 max-w-[1180px] grid gap-6 aparece">
        <div className="flex items-end gap-4 flex-wrap min-w-0">
          <div className="min-w-0">
            <div className="rotulo rotulo-tenue">ANIMA TSC</div>
            <h1 className="titular mt-1">Centro de control</h1>
            <p className="subtitulo mt-1.5">
              El estado de cada cliente: si entra, si usa, si le queda cupo y si arrancó.
              Lo que le facturas y lo que te debe vive en ANIMA COMPANY, en su ficha de cliente.
            </p>
          </div>
          <button onClick={() => setNuevoCliente(true)} className="b b-pri ml-auto">
            Nuevo cliente
          </button>
        </div>

        {error && <p role="alert" className="tarjeta p-4 text-[13px] text-danger">{error}</p>}

        {cargando && (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="tarjeta" style={{ height: 94 }} />)}
          </div>
        )}

        {!cargando && (
          <>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi l="Clientes" v={cantidad(clientes.length)} />
              <Kpi l="Suscripciones activas" v={cantidad(totales.activos)}
                   nota={`de ${clientes.length}`} />
              <Kpi l="Usuarios con acceso" v={cantidad(totales.usuarios)} />
              <Kpi l="Piden atención" v={cantidad(totales.atencion)}
                   tono={totales.atencion > 0 ? 'aviso' : 'ok'} />
            </div>

            <div className="grid gap-2.5">
              {lista.map(({ c, senales }) => {
                const g = gravedadDe(senales);
                const dias = diasSin(c.ultima_actividad);
                return (
                  <button key={c.company_id} onClick={() => setAbierto(c)}
                    className="tarjeta p-4 text-left toque hover:border-accent group">
                    <div className="flex items-start gap-3 flex-wrap">
                      {/* El punto es la respuesta rápida: qué mirar primero. */}
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-2"
                            style={{ background: TONO[g] }} title={g} />
                      <span className="min-w-0 flex-1">
                        <b className="block text-[15px] tracking-tight truncate"
                           style={{ fontWeight: 'var(--peso-negro)' }}>{c.empresa}</b>
                        <span className="block text-[12px] text-muted">
                          {c.linea ?? 'sin línea'} · {c.plan ?? 'sin plan'} · /{c.slug}
                          {c.suscripcion && c.suscripcion !== 'activa' && ` · ${c.suscripcion}`}
                        </span>
                        <span className="flex flex-wrap gap-1.5 mt-2">
                          {senales.map((s, i) => (
                            <span key={i} className={`marca ${s.tono === 'malo' ? 'marca-malo'
                                                     : s.tono === 'aviso' ? 'marca-aviso' : 'marca-ok'}`}>
                              {s.texto}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="flex gap-6 shrink-0">
                        <Mini l="Usuarios" v={`${c.usuarios}${c.usuarios_plan != null ? ` / ${c.usuarios_plan}` : ''}`} />
                        <Mini l="Actividad" v={dias == null ? 'nunca' : dias === 0 ? 'hoy' : `${dias} d`} />
                        <Mini l="Módulos" v={`${c.modulos} / ${c.modulos_plan}`} />
                      </span>
                      <span className="text-faint group-hover:text-accent transition self-center">→</span>
                    </div>
                  </button>
                );
              })}
              {clientes.length === 0 && (
                <div className="tarjeta p-8 text-center">
                  <p className="text-[14px] font-bold">Todavía no hay clientes</p>
                  <p className="text-[13px] text-muted mt-1">El primero se da de alta con el botón de arriba.</p>
                </div>
              )}
            </div>

            <Solicitudes lista={solicitudes} recargar={recargarSolicitudes} />
          </>
        )}
      </main>

      {abierto && <FichaEstado cliente={abierto} cerrar={() => setAbierto(null)} />}
      {nuevoCliente && <FormNuevoCliente cerrar={() => { setNuevoCliente(false); recargar(); }} />}
    </div>
  );
}

/* ---------------- La ficha: el estado de un cliente, en detalle ------------ */

function FichaEstado({ cliente: c, cerrar }: { cliente: EstadoCliente; cerrar: () => void }) {
  const senales = senalesDe(c);
  const dias = diasSin(c.ultima_actividad);

  return (
    <Modal cerrar={cerrar} titulo={c.empresa}
           sub={`${c.linea ?? 'sin línea'} · plan ${c.plan ?? '—'} · /${c.slug}`}>
      <div className="grid gap-4">
        <section className="grid gap-2">
          <h3 className="rotulo rotulo-tenue">Qué pasa</h3>
          <div className="grid gap-1.5">
            {senales.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                   style={{ background: 'var(--color-sunk)' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONO[s.tono] }} />
                <span className="text-[13px]">{s.texto}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <h3 className="rotulo rotulo-tenue">Acceso</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Dato l="Usuarios activos" v={`${c.usuarios}${c.usuarios_plan != null ? ` de ${c.usuarios_plan}` : ''}`} />
            <Dato l="Suscripción" v={c.suscripcion ?? '—'} />
            <Dato l="Estado de la cuenta" v={c.estado} />
            <Dato l="Cliente desde" v={c.desde ? diaCorto(c.desde.slice(0, 10)) : '—'} />
          </div>
        </section>

        <section className="grid gap-2">
          <h3 className="rotulo rotulo-tenue">Uso</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Dato l="Última actividad"
                  v={dias == null ? 'nunca' : dias === 0 ? 'hoy' : `hace ${dias} días`} />
            <Dato l="Acciones en 7 días" v={cantidad(c.acciones_7d)} />
            <Dato l="Módulos encendidos" v={`${c.modulos} de ${c.modulos_plan} del plan`} />
            <Dato l="Puesta en marcha" v={c.levantamiento} />
          </div>
        </section>

        <section className="grid gap-2">
          <h3 className="rotulo rotulo-tenue">Qué tiene cargado</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Dato l="Clientes" v={cantidad(c.datos.clientes)} />
            <Dato l="Productos" v={cantidad(c.datos.productos)} />
            <Dato l="Pedidos" v={cantidad(c.datos.pedidos)} />
            <Dato l="Pedidos en 30 días" v={cantidad(c.datos.pedidos_30d)} />
          </div>
          <p className="text-[11.5px] text-faint">
            Son recuentos, no contenido: la operación de {c.empresa} es suya y la base no la entrega
            a quien no sea miembro de esa empresa.
          </p>
        </section>

        <p className="text-[12px] text-muted rounded-xl px-3.5 py-3" style={{ background: 'var(--color-sunk)' }}>
          Lo que le facturas y lo que te debe no está aquí: vive en <b>ANIMA COMPANY</b>, en la ficha
          de {c.empresa} como cliente tuyo, con sus documentos y vencimientos.
        </p>
      </div>
    </Modal>
  );
}

/* ---------------- Quién pidió entrar ---------------- */

function Solicitudes({ lista, recargar }:
  { lista: SolicitudAcceso[]; recargar: () => void }) {
  const [obrando, setObrando] = useState<string | null>(null);
  const pendientes = lista.filter(s => s.status === 'pendiente');

  async function resolver(id: string, status: 'invitada' | 'rechazada') {
    setObrando(id);
    try { await consolaService.resolverSolicitud(id, status); recargar(); }
    finally { setObrando(null); }
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="rotulo">Solicitudes de acceso</h2>
        {pendientes.length > 0 && (
          <span className="marca marca-acento">
            {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {pendientes.length === 0 && (
        <p className="text-[13px] text-muted">
          Nadie ha pedido acceso todavía. El formulario está en el login de la plataforma.
        </p>
      )}

      <div className="grid gap-2">
        {pendientes.map(s => (
          <div key={s.id} className="tarjeta p-4 aparece">
            <div className="flex items-start gap-3 flex-wrap">
              <span className="min-w-0 flex-1">
                <b className="block text-[14px] font-bold truncate">{s.nombre || s.email}</b>
                <span className="block text-[12px] text-muted truncate">
                  {s.email}
                  {s.organizacion && ` · ${s.organizacion}`}
                  {` · ANIMA ${s.linea.toUpperCase()}`}
                </span>
                {s.mensaje && (
                  <span className="block text-[12.5px] text-ink-2 mt-2 leading-relaxed">{s.mensaje}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <button onClick={() => resolver(s.id, 'invitada')} disabled={obrando === s.id}
                  className="b b-pri b-sm">Invitada</button>
                <button onClick={() => resolver(s.id, 'rechazada')} disabled={obrando === s.id}
                  className="b b-sec b-sm">Descartar</button>
              </span>
            </div>
            <p className="text-[11px] text-faint mt-2">{diaCorto(s.created_at.slice(0, 10))}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- El alta ---------------- */

function FormNuevoCliente({ cerrar }: { cerrar: () => void }) {
  const [planes, setPlanes] = useState<PlanDisponible[]>([]);
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('');
  const [mensualidad, setMensualidad] = useState('');
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
        mensualidad: mensualidad ? Number(mensualidad) : null
      });
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar de alta');
    } finally { setGuardando(false); }
  };

  return (
    <Modal cerrar={cerrar} titulo="Nuevo cliente"
           sub="Abre la cuenta y enciende lo que trae el plan. No pasas a ser miembro de su empresa: sus usuarios entran cuando los inviten.">
      <div className="grid gap-2.5">
        <Campo l="Nombre">
          <input value={nombre} autoFocus
                 onChange={e => { setNombre(e.target.value); if (!slug) setSlug(''); }}
                 placeholder="Ej: Panadería San Miguel" className="campo" />
        </Campo>
        <Campo l="Identificador" nota="minúsculas, números y guiones">
          <input value={slug || sugerirSlug(nombre)} onChange={e => setSlug(e.target.value)}
                 placeholder="panaderia-san-miguel" className="campo" />
        </Campo>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <Campo l="Plan">
            <select value={plan}
                    onChange={e => {
                      setPlan(e.target.value);
                      const p = planes.find(x => x.slug === e.target.value);
                      if (p) setMensualidad(String(p.price_amount));
                    }}
                    className="campo">
              {planes.map(p => (
                <option key={p.slug} value={p.slug}>
                  {p.linea?.replace('ANIMA ', '')} · {p.name} — {dinero(p.price_amount)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo l="Mensualidad pactada" nota="puede no ser la de lista">
            <input value={mensualidad} onChange={e => setMensualidad(e.target.value)} inputMode="numeric"
                   className="campo tabular-nums" />
          </Campo>
        </div>
        {/* La implementación se cobraba desde aquí y ya no: es un documento del
            cliente, y los documentos viven en COMPANY junto a los demás. */}
        <p className="text-[12px] text-muted rounded-xl px-3.5 py-2.5" style={{ background: 'var(--color-sunk)' }}>
          Lo que le cobres —implementación, cuotas, mensualidades— se registra en
          <b> ANIMA COMPANY</b>, en su ficha de cliente. Aquí solo se abre la cuenta.
        </p>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <button onClick={guardar} disabled={guardando} className="b b-pri justify-self-start">
          {guardando ? 'Dando de alta…' : 'Dar de alta'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- Piezas ---------------- */

const Campo = ({ l, nota, children }: { l: string; nota?: string; children: React.ReactNode }) => (
  <label className="grid gap-1">
    <span className="rotulo">
      {l}{nota && <span className="normal-case tracking-normal font-normal text-faint"> · {nota}</span>}
    </span>
    {children}
  </label>
);

const Kpi = ({ l, v, nota, tono }: { l: string; v: string; nota?: string; tono?: Gravedad }) => (
  <div className="tarjeta p-4 toque">
    <div className="rotulo">{l}</div>
    <div className="cifra-grande mt-2" style={{ color: tono && tono !== 'ok' ? TONO[tono] : undefined }}>{v}</div>
    {nota && <div className="mt-1.5" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>{nota}</div>}
  </div>
);

const Mini = ({ l, v }: { l: string; v: string }) => (
  <span className="text-right">
    <span className="block rotulo rotulo-tenue" style={{ fontSize: 9.5 }}>{l}</span>
    <b className="block text-[13.5px] cifra">{v}</b>
  </span>
);

const Dato = ({ l, v }: { l: string; v: string }) => (
  <span className="grid gap-0.5">
    <span className="rotulo rotulo-tenue">{l}</span>
    <b className="text-[14px]" style={{ fontWeight: 'var(--peso-fuerte)' }}>{v}</b>
  </span>
);

function Modal({ titulo, sub, cerrar, children }:
  { titulo: string; sub?: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="panel-fondo entra" onClick={cerrar}>
      <div className="panel max-w-xl" onClick={e => e.stopPropagation()}>
        <header className="panel-cab">
          <div className="min-w-0">
            <h2 className="titular truncate" style={{ fontSize: 20 }}>{titulo}</h2>
            {sub && <p className="text-[12.5px] text-muted mt-0.5">{sub}</p>}
          </div>
          <button onClick={cerrar}
            className="ml-auto text-[13px] text-muted hover:text-ink transition shrink-0">Cerrar</button>
        </header>
        <div className="panel-cuerpo">{children}</div>
      </div>
    </div>
  );
}
