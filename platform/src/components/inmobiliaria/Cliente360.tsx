import { useEffect, useMemo, useState } from 'react';
import { cargarCliente360, buscar, type Cliente360, type GrupoBusqueda } from '@/services/inmobiliaria.service';
import { Cabecera } from '@/components/capital/Cifra';
import { dinero, cantidad, diaCorto, cuando } from '@/lib/formato';

/* CLIENT 360 · §16 a §18
   ---------------------------------------------------------------------------
   Todo lo que hay de un cliente en una pantalla. Las seis relaciones ya
   existían; lo que faltaba era juntarlas, y eso era justo lo que obligaba al
   corredor a recorrer pestañas para reconstruir una conversación.

   §18 pide no esconder información importante por límites visuales. Aquí eso
   se resuelve con pestañas y no con un acordeón: el recuento va EN la pestaña,
   así que se sabe qué hay dentro sin abrirla. Un acordeón cerrado con cinco
   contratos dentro y un acordeón cerrado vacío se ven igual, y eso es
   exactamente esconder.

   Las acciones del encabezado son enlaces del sistema operativo —tel:,
   WhatsApp, mailto:— y no un integrador: en una oficina donde se llama desde
   el móvil, abrir el marcador es la acción correcta y no hay nada que
   configurar. */

type Pestana = 'inmuebles' | 'leads' | 'negociaciones' | 'contratos' | 'visitas' | 'actividad';

const NOMBRE: Record<Pestana, string> = {
  inmuebles: 'Inmuebles', leads: 'Leads', negociaciones: 'Negociaciones',
  contratos: 'Contratos', visitas: 'Visitas', actividad: 'Bitácora'
};

