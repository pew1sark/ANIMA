import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/core/tenant/TenantContext';

/* Lo que hay que preguntar UNA vez para que la plataforma deje de ser genérica.
   Con esto los documentos salen con los datos de la empresa y las pantallas
   hablan de su negocio, no de "la organización".

   Se pide lo que de verdad se usa. Un formulario largo de puesta en marcha se
   abandona a la mitad; este cabe en una pantalla y dice cuánto falta. */

interface Ficha {
  nombre?: string; moneda?: string; pais?: string; zona?: string;
  estado?: string; linea?: string;
  razon_social?: string; rut?: string; giro?: string;
  direccion?: string; comuna?: string; region?: string;
  telefono?: string; correo?: string; sitio?: string;
  pie_documento?: string;
}

const MONEDAS = [
  { v: 'CLP', n: 'Peso chileno (CLP)' }, { v: 'USD', n: 'Dólar (USD)' },
  { v: 'EUR', n: 'Euro (EUR)' },         { v: 'ARS', n: 'Peso argentino (ARS)' },
  { v: 'PEN', n: 'Sol (PEN)' },          { v: 'MXN', n: 'Peso mexicano (MXN)' },
  { v: 'COP', n: 'Peso colombiano (COP)' }
];

const ZONAS = [
  'America/Santiago', 'America/Buenos_Aires', 'America/Lima',
  'America/Bogota', 'America/Mexico_City', 'Europe/Madrid'
];

/* Lo que hace falta para considerar la empresa puesta en marcha. No es
   caprichoso: son los datos que aparecen en un documento. */
const ESENCIALES: (keyof Ficha)[] = ['nombre', 'razon_social', 'rut', 'giro', 'direccion', 'comuna'];

