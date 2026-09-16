import { useEffect, useRef, useState } from 'react';
import { buscar, type GrupoBusqueda } from '@/services/inmobiliaria.service';

/* BÚSQUEDA GLOBAL · §46
   ---------------------------------------------------------------------------
   Una caja para ocho entidades. Hoy cada pestaña tiene su buscador, lo que
   obliga a saber DÓNDE está algo antes de poder buscarlo — y un teléfono que
   suena no dice de qué pestaña es.

   Dos detalles que deciden si se usa o no:

   · El teléfono se busca por dígitos. En esta base la misma persona está
     escrita «320 229 6027», «3202296027» y «320-2296027»; comparar el texto
     tal cual encontraría una de las tres.

   · El resultado dice en qué PESTAÑA vive cada cosa, y llevar ahí es un clic.
     Un buscador que encuentra algo y no sabe llevarte es media herramienta. */

/* De qué entidad a qué pestaña del módulo inmobiliario. Los clientes viven en
   el módulo CRM, así que su destino es otro. */
const DONDE: Record<string, { modulo: string; pestana: string }> = {
  'Clientes':      { modulo: 'crm',        pestana: 'cliente360' },
  'Inventario':    { modulo: 'realestate', pestana: 'rei_properties' },
  'Demanda':       { modulo: 'realestate', pestana: 'rei_buyers' },
  'Leads':         { modulo: 'realestate', pestana: 'rei_leads' },
  'Negociaciones': { modulo: 'realestate', pestana: 'rei_deals' },
  'Contratos':     { modulo: 'realestate', pestana: 'rei_contracts' },
  'Oportunidades': { modulo: 'realestate', pestana: 'rei_opportunities' },
  'Desarrollos':   { modulo: 'realestate', pestana: 'rei_developments' }
};

export function BuscadorGlobal({ companyId, irA }:
  { companyId: string; irA: (modulo: string, pestana: string) => void }) {
  const [texto, setTexto] = useState('');
  const [grupos, setGrupos] = useState<GrupoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  /* Cerrar al pulsar fuera y con Escape. Un panel flotante que solo se cierra
     con su propio botón se queda tapando la pantalla. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  /* Espera a que se deje de escribir: sin la pausa, «Pamplona» dispara ocho
     consultas y llegan desordenadas. */
  useEffect(() => {
    if (texto.trim().length < 2) { setGrupos([]); return; }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(() => {
      buscar(companyId, texto)
        .then(g => { if (vivo) { setGrupos(g); setAbierto(true); } })
        .catch(() => {})
        .finally(() => { if (vivo) setBuscando(false); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); setBuscando(false); };
  }, [companyId, texto]);

  const total = grupos.reduce((a, g) => a + g.total, 0);

  return (
    <div ref={caja} className="relative min-w-0" style={{ flex: '1 1 180px', maxWidth: 320 }}>
      <input
        id="buscador-global"
        className="campo"
        value={texto}
        autoComplete="off"
        placeholder="Buscar cliente, inmueble, teléfono…"
        aria-label="Búsqueda global"
        onChange={e => setTexto(e.target.value)}
        onFocus={() => { if (grupos.length) setAbierto(true); }} />

      {abierto && texto.trim().length >= 2 && (
        <div className="entra absolute right-0 rounded-xl overflow-hidden"
             style={{ top: 'calc(100% + 6px)', width: 'min(420px, 88vw)', zIndex: 40,
                      background: 'var(--color-surface)', border: '1px solid var(--color-line)',
                      boxShadow: '0 12px 32px rgba(0,0,0,.14)', maxHeight: '70vh', overflowY: 'auto' }}>
          {buscando && (
            <p className="px-4 py-3" style={{ fontSize: 'var(--texto-sm)', color: 'var(--color-muted)' }}>
              Buscando…
            </p>
          )}

          {!buscando && total === 0 && (
            <p className="px-4 py-3" style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
              Nada con «{texto}». El teléfono se busca por dígitos, así que da igual cómo
              esté escrito.
            </p>
          )}

          {!buscando && grupos.map(g => (
            <div key={g.entidad} style={{ borderBottom: '1px solid var(--color-line)' }}>
              <div className="px-4 pt-3 pb-1.5 flex items-baseline justify-between gap-2">
                <span className="rotulo">{g.entidad}</span>
                <span style={{ fontSize: 11, color: 'var(--color-faint)' }}>
                  {g.total > g.resultados.length
                    ? `${g.resultados.length} de ${g.total}`
                    : g.total}
                </span>
              </div>
              {g.resultados.map(r => {
                const d = DONDE[g.entidad];
                return (
                  <button key={r.id} className="w-full text-left px-4 py-2 toque"
                          onClick={() => {
                            setAbierto(false); setTexto('');
                            if (d) irA(d.modulo, d.pestana);
                          }}>
                    <b style={{ fontSize: 'var(--texto-md)' }}>{r.titulo}</b>
                    {r.detalle && (
                      <span className="block" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                        {r.detalle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {!buscando && total > 0 && (
            <p className="px-4 py-2.5" style={{ fontSize: 11, color: 'var(--color-faint)' }}>
              Pulsa un resultado para ir a la pestaña donde vive.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