export function FichaCliente360({ companyId }: { companyId: string }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<GrupoBusqueda[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [d, setD] = useState<Cliente360 | null>(null);
  const [pestana, setPestana] = useState<Pestana>('inmuebles');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* La búsqueda espera a que se deje de escribir. Sin esa pausa, escribir
     «Pamplona» dispara ocho consultas y llegan desordenadas. */
  useEffect(() => {
    if (texto.trim().length < 2) { setResultados([]); return; }
    let vivo = true;
    const t = setTimeout(() => {
      buscar(companyId, texto).then(g => {
        if (!vivo) return;
        setResultados(g.filter(x => x.entidad === 'Clientes'));
      }).catch(() => {});
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [companyId, texto]);

  useEffect(() => {
    if (!elegido) { setD(null); return; }
    let vivo = true;
    setCargando(true); setError(null);
    cargarCliente360(elegido)
      .then(r => vivo && setD(r))
      .catch(e => vivo && setError((e as Error).message ?? 'No se pudo cargar la ficha.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [elegido]);

  const cuenta: Record<Pestana, number> = useMemo(() => ({
    inmuebles: d?.inmuebles.length ?? 0,
    leads: d?.leads.length ?? 0,
    negociaciones: d?.negociaciones.length ?? 0,
    contratos: d?.contratos.length ?? 0,
    visitas: d?.visitas.length ?? 0,
    actividad: d?.actividad.length ?? 0
  }), [d]);

  const moneda = 'COP';
  const plata = (v: unknown) => (v == null || v === '' ? '—' : dinero(Number(v), moneda));

  return (
    <div className="grid gap-4 aparece">
      <Cabecera
        titulo="Ficha 360"
        nota="Todo lo que hay de un cliente en una pantalla: de dónde vino, qué busca, sus inmuebles, sus negociaciones, sus contratos y todo lo que se ha hablado."
        acciones={d && <button className="b b-sec b-sm" onClick={() => window.print()}>Imprimir</button>} />

      {/* ---------- elegir el cliente ---------- */}
      <section className="tarjeta p-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className="rotulo" style={{ fontSize: 10, color: 'var(--color-faint)' }}>
            Buscar por nombre, correo o teléfono
          </span>
          <input id="buscar-cliente-360" className="campo" value={texto} autoComplete="off"
                 placeholder="Ana, ana@…, 320 229…"
                 onChange={e => setTexto(e.target.value)} />
        </label>

        {texto.trim().length >= 2 && (
          resultados.length === 0 || resultados[0]!.resultados.length === 0 ? (
            <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
              Ningún cliente con eso. El teléfono se busca por dígitos, así que da igual
              cómo esté escrito.
            </p>
          ) : (
            <div className="grid gap-1">
              {resultados[0]!.resultados.map(r => (
                <button key={r.id} onClick={() => { setElegido(r.id); setTexto(''); setPestana('inmuebles'); }}
                        className="text-left rounded-xl px-3 py-2 toque"
                        style={{ background: elegido === r.id ? 'var(--color-sunk)' : 'transparent',
                                 border: '1px solid var(--color-line)' }}>
                  <b style={{ fontSize: 'var(--texto-md)' }}>{r.titulo}</b>
                  {r.detalle && (
                    <span className="block" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                      {r.detalle}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        )}
      </section>

      {error && (
        <p role="alert" className="entra tarjeta p-4"
           style={{ fontSize: 'var(--texto-md)', color: 'var(--color-danger)' }}>{error}</p>
      )}

      {cargando && <div className="tarjeta" style={{ height: 320 }} aria-busy="true" />}

      {!elegido && !cargando && (
        <div className="tarjeta p-8">
          <p className="titular" style={{ fontSize: 19 }}>Elige un cliente</p>
          <p className="subtitulo mt-1.5 max-w-[62ch]">
            La ficha reúne en un sitio lo que hoy está repartido entre Inventario, Leads,
            Negociaciones, Contratos y la bitácora. Busca por nombre, por correo o por
            teléfono —los dígitos bastan, aunque esté escrito con espacios o guiones—.
          </p>
        </div>
      )}

      {!cargando && d && (
        <>
          {/* ---------- encabezado del cliente ---------- */}
          <section className="tarjeta p-5 grid gap-4">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h1 className="titular" style={{ fontSize: 24 }}>{d.identidad.nombre}</h1>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1"
                   style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
                  <span>{d.identidad.tipo}</span>
                  {d.identidad.ciudad && <span>· {d.identidad.ciudad}</span>}
                  {d.identidad.razon_social && <span>· {d.identidad.razon_social}</span>}
                  <span>· cliente desde {diaCorto(d.identidad.desde)}</span>
                </p>
              </div>
              <span className={`marca ${d.identidad.estado === 'activo' ? 'marca-ok' : ''}`}>
                {d.identidad.estado}
              </span>
            </div>

            {/* Las acciones. Un teléfono que no se puede pulsar es un teléfono
                que se copia a mano, y copiar a mano es donde se pierde. */}
            <div className="flex flex-wrap gap-2 no-imprimir">
              {d.identidad.telefono && (
                <a className="b b-sec b-sm" href={`tel:${d.identidad.telefono.replace(/[^0-9+]/g, '')}`}>
                  Llamar
                </a>
              )}
              {(d.identidad.whatsapp || d.identidad.telefono) && (
                <a className="b b-sec b-sm" target="_blank" rel="noopener noreferrer"
                   href={`https://wa.me/${(d.identidad.whatsapp || d.identidad.telefono || '').replace(/[^0-9]/g, '')}`}>
                  WhatsApp
                </a>
              )}
              {d.identidad.email && (
                <a className="b b-sec b-sm" href={`mailto:${d.identidad.email}`}>Correo</a>
              )}
              <button className="b b-sec b-sm" onClick={() => setElegido(null)}>Otro cliente</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campos titulo="Contacto" filas={[
                ['Teléfono', d.identidad.telefono], ['WhatsApp', d.identidad.whatsapp],
                ['Correo', d.identidad.email], ['Persona de contacto', d.identidad.contacto],
                ['Dirección', d.identidad.direccion]]} />
              <Campos titulo="De dónde vino" filas={d.origen ? [
                ['Canal', d.origen.canal], ['Campaña', d.origen.campana],
                ['Qué buscaba', d.origen.operacion],
                ['Entró', diaCorto(d.origen.entrada)],
                ['Primer contacto', d.origen.primera_interaccion ? cuando(d.origen.primera_interaccion) : null]]
                : []} vacio="No llegó por un lead registrado." />
              <Campos titulo="Qué busca" filas={d.necesidad ? [
                ['Tipología', d.necesidad.busca], ['Zona', d.necesidad.zona],
                ['Presupuesto', d.necesidad.presupuesto ? plata(d.necesidad.presupuesto) : null],
                ['Forma de pago', d.necesidad.forma_pago], ['Subsidio', d.necesidad.subsidio],
                ['Proceso', d.necesidad.proceso]]
                : []} vacio="No tiene perfil de demanda: es propietario, no comprador." />
            </div>

            {d.identidad.notas && (
              <p className="rounded-xl px-3 py-2.5"
                 style={{ background: 'var(--color-sunk)', fontSize: 'var(--texto-md)' }}>
                {d.identidad.notas}
              </p>
            )}
          </section>

          {/* ---------- las cifras de la relación ---------- */}
          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Cifra l="Inmuebles"  v={cantidad(d.cifras.inmuebles)} />
            <Cifra l="Negociaciones" v={cantidad(d.cifras.negociaciones)} />
            <Cifra l="Ganadas"    v={cantidad(d.cifras.ganadas)} />
            <Cifra l="Comisión generada" v={plata(d.cifras.comision_generada)} />
            <Cifra l="Visitas"    v={cantidad(d.cifras.visitas)} />
            <Cifra l="Contratos vigentes" v={cantidad(d.cifras.contratos_vigentes)} />
          </div>

          {/* ---------- pestañas con su recuento ---------- */}
          <section className="tarjeta p-5">
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(Object.keys(NOMBRE) as Pestana[]).map(p => (
                <button key={p} onClick={() => setPestana(p)}
                        className={`b b-sm ${pestana === p ? 'b-pri' : 'b-sec'}`}>
                  {NOMBRE[p]} <b className="tabular-nums" style={{ opacity: .65 }}>{cuenta[p]}</b>
                </button>
              ))}
            </div>

            {cuenta[pestana] === 0
              ? <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
                  Nada en {NOMBRE[pestana].toLowerCase()} todavía.
                </p>
              : <Tabla filas={d[pestana]} moneda={moneda} />}
          </section>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- piezas */

const Campos = ({ titulo, filas, vacio }:
  { titulo: string; filas: [string, string | null | undefined][]; vacio?: string }) => {
  const hay = filas.filter(([, v]) => v != null && v !== '');
  return (
    <div>
      <div className="rotulo rotulo-tenue mb-2">{titulo}</div>
      {hay.length === 0
        ? <p style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
            {vacio ?? 'Sin datos.'}
          </p>
        : <dl className="grid gap-1" style={{ margin: 0 }}>
            {hay.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3" style={{ fontSize: 'var(--texto-md)' }}>
                <dt style={{ color: 'var(--color-muted)' }}>{k}</dt>
                <dd style={{ margin: 0, textAlign: 'right', wordBreak: 'break-word' }}>{v}</dd>
              </div>
            ))}
          </dl>}
    </div>
  );
};

const Cifra = ({ l, v }: { l: string; v: string }) => (
  <div className="tarjeta p-4">
    <div className="rotulo">{l}</div>
    <div className="cifra-grande mt-2">{v}</div>
  </div>
);

/* Una tabla que se dibuja desde las claves de la primera fila. Cada lista de
   la ficha tiene columnas distintas, y escribir seis tablas a mano para que
   las seis se comporten distinto habría sido peor que derivarlas. Las claves
   internas —`id`— se esconden; las de dinero se reconocen por nombre. */
const DINERO = new Set(['precio', 'precio_m2', 'valor', 'ingreso', 'canon', 'presupuesto']);
const FECHA  = new Set(['ingreso', 'venta', 'desde', 'vence', 'cuando', 'realizada',
                        'para_cuando', 'cierre', 'limite', 'hecha']);

function Tabla({ filas, moneda }: { filas: Record<string, unknown>[]; moneda: string }) {
  const claves = Object.keys(filas[0] ?? {}).filter(k => k !== 'id');
  const escribe = (k: string, v: unknown) => {
    if (v == null || v === '') return '—';
    if (DINERO.has(k) && k !== 'ingreso') return dinero(Number(v), moneda);
    if (k === 'ingreso') return dinero(Number(v), moneda);
    if (FECHA.has(k)) return diaCorto(String(v));
    return String(v);
  };
  return (
    <div className="desliza -mx-5 px-5">
      <table className="tabla">
        <thead>
          <tr>{claves.map((k, i) => (
            <th key={k} className={i === 0 ? 'ancla' : DINERO.has(k) ? 'num' : ''}>
              {k.replace(/_/g, ' ')}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={String(f.id ?? i)}>
              {claves.map((k, j) => (
                <td key={k} className={j === 0 ? 'ancla principal' : DINERO.has(k) ? 'num cifra' : ''}>
                  {escribe(k, f[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
