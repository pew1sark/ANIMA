import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

/* Compilar sin las variables NO puede salir bien en silencio.
   ---------------------------------------------------------------------------
   `config/env.ts` llama a `required()` al evaluarse el módulo, así que un
   bundle compilado sin `VITE_SUPABASE_URL` lanza en la primera línea que
   ejecuta el navegador: pantalla en blanco, sin nada en la interfaz que diga
   por qué. Vite, por su parte, reemplaza la variable ausente por `undefined`
   sin chistar y reporta el build como exitoso.

   Eso ya ocurrió: un build hecho en una máquina sin `.env.local` se publicó
   y dejó /app/ en blanco. La compilación se veía perfecta.

   Así que el build para producción falla aquí, con el nombre de lo que falta
   y dónde ponerlo. Un error en la terminal de quien compila es infinitamente
   más barato que uno en el navegador de quien usa la plataforma. */
function exigirVariables(mode: string) {
  const env = loadEnv(mode, __dirname, '');
  const faltan = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
    .filter(k => !env[k] && !process.env[k]);
  if (faltan.length > 0) {
    throw new Error(
      `No se puede compilar sin ${faltan.join(' ni ')}.\n` +
      `El bundle saldría y el navegador lo rechazaría al arrancar, sin decir por qué.\n` +
      `Copia platform/.env.example a platform/.env.local y rellena los valores.`);
  }
}

export default defineConfig(({ command, mode }) => {
  /* Solo al compilar. En `dev` el servidor arranca y la pantalla muestra el
     error de `required()`, que ahí sí se lee. */
  if (command === 'build') exigirVariables(mode);

  return {
  plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5180 },

  /* Se publica en animatsc.com/app/ — dentro del mismo repositorio
     que el sitio, pero en su propia carpeta. Así el `assets/` del build no choca
     con el `assets/` del sitio, donde vive anima.js.

     El build sale a /app en la raíz del repo y se versiona: GitHub Pages sirve
     la rama tal cual, sin Actions. Cuando Pages pase a compilar por su cuenta,
     esto vuelve a `dist/` y la carpeta se deja de versionar. */
  base: '/app/',
  build: { outDir: path.resolve(__dirname, '../app'), emptyOutDir: true }
  };
});
