import { useEffect, useState, type FormEvent } from 'react';
import { equipoService, ROLES, type Invitacion, type Miembro } from '@/services/equipo.service';

/* Quién trabaja en la empresa. Sin esto un cliente de COMPANY tiene un solo
   usuario, que es lo mismo que decir que no puede usarlo.

   Invitar no crea la cuenta: anota que ese correo pertenece aquí. Cuando esa
   persona entra por primera vez, `aceptar_invitaciones()` la convierte en
   miembro con el rol que se le puso. Todavía no sale correo automático — el
   aviso lo da quien invita. */
export function Equipo({ companyId, miNivel }: { companyId: string; miNivel: number }) {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitando, setInvitando] = useState(false);

  /* Cambiar roles toca `company_members`, que pide 80. Invitar pide 60. */
  const puedeMandar   = miNivel >= 80;
  const puedeInvitar  = miNivel >= 60;

  const recargar = () => {
    setCargando(true);
    Promise.all([equipoService.miembros(companyId), equipoService.invitaciones(companyId)])
      .then(([m, i]) => { setMiembros(m); setInvitaciones(i); })
      .catch(e => setError(msg(e)))
      .finally(() => setCargando(false));
  };
  useEffect(recargar, [companyId]);

  async function cambiarRol(m: Miembro, slug: string) {
    setError(null);
    try { await equipoService.cambiarRol(m.id, slug); recargar(); }
    catch (e) { setError(msg(e)); }
  }

  async function alternar(m: Miembro) {
    setError(null);
    try {
      await equipoService.cambiarEstado(m.id, m.estado === 'active' ? 'suspended' : 'active');
      recargar();
    } catch (e) { setError(msg(e)); }
  }

  return (
    <section className="grid gap-3 aparece aparece-1">
      <div>
        <h2 className="text-[10px] uppercase tracking-wider font-extrabold text-muted">Equipo</h2>
        <p className="text-[13px] text-muted mt-1.5 max-w-[62ch]">
          Quién entra a la plataforma y hasta dónde llega. El rol no es una etiqueta:
          lo comprueba la base en cada consulta.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 grid gap-4">
        {error && (
          <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                     rounded-xl px-3.5 py-2.5">{error}</p>
        )}
        {cargando && <p className="text-[13px] text-muted">Cargando…</p>}

        {!cargando && (
          <div className="grid gap-2">
            {miembros.map(m => (
              <div key={m.id} className="flex items-center gap-3 flex-wrap px-3.5 py-3 rounded-xl
                                         border border-line bg-sunk">
                <span className="w-8 h-8 rounded-lg grid place-items-center bg-accent/12
                                 text-accent-deep font-extrabold text-[11px] shrink-0">
                  {(m.nombre ?? m.correo).slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] font-bold truncate">
                    {m.nombre ?? m.correo.split('@')[0]}
                    {m.soy_yo && <span className="ml-2 text-[11px] font-bold text-faint">· tú</span>}
                  </b>
                  <span className="block text-[12px] text-muted truncate">{m.correo}</span>
                </span>

                {m.estado === 'suspended' && (
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5
                                   rounded-full bg-danger/12 text-danger">Suspendido</span>
                )}

                {/* Nadie se cambia el rol a sí mismo: es la forma más común de
                    quedarse fuera de la propia empresa sin querer. */}
                {puedeMandar && !m.soy_yo ? (
                  <select value={m.rol_slug} onChange={e => cambiarRol(m, e.target.value)}
                    className="text-[12.5px] px-2.5 py-1.5 rounded-lg border border-line bg-surface
                               outline-none focus:border-accent transition">
                    {ROLES.map(r => <option key={r.slug} value={r.slug}>{r.nombre}</option>)}
                  </select>
                ) : (
                  <span className="text-[12px] font-bold text-muted">{m.rol}</span>
                )}

                {puedeMandar && !m.soy_yo && (
                  <button onClick={() => alternar(m)}
                    className="text-[12px] font-bold text-muted hover:text-danger transition">
                    {m.estado === 'active' ? 'Suspender' : 'Reactivar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------------- invitaciones ---------------- */}
        {puedeInvitar && (
          <div className="border-t border-line pt-4 grid gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-muted">
                Invitaciones pendientes
              </h3>
              <button onClick={() => setInvitando(v => !v)}
                className="ml-auto text-[12.5px] font-bold px-3.5 py-1.5 rounded-full border border-line
                           hover:border-accent transition">
                {invitando ? 'Cancelar' : 'Invitar a alguien'}
              </button>
            </div>

            {invitando && (
              <FormularioInvitar companyId={companyId}
                listo={() => { setInvitando(false); recargar(); }} fallo={setError} />
            )}

            {invitaciones.length === 0 && !invitando && (
              <p className="text-[13px] text-muted">Ninguna pendiente.</p>
            )}

            {invitaciones.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl
                                         border border-dashed border-line">
                <span className="min-w-0">
                  <b className="block text-[13px] font-bold truncate">{i.full_name ?? i.email}</b>
                  <span className="text-[11.5px] text-faint">
                    {i.email} · entra sola cuando esa persona inicie sesión
                  </span>
                </span>
                <button onClick={async () => {
                          try { await equipoService.retirarInvitacion(i.id); recargar(); }
                          catch (e) { setError(msg(e)); } }}
                  className="ml-auto text-[12px] font-bold text-muted hover:text-danger transition">
                  Retirar
                </button>
              </div>
            ))}

            <p className="text-[11.5px] text-faint leading-relaxed">
              Invitar no envía correo todavía: anota que ese correo pertenece a esta
              organización. Avísale tú; al entrar, queda dentro con el rol que le pusiste.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function FormularioInvitar({ companyId, listo, fallo }: {
  companyId: string; listo: () => void; fallo: (m: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<string>('employee');
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try { await equipoService.invitar(companyId, email, rol, nombre); listo(); }
    catch (err) { fallo(msg(err)); setGuardando(false); }
  }

  const campo = `w-full px-3 py-2 rounded-lg border border-line bg-surface text-[13.5px]
                 outline-none focus:border-accent transition`;
  const etiqueta = 'block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5';

  return (
    <form onSubmit={enviar} className="rounded-xl border border-line bg-sunk p-4 grid gap-3 entra">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2">
          <span className={etiqueta}>Correo</span>
          <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
                 className={campo} />
        </label>
        <label>
          <span className={etiqueta}>Rol</span>
          <select value={rol} onChange={e => setRol(e.target.value)} className={campo}>
            {ROLES.map(r => <option key={r.slug} value={r.slug}>{r.nombre}</option>)}
          </select>
        </label>
      </div>
      <label>
        <span className={etiqueta}>Nombre <span className="normal-case tracking-normal text-faint">· opcional</span></span>
        <input value={nombre} onChange={e => setNombre(e.target.value)} className={campo} />
      </label>
      <p className="text-[11.5px] text-faint">
        {ROLES.find(r => r.slug === rol)?.que}
      </p>
      <button type="submit" disabled={guardando || !email.trim()}
        className="justify-self-end text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg
                   disabled:opacity-45 hover:opacity-90 transition">
        {guardando ? 'Anotando…' : 'Invitar'}
      </button>
    </form>
  );
}

function msg(e: unknown): string {
  const m = e instanceof Error ? e.message
    : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
    : String(e);
  if (/duplicate key|unique/i.test(m)) return 'Ya hay una invitación pendiente para ese correo.';
  if (/violates row-level security/i.test(m)) return 'Tu rol no alcanza para hacer este cambio.';
  return m;
}
