import { useEffect, useMemo, useState } from 'react';
import { cargarLevantamiento, responder, cerrarLevantamiento,
         listarRequisitos, sembrarRequisitos, actualizarRequisito,
         type Levantamiento as Datos, type Pregunta, type Requisito,
         type EstadoRequisito } from '@/services/capital.service';
import { diaCorto } from '@/lib/formato';

/* LEVANTAMIENTO
   ---------------------------------------------------------------------------
   Lo que hay que saber y lo que hay que reunir antes de que la plataforma
   sirva para algo. Dos cosas distintas y por eso dos solapas:

     Cuestionario — lo que solo sabe quien va a usarla. Se responde una vez.
     Documentos   — lo que hay que pedir, con estado y responsable.

   Cada pregunta dice PARA QUÉ sirve la respuesta. No es cortesía: un
   cuestionario de cuarenta preguntas sin justificar se contesta a desgana en
   las primeras diez y se abandona en la doce. Diciendo qué configura cada
   respuesta, quien contesta sabe cuáles puede saltarse y cuáles no.

   Las respuestas se guardan al salir del campo, una por una. Un botón de
   "guardar todo" al final de cuarenta preguntas es una invitación a perder
   media hora de trabajo por cerrar una pestaña.

   Se imprime. Es lo que permite mandarlo por correo a quien no tiene cuenta
   todavía, que durante una puesta en marcha es lo normal. */

type Solapa = 'cuestionario' | 'documentos';

const ESTADOS: { valor: EstadoRequisito; nombre: string; tono: string }[] = [
  { valor: 'pendiente',  nombre: 'Pendiente',   tono: 'var(--color-faint)' },
  { valor: 'solicitado', nombre: 'Solicitado',  tono: 'var(--color-aviso)' },
  { valor: 'recibido',   nombre: 'Recibido',    tono: 'var(--color-accent)' },
  { valor: 'en_revision', nombre: 'En revisión', tono: 'var(--color-accent)' },
  { valor: 'observado',  nombre: 'Observado',   tono: 'var(--color-danger)' },
  { valor: 'aprobado',   nombre: 'Aprobado',    tono: 'var(--color-ok)' },
  { valor: 'no_aplica',  nombre: 'No aplica',   tono: 'var(--color-line)' }
];

const AREA: Record<string, string> = {
  organizacion: 'La organización',
  financiera: 'Financiera',
  comercial: 'Comercial e inversión',
  legal: 'Legal',
  gobierno: 'Gobierno corporativo',
  operacional: 'Operacional',
  riesgos: 'Riesgos'
};

