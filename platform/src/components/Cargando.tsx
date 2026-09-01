/* Esperar se ve igual en todo ANIMA.
   Es la misma figura que dibuja el sitio en `showBootLoader()` (anima.js, con
   estilos en assets/css/studio.css): la marca ∧ trazándose y el nombre debajo.
   Si cambia una, cambian las dos — es una sola espera para un solo sistema. */
export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite"
         className="min-h-full grid place-content-center justify-items-center gap-4">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="w-[42px] h-[42px] anima-cargando">
        <path d="M18 82 L50 20 L82 82" />
      </svg>
      <div className="text-[12.5px] font-semibold tracking-[.36em] pl-[.36em] text-ink">ANIMA</div>
      <div className="text-[9.5px] uppercase tracking-[.3em] text-muted font-mono">{texto}</div>
    </div>
  );
}
