/// <reference types="vite/client" />

/* Declarar las variables aquí hace que TypeScript avise si se usa
   una que no existe, en vez de descubrirlo en tiempo de ejecución. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PLATFORM_DOMAIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
