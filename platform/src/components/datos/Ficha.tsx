import { useState, type FormEvent } from 'react';
import type { Campo, Esquema, Fila, Opcion } from '@/core/datos/tipos';
import { valor as leer } from '@/core/datos/tipos';
import { Editor } from '@/components/datos/campos';
import { Lineas } from '@/components/datos/Lineas';

/* La ficha de una fila. No está escrita a mano: sale del esquema, así que un
   campo nuevo —incluidos los que agregue la propia empresa— aparece aquí sin
   tocar este archivo. */
export function Ficha({ esquema, campos, fila, opciones, companyId, puedeEditar,
                        onGuardar, onBorrar, onLineas, cerrar }: {
  esquema: Esquema;
  campos: Campo[];
  fila: Fila | null;
  opciones: Record<string, Opcion[]>;
  companyId: string;
  puedeEditar: boolean;
  onGuardar: (valores: Record<string, unknown>) => Promise<void>;
  onBorrar?: () => Promise<void>;
  /** Una línea cambió: hay que releer el padre, porque el total lo hizo la base. */
  onLineas?: () => void;
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

  const bloques = agrupa(escribibles);

  return (
    <div className="panel-fondo entra" onClick={cerrar}>
      {/* Tres partes: cabecera fija, cuerpo que se desplaza, pie fijo. Cuando
          todo se desplazaba junto —como estaba— un formulario largo dejaba
          fuera de vista el título y el botón de guardar: había que subir a
          ciegas para saber qué se estaba llenando. Las clases ya existían en
          `index.css`; lo que faltaba era usarlas. */}
      <form onClick={e => e.stopPropagation()} onSubmit={guardar}
            className="panel max-w-2xl aparece">

        <header className="panel-cab">
          <div className="min-w-0">
            <h2 className="titular truncate" style={{ fontSize: 22 }}>
              {fila ? String(leer(fila, campos.find(c => c.key === esquema.principal)!) ?? esquema.singular)
                    : `${esquema.femenino ? 'Nueva' : 'Nuevo'} ${esquema.singular.toLowerCase()}`}
            </h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              {fila ? esquema.singular : 'Solo lo marcado con * hace falta ahora.'}
            </p>
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar"
            className="ml-auto shrink-0 text-[13px] text-muted hover:text-ink transition">Cerrar</button>
        </header>

        <div className="panel-cuerpo">
          {bloques.map((b, i) => (
            <section key={b.nombre ?? i} className="grid gap-3">
              {b.nombre && (
                <h3 className="rotulo rotulo-tenue"
                    style={{ borderTop: i > 0 ? '1px solid var(--color-line)' : undefined,
                             paddingTop: i > 0 ? 16 : 0 }}>
                  {b.nombre}
                </h3>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {b.campos.map(c => (
                  <label key={c.key} className={c.tipo === 'texto-largo' ? 'sm:col-span-2' : ''}>
                    <span className="rotulo block mb-1.5">
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
            </section>
          ))}

          {/* Las líneas solo existen si el documento ya existe: necesitan su id. */}
          {esquema.detalle && fila && (
            <Lineas detalle={esquema.detalle} padreId={fila.id} companyId={companyId}
                    opciones={opciones} puedeEditar={puedeEditar}
                    alCambiar={() => onLineas?.()} />
          )}
          {esquema.detalle && !fila && (
            <p className="text-[12.5px] text-muted bg-sunk rounded-xl px-4 py-3">
              Guarda primero y podrás agregarle {esquema.detalle.titulo.toLowerCase()}.
            </p>
          )}

          {calculados.length > 0 && (
            <div className="rounded-2xl bg-sunk px-4 py-3">
              <p className="rotulo mb-2">Lo calcula la base</p>
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
        </div>

        <footer className="panel-pie">
          {onBorrar && fila && (
            confirmando ? (
              <span className="flex items-center gap-2">
                <button type="button" onClick={borrar} disabled={guardando}
                  className="b b-sm" style={{ background: 'var(--color-danger)', color: '#fff' }}>
                  Sí, eliminar
                </button>
                <button type="button" onClick={() => setConfirmando(false)} className="b b-fan b-sm">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmando(true)} className="b b-mal b-sm">
                Eliminar
              </button>
            )
          )}
          {/* El error va en el pie y no en el cuerpo: si va arriba, en un
              formulario largo se guarda, no pasa nada visible, y hay que subir
              a buscar por qué. */}
          {error && (
            <p role="alert" className="entra text-[12.5px] text-danger min-w-0 flex-1">{error}</p>
          )}
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={cerrar} className="b b-sec">Cancelar</button>
            <button type="submit" disabled={guardando} className="b b-pri">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </span>
        </footer>
      </form>
    </div>
  );
}

/* Cómo se ordena un formulario largo.
   ---------------------------------------------------------------------------
   La ficha de un cliente tiene diecisiete campos. Puestos en fila, todos con
   el mismo peso, hay que leerlos enteros para encontrar el teléfono.

   Si el esquema declara `grupo`, manda esa declaración. Si no, se parte en dos
   por un criterio que ya existía: lo que sale en la tabla o es obligatorio es
   lo que se mira siempre; el resto se agrupa debajo bajo un encabezado. */
function agrupa(campos: Campo[]): { nombre: string | null; campos: Campo[] }[] {
  if (campos.some(c => c.grupo)) {
    const orden: string[] = [];
    const por = new Map<string, Campo[]>();
    for (const c of campos) {
      const g = c.grupo ?? '';
      if (!por.has(g)) { por.set(g, []); orden.push(g); }
      por.get(g)!.push(c);
    }
    return orden.map(g => ({ nombre: g || null, campos: por.get(g)! }));
  }

  const principales = campos.filter(c => c.enTabla || c.requerido);
  const resto = campos.filter(c => !(c.enTabla || c.requerido));
  if (resto.length === 0) return [{ nombre: null, campos: principales }];
  if (principales.length === 0) return [{ nombre: null, campos: resto }];
  return [
    { nombre: null, campos: principales },
    { nombre: 'Más datos', campos: resto }
  ];
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
