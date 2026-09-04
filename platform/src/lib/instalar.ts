import { useEffect, useState } from 'react';

/* Instalar ANIMA como aplicación.
   ---------------------------------------------------------------------------
   El navegador no deja abrir el diálogo de instalación cuando uno quiere: lo
   ofrece él, una sola vez, con el evento `beforeinstallprompt`, y hay que
   guardarlo para usarlo después. Si no se guarda en cuanto llega, se pierde.

   Safari no lo dispara nunca —en iPhone se instala desde Compartir → Añadir a
   pantalla de inicio—, así que hay tres estados posibles y no dos: se puede
   instalar de un toque, ya está instalada, o hay que explicar cómo. */

type Prompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let guardado: Prompt | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();          // sin esto el navegador pone su propia barra
    guardado = e as Prompt;
    avisar();
  });
  window.addEventListener('appinstalled', () => { guardado = null; avisar(); });
}

export type EstadoInstalacion = 'instalable' | 'instalada' | 'a-mano';

function estadoActual(): EstadoInstalacion {
  if (typeof window === 'undefined') return 'a-mano';
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || (window.navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return 'instalada';
  return guardado ? 'instalable' : 'a-mano';
}

export function useInstalacion() {
  const [estado, setEstado] = useState<EstadoInstalacion>(estadoActual);

  useEffect(() => {
    const f = () => setEstado(estadoActual());
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, []);

  /** Abre el diálogo del navegador. Devuelve si la persona aceptó. */
  async function instalar(): Promise<boolean> {
    if (!guardado) return false;
    await guardado.prompt();
    const { outcome } = await guardado.userChoice;
    guardado = null; avisar();
    return outcome === 'accepted';
  }

  return { estado, instalar };
}

/** Las instrucciones para quien no tiene el diálogo (iPhone, sobre todo). */
export const COMO_INSTALAR = [
  'En iPhone o iPad: toca Compartir y luego "Añadir a pantalla de inicio".',
  'En Android: menú del navegador → "Instalar aplicación".',
  'En el computador: el icono de instalar, al final de la barra de direcciones.'
];
