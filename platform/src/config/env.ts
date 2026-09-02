/* Único punto donde se leen variables de entorno.
   Si falta una, la app falla al arrancar y no a mitad de una consulta. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env.local.`);
  return value;
}

/* El sitio de ANIMA vive un nivel arriba del build de la plataforma:
   /app/ → /. Se deduce de `base`, así que no hay una ruta
   escrita a mano que se pueda desincronizar. */
const SITIO = import.meta.env.BASE_URL.replace(/app\/?$/, '');

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  platformDomain: import.meta.env.VITE_PLATFORM_DOMAIN ?? 'localhost:5180',
  /** La portada pública. */
  sitio: SITIO,
  /** Donde SARK trabaja como artista: el ANIMA de siempre. */
  studio: SITIO + 'home.html'
} as const;
