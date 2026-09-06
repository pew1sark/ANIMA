import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { fijarMoneda } from '@/lib/formato';
import { pestanasDe } from '@/core/modules/pestanas';
import { LevantamientoCapital } from '@/components/capital/Levantamiento';
import { PanelCapital } from '@/components/capital/Panel';
import { ModeloFinanciero } from '@/components/capital/Modelo';
import { PresupuestoVsReal } from '@/components/capital/Presupuesto';
import { MODULES } from '@/core/modules/registry';

/* La vitrina. Las cuatro pantallas de Capital Intelligence con datos falsos,
   dentro de una caja del mismo ancho que el espacio de trabajo real, para
   poder trabajar el diseño sin iniciar sesión.

   Reproduce a propósito el marco de `Espacio`: el ancho máximo, el borde de la
   cabecera y las pestañas del módulo. Sin eso, cualquier decisión de diseño
   tomada aquí se ve distinta al llegar a la aplicación. */

fijarMoneda('USD');

const VISTAS = pestanasDe('capital')
  .filter(p => p.tipo === 'capital') as Extract<ReturnType<typeof pestanasDe>[number], { tipo: 'capital' }>[];

function Vitrina() {
  const [i, setI] = useState(0);
  const [ancho, setAncho] = useState<'ancho' | 'angosto'>('ancho');
  const activa = VISTAS[i]!;
  const def = MODULES.capital;

  return (
    <div className="min-h-full">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-line bg-surface/80
                         backdrop-blur sticky top-0 z-20">
        <b className="text-[13.5px] font-bold">Vitrina · {def.name}</b>
        <span className="text-[12.5px] text-faint">datos falsos, sin Supabase</span>
        <span className="ml-auto" />
        <button className="b b-sec b-sm" onClick={() => setAncho(a => a === 'ancho' ? 'angosto' : 'ancho')}>
          {ancho === 'ancho' ? 'Probar angosto (720px)' : 'Volver a ancho'}
        </button>
      </header>

      <main className="p-6 grid gap-8"
            style={{ maxWidth: ancho === 'ancho' ? 1180 : 720 }}>
        <div className="grid gap-4">
          {/* Igual que `Modulo` en la aplicación: con pestañas, la descripción
              del módulo no se repite — cada pestaña trae la suya. */}
          <div className="aparece"><div className="rotulo">{def.name}</div></div>

          <div role="tablist" className="flex gap-1 flex-wrap"
               style={{ borderBottom: '1px solid var(--color-line)', paddingBottom: 12 }}>
            {VISTAS.map((p, n) => (
              <button key={p.id} role="tab" aria-selected={n === i}
                      onClick={() => setI(n)} className="pest">{p.nombre}</button>
            ))}
          </div>

          {activa.vista === 'levantamiento' && <LevantamientoCapital companyId="x" puedeEditar />}
          {activa.vista === 'panel' && <PanelCapital companyId="x" />}
          {activa.vista === 'modelo' && <ModeloFinanciero companyId="x" puedeEditar />}
          {activa.vista === 'presupuesto' && <PresupuestoVsReal companyId="x" />}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Vitrina /></StrictMode>);
