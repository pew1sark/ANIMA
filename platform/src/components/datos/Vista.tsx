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

    /* También las de las líneas: sin esto el desplegable de producto dentro de
       un pedido sale vacío, que es exactamente donde más se necesita. */
    const relaciones = [...esquema.campos, ...(esquema.detalle?.campos ?? [])]
      .filter(c => c.tipo === 'relacion');
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

  /* Tras tocar una línea, el total del padre lo recalculó un trigger: lo que
     hay en pantalla ya no sirve y hay que volver a leerlo. */
  async function releerPadre() {
    if (!abierta || abierta === 'nueva') return;
    const fresca = await datosService.releer(esquema, abierta.id);
    if (!fresca) return;
    setFilas(f => f.map(x => x.id === fresca.id ? fresca : x));
    setAbierta(fresca);
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
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <div className="rotulo">{esquema.titulo}</div>
          <h1 className="titular mt-1.5">{tituloVivo(esquema, filas.length)}</h1>
          {/* El titular ya dice cuántos hay: aquí solo se habla cuando la
              búsqueda recortó la lista, que es cuando el número engaña. */}
          {(cargando || lista.length !== filas.length) && (
            <p className="text-[12.5px] text-muted mt-1.5">
              {cargando ? 'Cargando…' : `${lista.length} de ${filas.length} tras la búsqueda`}
            </p>
          )}
        </div>
        {puedeEditar && (
          <button onClick={() => setAbierta('nueva')} className="b b-pri ml-auto">
            <span className="text-[15px] leading-none">+</span>
            Nuevo {esquema.singular.toLowerCase()}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder={`Buscar en ${esquema.titulo.toLowerCase()}…`}
          className="campo flex-1 min-w-[220px] py-2.5" />
        {campoTablero && (
          <div className="grupo">
            {(['tabla', 'tablero'] as Modo[]).map(m => (
              <button key={m} onClick={() => setModo(m)} aria-pressed={modo === m}>
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
        <div className="tarjeta p-10 text-center">
          <p className="titular" style={{ fontSize: 22 }}>
            Todavía no hay {esquema.titulo.toLowerCase()}
          </p>
          {esquema.vacio && (
            <p className="text-[13.5px] text-muted mt-2.5 max-w-[54ch] mx-auto leading-relaxed">
              {esquema.vacio}
            </p>
          )}
          {puedeEditar && (
            <button onClick={() => setAbierta('nueva')} className="b b-pri mt-6">
              Crear el primero
            </button>
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
               companyId={companyId} puedeEditar={puedeEditar}
               fila={abierta === 'nueva' ? null : abierta}
               onGuardar={guardar}
               onBorrar={abierta !== 'nueva' && puedeEditar ? borrar : undefined}
               onLineas={releerPadre}
               cerrar={() => setAbierta(null)} />
      )}
    </div>
  );
}

/* El título dice de qué se está hablando, no solo cómo se llama la tabla.
   "6 pedidos" informa más que "Pedidos", y es lo primero que se mira. */
function tituloVivo(e: Esquema, n: number): string {
  if (n === 0) return e.titulo;
  return `${n} ${n === 1 ? e.singular.toLowerCase() : e.titulo.toLowerCase()}`;
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
    <div className="tarjeta overflow-x-auto">
      <div className="min-w-max">
        <div style={grid} className="grid bg-sunk border-b border-line sticky top-0 z-10">
          {columnas.map(c => (
            <div key={c.key} className="rotulo px-3.5 py-3 whitespace-nowrap">{c.label}</div>
          ))}
          <div />
        </div>

        {filas.map(f => (
          <div key={f.id} style={grid}
               className="grid border-b border-line last:border-0 group hover:bg-sunk/50 transition">
            {columnas.map(c => {
              const editable = puedeEditar && c.enLinea && !c.soloLectura;
              const activa = editando?.id === f.id && editando.key === c.key;
              return (
                <div key={c.key}
                     onClick={() => editable && setEditando({ id: f.id, key: c.key })}
                     className={`px-3.5 py-2.5 text-[13.5px] flex items-center min-w-0
                                 ${editable ? 'cursor-text' : ''}`}>
                  {activa
                    ? <Editor campo={c} valor={leer(f, c)} opciones={opciones[c.key]} compacto
                              onChange={v => cambiar(f, c, v)}
                              onListo={() => setEditando(null)} />
                    : <Muestra campo={c} valor={leer(f, c)} opciones={opciones[c.key]} />}
                </div>
              );
            })}
            <button onClick={() => abrir(f)} title="Abrir ficha"
              className="grid place-items-center text-faint hover:text-accent transition">→</button>
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
            className={`w-[264px] shrink-0 rounded-2xl border p-2.5 transition ${
              encima === col.valor ? 'border-accent bg-accent/5' : 'border-line bg-sunk/40'}`}>

            <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
              <span className="rotulo truncate">{col.nombre}</span>
              <span className="ml-auto text-[11px] tabular-nums text-faint">{dentro.length}</span>
            </div>

            <div className="grid gap-2">
              {dentro.map(f => (
                <div key={f.id} draggable={puedeEditar}
                  onDragStart={e => e.dataTransfer.setData('text/plain', f.id)}
                  onClick={() => abrir(f)}
                  className="rounded-xl border border-line bg-surface p-3.5 cursor-pointer toque
                             hover:border-accent shadow-[0_1px_2px_rgba(0,0,0,.03)]">
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
