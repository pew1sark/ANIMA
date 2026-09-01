/* La marca de ANIMA: la misma ∧ de la portada, trazada, sin caja ni relleno.
   Es el único logo del sistema — si cambia, cambia aquí y en index.html del
   sitio, y en ningún otro sitio más.

   Cuando una organización sube el suyo, ANIMA no se pelea con él: cede la
   cabecera y baja al pie como "Powered by ANIMA TSC" (ver <PieAnima>). */
export function Apex({ className = 'w-[22px] h-[22px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={className}>
      <path d="M18 82 L50 20 L82 82" stroke="currentColor" strokeWidth="7"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Marca({ sub = 'TSC' }: { sub?: string }) {
  return (
    <span className="flex items-center gap-3">
      <Apex className="w-[26px] h-[26px] text-ink shrink-0" />
      <span className="leading-none">
        <b className="block text-[15px] font-extrabold tracking-[.14em]">ANIMA</b>
        <span className="block mt-1 text-[9px] uppercase tracking-[.3em] font-bold text-muted">{sub}</span>
      </span>
    </span>
  );
}

/* El logo de la organización, si lo subió. Si no, sus iniciales. Minimalista a
   propósito: es la marca del cliente, no un banner. */
export function MarcaCliente({ nombre, logo, sub }:
  { nombre: string; logo?: string | null; sub?: string | null }) {
  return (
    <span className="flex items-center gap-3 min-w-0">
      {logo
        ? <img src={logo} alt={nombre}
               className="w-8 h-8 rounded-lg object-contain bg-surface shrink-0" />
        : <span className="w-8 h-8 rounded-lg grid place-items-center bg-accent/12 text-accent-deep
                           font-extrabold text-[12px] shrink-0">
            {nombre.slice(0, 2).toUpperCase()}
          </span>}
      <span className="min-w-0 leading-tight">
        <b className="block text-[13.5px] font-bold truncate">{nombre}</b>
        {sub && <span className="block text-[10px] uppercase tracking-[.14em] font-extrabold text-muted truncate">{sub}</span>}
      </span>
    </span>
  );
}

/* El pie. Donde manda la marca del cliente, ANIMA firma abajo y en pequeño. */
export function PieAnima({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[10.5px] text-faint ${className}`}>
      <Apex className="w-[11px] h-[11px]" />
      <span className="tracking-[.08em]">Powered by <b className="font-bold">ANIMA TSC</b></span>
    </p>
  );
}
