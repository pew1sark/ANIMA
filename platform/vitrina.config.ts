import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

/* La vitrina. Monta las pantallas de Capital Intelligence con datos falsos y
   sin Supabase, para poder trabajar el diseño sin iniciar sesión y sin tocar
   datos de nadie.

   No entra en el build de producción: `vite build` compila desde index.html y
   este archivo no lo referencia. Se abre con:

     npx vite --config vitrina.config.ts

   El truco es una sola línea: `@/services/capital.service` apunta al doble.
   Las pantallas no se enteran. */
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      { find: /^@\/services\/capital\.service$/,
        replacement: path.resolve(__dirname, './src/vitrina/capital.doble.ts') },
      { find: '@', replacement: path.resolve(__dirname, './src') }
    ]
  },
  server: { port: 5199, open: false }
});