export function LevantamientoCapital({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const [solapa, setSolapa] = useState<Solapa>('cuestionario');

  return (
    <div className="grid gap-4 aparece">
      <div>
        <div className="rotulo">Levantamiento</div>
        <p className="subtitulo mt-1.5 max-w-[68ch]">
          Lo que hace falta saber y reunir para migrar los proyectos y empezar a usar
          la plataforma de verdad. Se responde una vez; después se consulta.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 flex-wrap border-b border-line pb-3">
        {([['cuestionario', 'Cuestionario'], ['documentos', 'Documentos necesarios']] as const)
          .map(([id, nombre]) => (
            <button key={id} role="tab" aria-selected={solapa === id}
                    onClick={() => setSolapa(id)} className="pest">{nombre}</button>
          ))}
      </div>

      {solapa === 'cuestionario'
        ? <Cuestionario companyId={companyId} puedeEditar={puedeEditar} />
        : <Documentos companyId={companyId} puedeEditar={puedeEditar} />}
    </div>
  );
}

// =========================================================== cuestionario

function Cuestionario({ companyId, puedeEditar }: { companyId: string; puedeEditar: boolean }) {
  const [d, setD] = useState<Datos | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [seccion, setSeccion] = useState(0);
  const [todo, setTodo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    cargarLevantamiento(companyId)
      .then(r => { if (!vivo) return; setD(r); setBorrador(r?.respuestas ?? {}); })
      .catch(e => vivo && setError(e.message ?? 'No se pudo cargar el cuestionario.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  /* Al salir del campo. Si el valor no cambió no se escribe: mover el foco por
     un formulario no debería generar cuarenta escrituras. */
  async function guardar(id: string) {
    if (!d || !puedeEditar) return;
    const v = borrador[id] ?? '';
    if (v === (d.respuestas[id] ?? '')) return;
    setGuardando(id); setError(null);
    try {
      await responder(companyId, id, v);
      setD(p => p && ({ ...p, respuestas: { ...p.respuestas, [id]: v },
        avance: recuenta({ ...p.respuestas, [id]: v }, p.avance.total) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la respuesta.');
    } finally { setGuardando(null); }
  }

  if (cargando) return <div className="tarjeta" style={{ height: 320 }} aria-busy="true" />;

  if (error && !d) {
    return <p role="alert" className="tarjeta p-4"
              style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>;
  }

  if (!d) {
    return (
      <div className="tarjeta p-8">
        <p className="titular" style={{ fontSize: 20 }}>El cuestionario todavía no está iniciado</p>
        <p className="subtitulo mt-1.5 max-w-[58ch]">
          Lo abre quien administra la organización. Pídele que entre una vez a esta
          pestaña y quedará disponible para todo el equipo.
        </p>
      </div>
    );
  }

  const secciones = d.plantilla.secciones;
  const activa = secciones[Math.min(seccion, secciones.length - 1)];
  const enviado = !!d.sesion.enviado_en;

  return (
    <div className="grid gap-4">
      <section className="tarjeta p-4 grid gap-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="rotulo">{d.plantilla.nombre}</div>
            <p className="text-[12.5px] text-muted mt-1">
              {d.avance.respondidas} de {d.avance.total} respondidas
              {enviado && <> · enviado el {diaCorto(String(d.sesion.enviado_en).slice(0, 10))}</>}
            </p>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            <button className="b b-sec b-sm" onClick={() => setTodo(t => !t)}>
              {todo ? 'Ver por secciones' : 'Ver todo (para imprimir)'}
            </button>
            <button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>
            {puedeEditar && !enviado && (
              <button className="b b-pri b-sm"
                      onClick={() => cerrarLevantamiento(companyId).then(setD).catch(e => setError(e.message))}>
                Marcar como enviado
              </button>
            )}
          </div>
        </div>

        {/* La barra de avance no es decoración: en un formulario largo es lo
            único que dice cuánto falta, y saberlo es lo que hace que se
            termine. */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-sunk)' }}>
          <div className="h-full rounded-full transition-all"
               style={{ width: `${d.avance.pct}%`, background: 'var(--color-accent)' }} />
        </div>

        {!puedeEditar && (
          <p className="text-[12.5px] text-faint">
            Puedes leerlo, pero responder es de quien administra la organización.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="entra rounded-xl px-3.5 py-2.5 text-[13px]"
           style={{ color: 'var(--color-danger)',
                    background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}>{error}</p>
      )}

      {!todo && (
        <div role="tablist" className="flex gap-1 flex-wrap">
          {secciones.map((s, i) => (
            <button key={s.key} role="tab" aria-selected={i === seccion}
                    onClick={() => setSeccion(i)} className="pest">
              {s.short}
              <span className="ml-1.5 text-[10.5px] text-faint">
                {contarSeccion(s, d.respuestas)}
              </span>
            </button>
          ))}
        </div>
      )}

      {(todo ? secciones : activa ? [activa] : []).map(s => (
        <section key={s.key} className="grid gap-3">
          <div>
            <h2 className="rotulo">{s.title}</h2>
            {s.intro && <p className="text-[12.5px] text-muted mt-1 max-w-[68ch]">{s.intro}</p>}
          </div>
          {s.blocks.map(b => (
            <div key={b.title} className="tarjeta p-5 grid gap-4">
              <h3 className="rotulo rotulo-tenue">{b.title}</h3>
              {b.questions.map(q => (
                <Campo key={q.id} q={q}
                       valor={borrador[q.id] ?? ''}
                       guardado={!!(d.respuestas[q.id] ?? '').trim()}
                       guardando={guardando === q.id}
                       puedeEditar={puedeEditar}
                       onChange={v => setBorrador(p => ({ ...p, [q.id]: v }))}
                       onBlur={() => guardar(q.id)} />
              ))}
            </div>
          ))}
        </section>
      ))}

      {!todo && secciones.length > 1 && (
        <div className="flex gap-2">
          <button className="b b-sec b-sm" disabled={seccion === 0}
                  onClick={() => setSeccion(n => n - 1)}>← Anterior</button>
          <button className="b b-sec b-sm" disabled={seccion >= secciones.length - 1}
                  onClick={() => setSeccion(n => n + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}

function Campo({ q, valor, guardado, guardando, puedeEditar, onChange, onBlur }: {
  q: Pregunta; valor: string; guardado: boolean; guardando: boolean;
  puedeEditar: boolean; onChange: (v: string) => void; onBlur: () => void;
}) {
  const bloqueante = (q.priority ?? '').includes('bloqueante');
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline gap-2 flex-wrap">
        <b className="text-[13.5px] font-bold">{q.q}</b>
        {bloqueante && <span className="marca marca-aviso">hace falta para arrancar</span>}
        {guardado && !guardando && (
          <span className="text-[11px]" style={{ color: 'var(--color-ok)' }} aria-label="Guardada">✓</span>
        )}
        {guardando && <span className="text-[11px] text-faint">guardando…</span>}
      </span>
      {q.why && <span className="text-[12px] text-muted leading-snug">{q.why}</span>}
      <textarea className="campo" rows={2} value={valor} disabled={!puedeEditar}
                placeholder={q.example ? `Por ejemplo: ${q.example}` : undefined}
                onChange={e => onChange(e.target.value)} onBlur={onBlur} />
    </label>
  );
}

// ============================================================= documentos

function Documentos({ companyId, puedeEditar }: { companyId: string; puedeEditar: boolean }) {
  const [filas, setFilas] = useState<Requisito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloFaltan, setSoloFaltan] = useState(false);
  const [sembrando, setSembrando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    listarRequisitos(companyId)
      .then(r => vivo && setFilas(r))
      .catch(e => vivo && setError(e.message ?? 'No se pudieron cargar los documentos.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [companyId]);

  async function sembrar() {
    setSembrando(true); setError(null);
    try {
      await sembrarRequisitos(companyId);
      setFilas(await listarRequisitos(companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar la lista.');
    } finally { setSembrando(false); }
  }

  /* El cambio se ve al instante y se deshace si la base lo rechaza. Es el
     mismo trato que da el motor de datos a la edición en la celda. */
  async function cambiar(id: string, cambios: Partial<Requisito>) {
    const antes = filas;
    setFilas(f => f.map(x => x.id === id ? { ...x, ...cambios } : x));
    try { await actualizarRequisito(id, cambios); }
    catch (e) {
      setFilas(antes);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio.');
    }
  }

  const listos = useMemo(
    () => filas.filter(f => f.status === 'aprobado' || f.status === 'no_aplica').length, [filas]);
  const faltanObligatorios = useMemo(
    () => filas.filter(f => f.required && f.status !== 'aprobado' && f.status !== 'no_aplica').length,
    [filas]);

  const visibles = soloFaltan
    ? filas.filter(f => f.status !== 'aprobado' && f.status !== 'no_aplica')
    : filas;

  const areas = [...new Set(visibles.map(f => f.area))];

  if (cargando) return <div className="tarjeta" style={{ height: 320 }} aria-busy="true" />;

  if (filas.length === 0) {
    return (
      <div className="tarjeta p-8 grid gap-3 justify-items-start">
        <div>
          <p className="titular" style={{ fontSize: 20 }}>La lista de documentos está vacía</p>
          <p className="subtitulo mt-1.5 max-w-[62ch]">
            Hay una lista estándar con lo que hace falta para migrar proyectos y empezar
            a usar la plataforma: modelos financieros, presupuesto original, ejecución
            real, decks, cap table. Se carga una vez y desde ahí la adaptas —sobran filas
            en unos casos y faltan en otros, y eso está bien.
          </p>
        </div>
        {puedeEditar
          ? <button className="b b-pri" onClick={sembrar} disabled={sembrando}>
              {sembrando ? 'Preparando…' : 'Cargar la lista estándar'}
            </button>
          : <p className="text-[12.5px] text-faint">La carga quien administra la organización.</p>}
        {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="tarjeta p-4 flex items-end gap-3 flex-wrap">
        <div>
          <div className="rotulo">Avance</div>
          <p className="text-[12.5px] text-muted mt-1">
            {listos} de {filas.length} resueltos ·{' '}
            {faltanObligatorios === 0
              ? <span style={{ color: 'var(--color-ok)' }}>no falta ninguno obligatorio</span>
              : <span style={{ color: 'var(--color-aviso)' }}>
                  faltan {faltanObligatorios} obligatorio(s)
                </span>}
          </p>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button className="b b-sec b-sm" onClick={() => setSoloFaltan(v => !v)}>
            {soloFaltan ? 'Ver todos' : 'Ver solo lo que falta'}
          </button>
          <button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>
        </div>
      </section>

      {error && (
        <p role="alert" className="entra rounded-xl px-3.5 py-2.5 text-[13px]"
           style={{ color: 'var(--color-danger)',
                    background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}>{error}</p>
      )}

      {areas.map(a => (
        <section key={a} className="tarjeta p-5 grid gap-3">
          <h2 className="rotulo">{AREA[a] ?? a}</h2>
          <div className="grid gap-3">
            {visibles.filter(f => f.area === a).map(f => (
              <div key={f.id} className="grid gap-2 pb-3 border-b border-line last:border-0 last:pb-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <b className="text-[13.5px] font-bold">{f.name}</b>
                  {f.required && <span className="marca marca-aviso">obligatorio</span>}
                  {f.format && <span className="text-[11px] text-faint">{f.format}</span>}
                </div>
                {f.why && <p className="text-[12px] text-muted leading-snug max-w-[72ch]">{f.why}</p>}
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="grid gap-1">
                    <span className="rotulo">Estado</span>
                    <select className="campo" value={f.status} disabled={!puedeEditar}
                            onChange={e => cambiar(f.id, { status: e.target.value as EstadoRequisito })}>
                      {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.nombre}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="rotulo">Responsable</span>
                    <input className="campo" defaultValue={f.owner ?? ''} disabled={!puedeEditar}
                           onBlur={e => e.target.value !== (f.owner ?? '')
                             && cambiar(f.id, { owner: e.target.value || null })} />
                  </label>
                  <label className="grid gap-1">
                    <span className="rotulo">Enlace al archivo</span>
                    <input className="campo" defaultValue={f.link ?? ''} disabled={!puedeEditar}
                           placeholder="Drive, Dropbox, correo…"
                           onBlur={e => e.target.value !== (f.link ?? '')
                             && cambiar(f.id, { link: e.target.value || null })} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function contarSeccion(s: { blocks: { questions: Pregunta[] }[] }, r: Record<string, string>) {
  const ids = s.blocks.flatMap(b => b.questions.map(q => q.id));
  const n = ids.filter(i => (r[i] ?? '').trim()).length;
  return `${n}/${ids.length}`;
}

function recuenta(r: Record<string, string>, total: number) {
  const respondidas = Object.values(r).filter(v => (v ?? '').trim()).length;
  return { respondidas, total, pct: total ? Math.round(respondidas / total * 100) : 0 };
}
