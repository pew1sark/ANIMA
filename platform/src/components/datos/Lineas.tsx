import { useEffect, useState } from 'react';
import { datosService } from '@/core/datos/datos.service';
import type { Detalle, Fila, Opcion } from '@/core/datos/tipos';
import { Editor, Muestra, money } from '@/components/datos/campos';

/* Las líneas de un documento: los productos de un pedido, los ítems de una
   compra. Aquí es donde el sistema se sincroniza de verdad — cada línea que
   entra o sale dispara los triggers que recalculan el total del padre, y por
   eso al terminar se vuelve a leer el padre en vez de sumar por nuestra cuenta.

   Sumar en el frontend sería más rápido de escribir y estaría mal: la base
   redondea, aplica descuentos y usa la cantidad preparada cuando existe. Que
   haya un solo lugar donde se calcula es lo que evita que dos pantallas
   muestren dos totales distintos del mismo pedido. */
export function Lineas({ detalle, padreId, companyId, opciones, puedeEditar, alCambiar }: {
  detalle: Detalle;
  padreId: string;
  companyId: string;
  opciones: Record<string, Opcion[]>;
  puedeEditar: boolean;
  alCambiar: () => void;
}) {
  const [lineas, setLineas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState<Record<string, unknown> | null>(null);
  const [obrando, setObrando] = useState(false);

  const editables = detalle.campos.filter(c => !c.soloLectura);

  useEffect(() => {
    let vivo = true;
    datosService.lineas(detalle, padreId)
      .then(l => vivo && setLineas(l))
      .catch(e => vivo && setError(msg(e)))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [detalle, padreId]);

  async function agregar() {
    if (!nueva) return;
    const falta = editables.find(c => c.requerido && (nueva[c.key] == null || nueva[c.key] === ''));
    if (falta) { setError(`Falta ${falta.label.toLowerCase()}.`); return; }
    setObrando(true); setError(null);
    try {
      const l = await datosService.agregarLinea(detalle, companyId, padreId, nueva);
      setLineas(x => [...x, l]);
      setNueva(vacia(detalle));
      alCambiar();                 // el total del padre acaba de cambiar
    } catch (e) { setError(msg(e)); }
    finally { setObrando(false); }
  }

  async function quitar(id: string) {
    setObrando(true); setError(null);
    try {
      await datosService.borrarLinea(detalle, id);
      setLineas(x => x.filter(l => l.id !== id));
      alCambiar();
    } catch (e) { setError(msg(e)); }
    finally { setObrando(false); }
  }

  const suma = detalle.total
    ? lineas.reduce((a, l) => a + Number(l[detalle.total!] ?? 0), 0)
    : null;

  return (
    <section className="rounded-2xl border border-line bg-sunk/50 p-4 grid gap-3">
      <div className="flex items-baseline gap-3">
        <h3 className="rotulo">{detalle.titulo}</h3>
        <span className="text-[11.5px] text-faint">{lineas.length}</span>
        {suma != null && (
          <span className="ml-auto text-[15px] cifra">{money(suma)}</span>
        )}
      </div>

      {cargando && <p className="text-[13px] text-muted">Cargando…</p>}

      {!cargando && lineas.length === 0 && !nueva && (
        <p className="text-[13px] text-muted">
          Sin {detalle.titulo.toLowerCase()} todavía. El total se calcula a partir de esto.
        </p>
      )}

      {lineas.length > 0 && (
        <div className="grid gap-1.5">
          {lineas.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface
                                       border border-line text-[13px]">
              {detalle.campos.filter(c => c.enTabla).map(c => (
                <span key={c.key} className={c.key === detalle.campos[0]?.key ? 'flex-1 min-w-0' : 'shrink-0'}>
                  <Muestra campo={c} valor={l[c.key]} opciones={opciones[c.key]} />
                </span>
              ))}
              {detalle.total && (
                <span className="tabular-nums font-bold shrink-0">{money(l[detalle.total])}</span>
              )}
              {puedeEditar && (
                <button type="button" onClick={() => quitar(l.id)} disabled={obrando}
                  className="shrink-0 text-faint hover:text-danger transition disabled:opacity-40"
                  title="Quitar línea">×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="entra text-[12.5px] text-danger bg-danger/10 border border-danger/20
                                   rounded-xl px-3 py-2">{error}</p>
      )}

      {puedeEditar && (nueva ? (
        <div className="rounded-xl border border-accent bg-surface p-3 grid gap-2.5 entra">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {editables.map(c => (
              <label key={c.key}>
                <span className="rotulo block mb-1">
                  {c.label}{c.requerido && <span className="text-danger ml-1">*</span>}
                </span>
                <Editor campo={c} valor={nueva[c.key]} opciones={opciones[c.key]}
                        onChange={v => setNueva(p => ({ ...p!, [c.key]: v }))} />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => { setNueva(null); setError(null); }}
              className="b b-fan b-sm">Cancelar</button>
            <button type="button" onClick={agregar} disabled={obrando} className="b b-pri b-sm">
              {obrando ? 'Agregando…' : 'Agregar'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setNueva(vacia(detalle)); setError(null); }}
          className="b b-sec b-sm justify-self-start">
          <span className="text-[14px] leading-none">+</span> Agregar {detalle.singular.toLowerCase()}
        </button>
      ))}
    </section>
  );
}

function vacia(d: Detalle): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const c of d.campos) if (!c.soloLectura) v[c.key] = c.porDefecto ?? null;
  return v;
}

function msg(e: unknown): string {
  const m = e instanceof Error ? e.message
    : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
    : String(e);
  if (/violates row-level security/i.test(m)) return 'Tu rol no alcanza para cambiar estas líneas.';
  return m;
}
