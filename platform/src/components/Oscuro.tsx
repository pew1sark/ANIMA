import { useEffect, type ReactNode } from 'react';

/* La barra del sistema (la de la hora y la batería, y la del navegador en
   Android) toma el color de `<meta name="theme-color">`. El portal la quiere
   negra; COMPANY y la consola, clara. Cada pantalla dice la suya al montarse. */
export function useBarra(color: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
    document.documentElement.style.backgroundColor = color;   // el rebote del scroll en iOS
  }, [color]);
}

/* El portal: la entrada oscura de ANIMA (ver `.portal` en index.css). Todo lo
   que va adentro hereda los colores invertidos sin tocar su propio código. */
export function Oscuro({ children, className = '' }: { children: ReactNode; className?: string }) {
  useBarra('#070708');
  return (
    <div className={`portal ${className}`}>
      <div className="portal-haces" aria-hidden="true" />
      {children}
    </div>
  );
}