export function PuestaEnMarcha({ companyId, puedeEditar }:
  { companyId: string; puedeEditar: boolean }) {
  const { recargar } = useTenant();
  const [f, setF] = useState<Ficha>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('ficha_empresa', { p_company: companyId }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError(e.message); else setF((data ?? {}) as Ficha);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [companyId]);

  const set = <K extends keyof Ficha>(k: K, v: Ficha[K]) => {
    setF(p => ({ ...p, [k]: v })); setListo(false);
  };

  const faltan = ESENCIALES.filter(k => !(f[k] ?? '').toString().trim());
  const completo = faltan.length === 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true); setError(null); setListo(false);
    const { data, error: err } = await supabase.rpc('guardar_ficha_empresa', {
      p_company: companyId, p_ficha: f
    });
    if (err) { setError(err.message); setGuardando(false); return; }
    setF((data ?? {}) as Ficha);
    setListo(true); setGuardando(false);
    recargar();          // el nombre se ve en el lateral: hay que releerlo
  }

  if (cargando) return <p className="text-[13px] text-muted">Cargando la ficha…</p>;

  return (
    <section className="grid gap-3 aparece">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <div className="rotulo">Puesta en marcha</div>
          <h2 className="titular mt-1.5" style={{ fontSize: 24 }}>
            {completo ? 'Tu empresa está configurada' : 'Cuéntanos de tu empresa'}
          </h2>
          <p className="text-[13px] text-muted mt-1.5 max-w-[62ch] leading-relaxed">
            {completo
              ? 'Estos datos son los que salen en tus documentos y los que ve tu equipo.'
              : `Faltan ${faltan.length} de ${ESENCIALES.length} datos esenciales. Con ellos, los documentos dejan de salir en blanco.`}
          </p>
        </div>
        <Progreso hechos={ESENCIALES.length - faltan.length} total={ESENCIALES.length} />
      </div>

      <form onSubmit={guardar} className="tarjeta p-5 grid gap-5">
        <Grupo titulo="Identidad" nota="Cómo se llama y cómo aparece en un documento.">
          <Campo label="Nombre corto" ayuda="El que se ve en la plataforma"
                 valor={f.nombre} onChange={v => set('nombre', v)} requerido editable={puedeEditar} />
          <Campo label="Razón social" ayuda="El nombre legal completo"
                 valor={f.razon_social} onChange={v => set('razon_social', v)} requerido editable={puedeEditar} />
          <Campo label="RUT" marcador="76.123.456-7"
                 valor={f.rut} onChange={v => set('rut', v)} requerido editable={puedeEditar} />
          <Campo label="Giro" ayuda="A qué se dedica" marcador="Venta al por mayor de alimentos"
                 valor={f.giro} onChange={v => set('giro', v)} requerido editable={puedeEditar} />
        </Grupo>

        <Grupo titulo="Dónde está" nota="Aparece en pedidos, entregas y documentos.">
          <Campo label="Dirección" valor={f.direccion} onChange={v => set('direccion', v)}
                 requerido editable={puedeEditar} ancho />
          <Campo label="Comuna" valor={f.comuna} onChange={v => set('comuna', v)}
                 requerido editable={puedeEditar} />
          <Campo label="Región" valor={f.region} onChange={v => set('region', v)} editable={puedeEditar} />
        </Grupo>

        <Grupo titulo="Cómo contactarla">
          <Campo label="Teléfono" valor={f.telefono} onChange={v => set('telefono', v)} editable={puedeEditar} />
          <Campo label="Correo" valor={f.correo} onChange={v => set('correo', v)} editable={puedeEditar} />
          <Campo label="Sitio web" valor={f.sitio} onChange={v => set('sitio', v)} editable={puedeEditar} />
        </Grupo>

        <Grupo titulo="Cómo opera" nota="Define en qué moneda se calcula y con qué hora se registra.">
          <label>
            <span className="rotulo block mb-1.5">Moneda</span>
            <select className="campo" disabled={!puedeEditar} value={f.moneda ?? 'CLP'}
                    onChange={e => set('moneda', e.target.value)}>
              {MONEDAS.map(m => <option key={m.v} value={m.v}>{m.n}</option>)}
            </select>
          </label>
          <label>
            <span className="rotulo block mb-1.5">Zona horaria</span>
            <select className="campo" disabled={!puedeEditar} value={f.zona ?? 'America/Santiago'}
                    onChange={e => set('zona', e.target.value)}>
              {ZONAS.map(z => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            <span className="rotulo block mb-1.5">País</span>
            <input className="campo" disabled={!puedeEditar} value={f.pais ?? ''}
                   onChange={e => set('pais', e.target.value)} placeholder="CL" />
          </label>
        </Grupo>

        <Grupo titulo="Pie de documento"
               nota="Lo que va al final de cada pedido o factura: condiciones, datos de transferencia, lo que sea.">
          <label className="sm:col-span-3">
            <textarea className="campo resize-y" rows={3} disabled={!puedeEditar}
                      value={f.pie_documento ?? ''} onChange={e => set('pie_documento', e.target.value)}
                      placeholder="Transferencias a … · Pago a 30 días · Gracias por su compra" />
          </label>
        </Grupo>

        {error && (
          <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                     rounded-xl px-3.5 py-2.5">{error}</p>
        )}
        {listo && !error && (
          <p className="entra text-[13px] text-ok bg-ok/10 border border-ok/20 rounded-xl px-3.5 py-2.5">
            Guardado. Tu empresa ya se llama así en toda la plataforma.
          </p>
        )}

        {puedeEditar ? (
          <button type="submit" disabled={guardando} className="b b-pri justify-self-end">
            {guardando ? 'Guardando…' : 'Guardar la ficha'}
          </button>
        ) : (
          <p className="text-[12.5px] text-faint">
            Solo un administrador puede cambiar estos datos.
          </p>
        )}
      </form>
    </section>
  );
}

/* Cuánto falta, sin barras de porcentaje que no dicen nada: los puntos que
   quedan por llenar. */
function Progreso({ hechos, total }: { hechos: number; total: number }) {
  return (
    <div className="ml-auto text-right">
      <div className="rotulo">Datos esenciales</div>
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${
            i < hechos ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </div>
      <div className="text-[11.5px] text-muted mt-2 tabular-nums">{hechos} de {total}</div>
    </div>
  );
}

const Grupo = ({ titulo, nota, children }:
  { titulo: string; nota?: string; children: React.ReactNode }) => (
  <fieldset className="border-t border-line pt-4 first:border-0 first:pt-0">
    <legend className="sr-only">{titulo}</legend>
    <div className="mb-3">
      <div className="rotulo">{titulo}</div>
      {nota && <p className="text-[12px] text-faint mt-1">{nota}</p>}
    </div>
    <div className="grid gap-4 sm:grid-cols-3">{children}</div>
  </fieldset>
);

const Campo = ({ label, valor, onChange, ayuda, marcador, requerido, editable, ancho }: {
  label: string; valor?: string; onChange: (v: string) => void;
  ayuda?: string; marcador?: string; requerido?: boolean; editable: boolean; ancho?: boolean;
}) => (
  <label className={ancho ? 'sm:col-span-2' : ''}>
    <span className="rotulo block mb-1.5">
      {label}{requerido && <span className="text-accent-deep ml-1">·</span>}
    </span>
    <input className="campo" value={valor ?? ''} disabled={!editable}
           placeholder={marcador} onChange={e => onChange(e.target.value)} />
    {ayuda && <span className="block text-[11.5px] text-faint mt-1">{ayuda}</span>}
  </label>
);
