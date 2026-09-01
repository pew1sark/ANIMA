import { useState, type FormEvent } from 'react';
import type { Campo, Esquema, Fila, Opcion } from '@/core/datos/tipos';
import { valor as leer } from '@/core/datos/tipos';
import { Editor } from '@/components/datos/campos';

/* La ficha de una fila. No está escrita a mano: sale del esquema, así que un
   campo nuevo —incluidos los que agregue la propia empresa— aparece aquí sin
   tocar este archivo. */
export function Ficha({ esquema, campos, fila, opciones, onGuardar, onBorrar, cerrar }: {
  esquema: Esquema;
  campos: Campo[];
  fila: Fila | null;
  opciones: Record<string, Opcion[]>;
  onGuardar: (valores: Record<string, unknown>) => Promise<void>;
  onBorrar?: () => Promise<void>;
  cerrar: () => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => inicial(campos, fila));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const escribibles = campos.filter(c => !c.soloLectura);
  const calculados  = campos.filter(c => c.soloLectura && fila);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const falta = escribibles.find(c => c.requerido && (v[c.key] == null || v[c.key] === ''));
    if (falta) { setError(`Falta ${falta.label.toLowerCase()}.`); return; }
    setGuardando(true); setError(null);
    try { await onGuardar(v); }
    catch (err) { setError(mensaje(err)); setGuardando(false); }
  }

  async function borrar() {
    if (!onBorrar) return;
    setGuardando(true); setError(null);
    try { await onBorrar(); }
    catch (err) { setError(mensaje(err)); setGuardando(false); setConfirmando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-ink/25 backdrop-blur-sm entra"
         onClick={cerrar}>
      <form onClick={e => e.stopPropagation()} onSubmit={guardar}
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-surface border border-line
                   rounded-3xl p-6 shadow-[0_24px_60px_rgba(0,0,0,.14)] grid gap-5 aparece">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold tracking-tight truncate">
              {fila ? String(leer(fila, campos.find(c => c.key === esquema.principal)!) ?? esquema.singular)
                    : `Nuevo ${esquema.singular.toLowerCase()}`}
            </h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              {fila ? esquema.singular : 'Solo lo marcado como obligatorio hace falta ahora.'}
            </p>
          </div>
          <button type="button" onClick={cerrar}
            className="ml-auto text-[13px] text-muted hover:text-ink transition">Cerrar</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {escribibles.map(c => (
            <label key={c.key} className={c.tipo === 'texto-largo' ? 'sm:col-span-2' : ''}>
              <span className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">
                {c.label}
                {c.requerido && <span className="text-danger ml-1">*</span>}
                {c.propio === false && (
                  <span className="ml-2 normal-case tracking-normal text-faint font-bold">· propio</span>
                )}
              </span>
              <Editor campo={c} valor={v[c.key]} opciones={opciones[c.key]}
                      onChange={x => setV(p => ({ ...p, [c.key]: x }))} />
              {c.ayuda && <span className="block text-[11.5px] text-faint mt-1">{c.ayuda}</span>}
            </label>
          ))}
        </div>

        {calculados.length > 0 && (
          <div className="rounded-2xl bg-sunk px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted mb-2">
              Lo calcula la base
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              {calculados.map(c => (
                <span key={c.key} className="text-[12.5px]">
                  <span className="text-muted">{c.label}: </span>
                  <b className="tabular-nums">{textoDe(c, leer(fila!, c))}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                     rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {onBorrar && fila && (
            confirmando ? (
              <span className="flex items-center gap-2">
                <button type="button" onClick={borrar} disabled={guardando}
                  className="text-[13px] font-bold px-4 py-2 rounded-full bg-danger text-white
                             disabled:opacity-45 hover:opacity-90 transition">
                  Sí, eliminar
                </button>
                <button type="button" onClick={() => setConfirmando(false)}
                  className="text-[13px] text-muted hover:text-ink transition">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmando(true)}
                className="text-[13px] font-bold px-4 py-2 rounded-full border border-line
                           text-danger hover:border-danger transition">
                Eliminar
              </button>
            )
          )}
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={cerrar}
              className="text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="text-[13px] font-bold px-5 py-2 rounded-full bg-ink text-bg
                         disabled:opacity-45 hover:opacity-90 transition">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

function inicial(campos: Campo[], fila: Fila | null): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const c of campos) {
    if (c.soloLectura) continue;
    v[c.key] = fila ? (leer(fila, c) ?? null) : (c.porDefecto ?? null);
  }
  return v;
}

function textoDe(c: Campo, x: unknown) {
  if (x == null) return '—';
  if (c.tipo === 'moneda') return '$' + Math.round(Number(x)).toLocaleString('es-CL');
  return String(x);
}

/* Los mensajes de PostgreSQL son precisos pero no están escritos para nadie.
   Se traducen los que de verdad aparecen.

   Ojo con el `String(err)`: los errores de supabase-js son objetos planos, no
   instancias de Error, así que sin esto la persona veía "[object Object]". */
function mensaje(err: unknown): string {
  const m = err instanceof Error ? err.message
    : (err && typeof err === 'object' && 'message' in err)
      ? String((err as { message: unknown }).message)
      : String(err);
  if (/null value in column "(\w+)"/.test(m)) {
    const col = m.match(/null value in column "(\w+)"/)?.[1];
    return `Falta un valor obligatorio${col ? ` en ${col}` : ''}.`;
  }
  if (/duplicate key|unique/i.test(m)) return 'Ya existe una fila con ese valor único.';
  if (/violates foreign key/i.test(m)) return 'Hay algo que depende de esta fila: no se puede eliminar.';
  if (/violates row-level security/i.test(m)) return 'Tu rol no alcanza para hacer este cambio.';
  return m;
}
