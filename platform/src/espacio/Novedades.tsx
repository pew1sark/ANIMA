import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/auth/AuthContext';
import { diaCorto } from '@/lib/formato';

/* Novedades de la plataforma, y el canal para responder.
   ---------------------------------------------------------------------------
   `changelog` no pasa por el motor de datos a propósito: no es una entidad de
   la empresa. Es el mismo texto para todas, lo escribe quien mantiene ANIMA, y
   su política de lectura es pública mientras que la de escritura es de una sola
   cuenta. Meterlo en el motor obligaría a inventarle un `company_id` que no
   tiene sentido y a fingir que se puede editar.

   El feedback es al revés: cada quien escribe el suyo y solo ve el suyo
   (`auth.uid() = user_id` en las dos políticas). Tampoco lleva empresa. */

interface Nota { id: string; title: string; body: string | null; tag: string | null; created_at: string }
interface Enviado { id: string; message: string; rating: number | null; created_at: string }

export function Novedades() {
  const { user } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [mios, setMios] = useState<Enviado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mensaje, setMensaje] = useState('');
  const [nota, setNota] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gracias, setGracias] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([
      supabase.from('changelog').select('id,title,body,tag,created_at')
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('feedback').select('id,message,rating,created_at')
        .order('created_at', { ascending: false }).limit(5)
    ]).then(([c, f]) => {
      if (!vivo) return;
      if (c.error) setError(c.error.message);
      setNotas((c.data ?? []) as Nota[]);
      /* Que el feedback propio falle no debe llevarse por delante las
         novedades: son dos cosas distintas en la misma pantalla. */
      setMios((f.data ?? []) as Enviado[]);
    }).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!mensaje.trim() || !user) return;
    setEnviando(true); setError(null);
    const { data, error: err } = await supabase.from('feedback')
      .insert({ user_id: user.id, message: mensaje.trim(), rating: nota,
                context: 'ANIMA COMPANY', alma_name: user.email })
      .select('id,message,rating,created_at').single();
    setEnviando(false);
    if (err) { setError(err.message); return; }
    setMios(m => [data as Enviado, ...m]);
    setMensaje(''); setNota(null); setGracias(true);
  }

  return (
    <div className="grid gap-4 aparece">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] items-start">

        {/* --------------------------------------------------- las novedades */}
        <section className="tarjeta p-5">
          <h2 className="rotulo">Qué ha cambiado</h2>
          <p className="mt-1 mb-4" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
            El registro de versiones de ANIMA. Es el mismo para todas las empresas.
          </p>

          {cargando && <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>Cargando…</p>}

          {!cargando && notas.length === 0 && (
            <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
              Todavía no hay novedades publicadas.
            </p>
          )}

          <div className="grid gap-4">
            {notas.map((n, i) => (
              <article key={n.id} className={i > 0 ? 'pt-4' : ''}
                       style={{ borderTop: i > 0 ? '1px solid var(--color-line)' : undefined }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <b style={{ fontSize: 'var(--texto-lg)', fontWeight: 'var(--peso-fuerte)' }}>{n.title}</b>
                  {n.tag && <span className="marca marca-acento">{n.tag}</span>}
                  <span className="ml-auto tabular-nums"
                        style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>
                    {diaCorto(n.created_at.slice(0, 10))}
                  </span>
                </div>
                {n.body && (
                  <p className="mt-1.5 whitespace-pre-line"
                     style={{ fontSize: 'var(--texto-md)', color: 'var(--color-ink-2)', maxWidth: '68ch' }}>
                    {n.body}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------ el canal */}
        <section className="tarjeta p-5">
          <h2 className="rotulo">Contar algo</h2>
          <p className="mt-1 mb-4" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-faint)' }}>
            Un error, algo que falta, algo que estorba. Llega directo a quien mantiene el sistema.
          </p>

          <form onSubmit={enviar} className="grid gap-3">
            <textarea value={mensaje} onChange={e => { setMensaje(e.target.value); setGracias(false); }}
              rows={5} className="campo" style={{ resize: 'vertical' }}
              placeholder="Qué pasó, dónde, y qué esperabas que pasara." />

            <div className="flex items-center gap-2 flex-wrap">
              <span className="rotulo rotulo-tenue">Qué tal va</span>
              <div className="grupo">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setNota(n === nota ? null : n)}
                          aria-pressed={nota === n}>{n}</button>
                ))}
              </div>
              <button type="submit" disabled={!mensaje.trim() || enviando}
                      className="b b-pri ml-auto">
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>

          {gracias && (
            <p className="entra mt-3" style={{ fontSize: 'var(--texto-md)', color: 'var(--color-ok)' }}>
              Recibido. No hay respuesta automática: lo lee una persona.
            </p>
          )}
          {error && (
            <p role="alert" className="entra mt-3"
               style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
          )}

          {mios.length > 0 && (
            <>
              <div className="rotulo rotulo-tenue mt-6 mb-2">Lo que has enviado</div>
              <div className="grid gap-2">
                {mios.map(m => (
                  <div key={m.id} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-sunk)' }}>
                    <div className="flex items-baseline gap-2">
                      <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--color-faint)' }}>
                        {diaCorto(m.created_at.slice(0, 10))}
                      </span>
                      {m.rating != null && <span className="marca">{m.rating}/5</span>}
                    </div>
                    <p className="mt-1" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-ink-2)' }}>
                      {m.message}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2" style={{ fontSize: 11, color: 'var(--color-faint)' }}>
                Solo tú ves esto: la base filtra por tu propia cuenta.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
