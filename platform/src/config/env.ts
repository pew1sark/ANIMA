/* Único punto donde se leen variables de entorno.
   Si falta una, la app falla al arrancar y no a mitad de una consulta. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env.local.`);
  return value;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  platformDomain: import.meta.env.VITE_PLATFORM_DOMAIN ?? 'localhost:5180'
} as const;
