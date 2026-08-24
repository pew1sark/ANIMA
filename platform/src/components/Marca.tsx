export function Marca({ sub = 'Plataforma' }: { sub?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-[10px] grid place-items-center border border-line bg-sunk text-accent-deep shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3l7 4v10l-7 4-7-4V7zM12 8l3.5 2v4L12 16l-3.5-2v-4z" />
        </svg>
      </span>
      <span className="leading-tight">
        <b className="block text-[15px] font-extrabold tracking-tight">ANIMA</b>
        <span className="text-[10px] uppercase tracking-[.12em] font-extrabold text-accent-deep">{sub}</span>
      </span>
    </span>
  );
}
