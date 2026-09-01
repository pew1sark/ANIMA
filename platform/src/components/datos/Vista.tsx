import { useEffect, useMemo, useState } from 'react';
import { datosService } from '@/core/datos/datos.service';
import type { Campo, Esquema, Fila, Opcion } from '@/core/datos/tipos';
import { valor as leer } from '@/core/datos/tipos';
import { Muestra, Editor } from '@/components/datos/campos';
import { Ficha } from '@/components/datos/Ficha';

type Modo = 'tabla' | 'tablero';

/* Una entidad, dibujada. Tabla o tablero, buscador, edición en la propia celda
   y ficha completa — todo derivado del esquema, sin una línea escrita para
   esta entidad en particular. */
export function Vista({ esquema, companyId, puedeEditar }:
  { esquema: Esquema; companyId: string; puedeEditar: boolean }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [propios, setPropios] = useState<Campo[]>([]);
  const [opciones, setOpciones] = useState<Record<string, Opcion[]>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<Modo>('tabla');
  const [abierta, setAbierta] = useState<Fila | 'nueva' | null>(null);

  const campos = useMemo(() => [...esquema.campos, ...propios], [esquema, propios]);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null); setBusca(''); setModo('tabla');

    const relaciones = esquema.campos.filter(c => c.tipo === 'relacion');
    Promise.all([
      datosService.listar(esquema, companyId),
      /* Si los campos propios fallan, la vista sigue en pie sin ellos: perder
         una columna añadida es molesto, quedarse sin pantalla es peor. Pero se
         deja rastro — este silencio ya escondió un error una vez. */
      datosService.camposPropios(esquema.tabla, companyId)
        .catch(e => { console.warn('ANIMA: campos propios no disponibles', e); return [] as Campo[]; }),
      Promise.all(relaciones.map(async c => [c.key, await datosService.opcionesDe(c, companyId)] as const))
    ]).then(([f, p, rel]) => {
      if (!vivo) return;
      setFilas(f); setPropios(p);
      setOpciones(Object.fromEntries(rel));
    }).catch(e => vivo && setError(e.message ?? 'No se pudieron cargar los datos'))
      .finally(() => vivo && setCargando(false));

    return () => { vivo = false; };
  }, [esquema, companyId]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(f => campos.some(c => {
      const v = leer(f, c);
      if (v == null) return false;
      const lista = opciones[c.key] ?? c.opciones ?? [];
      const o = lista.find(x => x.valor === String(v));
      return (o ? o.nombre : String(v)).toLowerCase().includes(q);
    }));
  }, [filas, busca, campos, opciones]);

  async function guardar(valores: Record<string, unknown>) {
    if (abierta === 'nueva') {
      const nueva = await datosService.crear(esquema, companyId, valores, campos);
      setFilas(f => [nueva, ...f]);
    } else if (abierta) {
      const act = await datosService.actualizar(esquema, abierta, valores, campos);
      setFilas(f => f.map(x => x.id === act.id ? act : x));
    }
    setAbierta(null);
  }

  async function borrar() {
    if (!abierta || abierta === 'nueva') return;
    await datosService.borrar(esquema, abierta.id);
    setFilas(f => f.filter(x => x.id !== abierta.id));
    setAbierta(null);
  }

  /* Edición en la celda o arrastre en el tablero: se guarda al vuelo, y si la
     base lo rechaza se deshace en pantalla en vez de mentir. */
  async function cambiar(fila: Fila, campo: Campo, v: unknown) {
    const antes = filas;
    setFilas(f => f.map(x => x.id === fila.id
      ? (campo.propio === false
          ? { ...x, custom: { ...(x.custom ?? {}), [campo.key]: v } }
          : { ...x, [campo.key]: v })
      : x));
    try {
      const act = await datosService.actualizar(esquema, fila, { [campo.key]: v }, campos);
      setFilas(f => f.map(x => x.id === act.id ? act : x));
    } catch (e) {
      setFilas(antes);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio');
    }
  }

  const columnas = campos.filter(c => c.enTabla);
  const campoTablero = esquema.tablero
    ? campos.find(c => c.key === esquema.tablero) : undefined;

  return (
    <div className="grid gap-4 aparece">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{esquema.titulo}</h1>
          <p className="text-[13px] text-muted mt-1">
            {cargando ? 'Cargando…'
              : `${lista.length}${lista.length !== filas.length ? ` de ${filas.length}` : ''} ${
                  filas.length === 1 ? 'registro' : 'registros'}`}
          </p>
        </div>
        {puedeEditar && (
          <button onClick={() => setAbierta('nueva')}
            className="ml-auto text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition">
            Nuevo {esquema.singular.toLowerCase()}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder={`Buscar en ${esquema.titulo.toLowerCase()}…`}
          className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl border border-line bg-surface
                     text-sm outline-none focus:border-accent transition" />
        {campoTablero && (
          <div className="flex rounded-xl border border-line overflow-hidden">
            {(['tabla', 'tablero'] as Modo[]).map(m => (
              <button key={m} onClick={() => setModo(m)}
                className={`text-[12.5px] font-bold px-3.5 py-2 transition ${
                  modo === m ? 'bg-ink text-bg' : 'bg-surface text-muted hover:text-ink'}`}>
                {m === 'tabla' ? 'Tabla' : 'Tablero'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                   rounded-xl px-3.5 py-2.5">{error}</p>
      )}

      {!cargando && filas.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-[14px] font-bold">Todavía no hay {esquema.titulo.toLowerCase()}</p>
          {esquema.vacio && (
            <p className="text-[13px] text-muted mt-1 max-w-[56ch] mx-auto">{esquema.vacio}</p>
          )}
        </div>
      )}

      {!cargando && filas.length > 0 && modo === 'tabla' && (
        <Tabla columnas={columnas} filas={lista} opciones={opciones} puedeEditar={puedeEditar}
               abrir={setAbierta} cambiar={cambiar} />
      )}

      {!cargando && filas.length > 0 && modo === 'tablero' && campoTablero && (
        <Tablero campo={campoTablero} filas={lista} esquema={esquema} campos={campos}
                 opciones={opciones} puedeEditar={puedeEditar} abrir={setAbierta} cambiar={cambiar} />
      )}

      {abierta && (
        <Ficha esquema={esquema} campos={campos} opciones={opciones}
               fila={abierta === 'nueva' ? null : abierta}
               onGuardar={guardar}
               onBorrar={abierta !== 'nueva' && puedeEditar ? borrar : undefined}
               cerrar={() => setAbierta(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- tabla

function Tabla({ columnas, filas, opciones, puedeEditar, abrir, cambiar }: {
  columnas: Campo[]; filas: Fila[]; opciones: Record<string, Opcion[]>;
  puedeEditar: boolean;
  abrir: (f: Fila) => void;
  cambiar: (f: Fila, c: Campo, v: unknown) => void;
}) {
  const [editando, setEditando] = useState<{ id: string; key: string } | null>(null);
  const grid = { gridTemplateColumns: columnas.map(c => c.ancho ?? '1fr').join(' ') + ' 44px' };

  return (
    <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
      <div className="min-w-max">
        <div style={grid}
          className="grid gap-px bg-line border-b border-line sticky top-0 z-10">
          {columnas.map(c => (
            <div key={c.key} className="bg-sunk px-3 py-2.5 text-[10px] uppercase tracking-wider
                                        font-extrabold text-muted whitespace-nowrap">{c.label}</div>
          ))}
          <div className="bg-sunk" />
        </div>

        {filas.map(f => (
          <div key={f.id} style={grid}
               className="grid gap-px bg-line border-b border-line last:border-0 group">
            {columnas.map(c => {
              const editable = puedeEditar && c.enLinea && !c.soloLectura;
              const activa = editando?.id === f.id && editando.key === c.key;
              return (
                <div key={c.key}
                     onClick={() => editable && setEditando({ id: f.id, key: c.key })}
                     className={`bg-surface px-3 py-2 text-[13.5px] flex items-center min-w-0
                                 group-hover:bg-sunk/40 transition ${editable ? 'cursor-text' : ''}`}>
                  {activa
                    ? <Editor campo={c} valor={leer(f, c)} opciones={opciones[c.key]} compacto
                              onChange={v => cambiar(f, c, v)}
                              onListo={() => setEditando(null)} />
                    : <Muestra campo={c} valor={leer(f, c)} opciones={opciones[c.key]} />}
                </div>
              );
            })}
            <button onClick={() => abrir(f)}
              className="bg-surface grid place-items-center text-faint hover:text-accent
                         group-hover:bg-sunk/40 transition" title="Abrir ficha">→</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- tablero

function Tablero({ campo, filas, esquema, campos, opciones, puedeEditar, abrir, cambiar }: {
  campo: Campo; filas: Fila[]; esquema: Esquema; campos: Campo[];
  opciones: Record<string, Opcion[]>; puedeEditar: boolean;
  abrir: (f: Fila) => void;
  cambiar: (f: Fila, c: Campo, v: unknown) => void;
}) {
  const [encima, setEncima] = useState<string | null>(null);
  const columnas = opciones[campo.key] ?? campo.opciones ?? [];
  const principal = campos.find(c => c.key === esquema.principal);
  /* En la tarjeta van tres datos además del principal: más que eso deja de
     leerse de un vistazo, que es para lo único que sirve un tablero. */
  const resumen = campos.filter(c => c.enTabla && c.key !== campo.key && c.key !== esquema.principal).slice(0, 3);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columnas.map(col => {
        const dentro = filas.filter(f => String(leer(f, campo) ?? '') === col.valor);
        return (
          <div key={col.valor}
            onDragOver={e => { if (puedeEditar) { e.preventDefault(); setEncima(col.valor); } }}
            onDragLeave={() => setEncima(n => n === col.valor ? null : n)}
            onDrop={e => {
              e.preventDefault(); setEncima(null);
              const id = e.dataTransfer.getData('text/plain');
              const f = filas.find(x => x.id === id);
              if (f && String(leer(f, campo) ?? '') !== col.valor) cambiar(f, campo, col.valor);
            }}
            className={`w-[260px] shrink-0 rounded-2xl border p-2.5 transition ${
              encima === col.valor ? 'border-accent bg-accent/5' : 'border-line bg-sunk/40'}`}>

            <div className="flex items-center gap-2 px-1.5 py-1 mb-2">
              <b className="text-[11px] uppercase tracking-wider font-extrabold text-muted truncate">
                {col.nombre}
              </b>
              <span className="ml-auto text-[11px] tabular-nums text-faint">{dentro.length}</span>
            </div>

            <div className="grid gap-2">
              {dentro.map(f => (
                <div key={f.id} draggable={puedeEditar}
                  onDragStart={e => e.dataTransfer.setData('text/plain', f.id)}
                  onClick={() => abrir(f)}
                  className="rounded-xl border border-line bg-surface p-3 cursor-pointer toque
                             hover:border-accent">
                  <b className="block text-[13.5px] font-bold truncate">
                    {principal ? String(leer(f, principal) ?? '—') : f.id.slice(0, 8)}
                  </b>
                  <div className="grid gap-1 mt-1.5">
                    {resumen.map(c => (
                      <span key={c.key} className="text-[12px] text-muted flex items-center gap-1.5 min-w-0">
                        <span className="text-faint shrink-0">{c.label}:</span>
                        <Muestra campo={c} valor={leer(f, c)} opciones={opciones[c.key]} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {dentro.length === 0 && (
                <p className="text-[12px] text-faint px-1.5 py-3 text-center">Nada aquí</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
